// Copyright 2020 (c) Melissa Jenkins
// Part of Onglide.com competition tracking service
// BSD licence but please if you find bugs send pull request to github

const crypto = require('crypto');

// Helper
const fetcher = url => fetch(url).then(res => res.json());

// DB access
const db = require('../db')
const escape = require('sql-template-strings')


// Fix the turpoint types from SoaringSpot to what we know
const oz_types = { 'symmetric': 'symmetrical',
                   'next':  'np',
                   'previous':  'pp',
                   'fixed':  'fixed',
                   'start':  'sp' }

// Make sure it starts, but only once ;)
let isRunning = false;

// Set up background fetching of the competition
export default function startCompetitionDatabaseUpdateProcess() {

    if( ! isRunning ) {
	isRunning = true;
	
	soaringSpot(true);
	
	console.log( "Background download from soaring spot enabled" );
	
	setInterval( function() {
	    soaringSpot();
	}, 5*60*1000 );
    }
    
}
	       


//
// Function to score any type of task - checks the task type field in the database
// to decide how to delegate to the various different kinds of tasks
async function soaringSpot(deep = false) {

    // Get the soaring spot keys from database
    let keys = (await db.query(escape`
              SELECT *
                FROM soaringspotkey`))[0];

    if( ! keys.client_id || ! keys.secret ) {
        console.log( 'no soaringspot keys configured' );
        return {
            error:'no soaringspot keys configured'
        };
    }

    // If we should clean everything out or just update
    keys.deep = deep;

    // It's an enumerate API so we start at the top.  Use HTTPS, the rest of the
    // links in this code are HTTP because that is how they are returned in the JSON
    // HOWEVER! All fetches will be https because the enumeration links are all https
    const contests = await sendSoaringSpotRequest( 'https://api.soaringspot.com/v1/', keys );

    // loop through all, there probably is only one but API spec implies more than one.
    await contests._embedded['http://api.soaringspot.com/rel/contests'].forEach( async function (contest) {


        // If there are many you can filter on name in the soaringspotkey database, if that is
        // empty than accept all of then?!
        console.log( contest.name );
        if( contest.name == keys.contest_name || keys.contest_name == '' ) {

            // Update the competition global values
            await update_contest( contest, keys );

            // Update each class in the competition
            contest._embedded['http://api.soaringspot.com/rel/classes'].forEach( async function(cclass) {
		update_class( cclass, keys );
	    });
        }
    });

    console.log( 'completed updating' );
}
/*

//      # get any url for flarm results
//    $flarmurl = $db->selectrow_array("select flarmcsvurl from competition");
elsif( flarmurl ) {
fetch_flarm_csv(flarmurl,'remote');
}


# shut down and wait
db->disconnect();

# we only do this once per run, no point doing it more and it could break the UI
overwrites{hostname} = 0;
}
*/

async function update_class(compClass, keys) {

    // Get the name of the class, if not set use the type
    const name = compClass.name ? compClass.name : compClass.type;

    // Name for URLs and Database
    const classid = name
          .replace(/\s*(class|klasse)/gi,'')
          .replace(/[^A-Z0-9]/gi,'');

    // Add to the database
    await db.query( escape`
             INSERT INTO classes (class, classname, description, type )
                   VALUES ( ${classid}, ${name}, ${name}, ${compClass.type} )` );


    // Make sure we have rows for each day and that compstatus is correct
//    await db.query( escape`call contestdays()`);
    await db.query( escape`update compstatus set status=':', datecode=todcode(now())`);

    // Now add details of pilots
    await update_pilots( compClass._links.self.href, classid, name, keys );
    
    // Import the results
    await process_class_results( compClass._links.self.href, classid, name, keys );
 
    // Trackers needs a row for each pilot so fill any missing, perhaps we should
    // also remove unwanted ones
    await db.query( 'INSERT IGNORE INTO tracker ( class, compno, type, trackerid ) select class, compno, "flarm", "unknown" from pilots' );
    //  await db.query( 'DELETE FROM tracker where concat(class,compno) not in (select concat(class,compno) from pilots)' );
}


//
// generate pilot entries and results for each pilot, this needs to be done before we
// download the scores
async function update_pilots(class_url,classid,classname,keys) {

    let unknowncompno = 0;

    // Fetch the list of pilots
    const results = await sendSoaringSpotRequest( class_url+'/contestants', keys );


    await results._embedded['http://api.soaringspot.com/rel/contestants'].forEach( async function(pilot) {

        // Make sure it has a comp number
        if( ! pilot.contestant_number || pilot.contestant_number == '' || !!pilot.contestant_number.match(/(TBA|TBD)/)) {
            pilot.contestant_number = -(unknowncompno++);
        }

        // And change handicaps to BGA style
        pilot.handicap = correct_handicap( pilot.handicap );

        // Get nested data more easily
        const epilot = pilot._embedded['http://api.soaringspot.com/rel/pilot'][0];

        await db.query( escape`
             INSERT INTO pilots (class,firstname,lastname,homeclub,username,fai,country,email,
                                 compno,participating,glidertype,greg,handicap,registered,registereddt)
                  VALUES ( ${classid},
                           ${epilot.first_name}, ${epilot.last_name}, ${pilot.club}, null,
                           ${epilot.civl_id?epilot.civl_id:epilot.igc_id}, ${epilot.nationality},
                           null,
                           ${pilot.contestant_number},
                           ${pilot.not_competing?'N':'Y'},
                           ${pilot.aircraft_model},
                           ${pilot.aircraft_registration},
                           ${pilot.handicap}, 'Y', NOW() )
                  ON DUPLICATE KEY UPDATE
                           class=values(class), firstname=values(firstname), lastname=values(lastname),
                           homeclub=values(homeclub), fai=values(fai), country=values(country),
                           participating=values(participating), handicap=values(handicap),
                           glidertype=values(glidertype), greg=values(greg)`);

        // Download pictures
        if( epilot.igc_id ) {
            //      download_picture( 'http://rankingdata.fai.org/PilotImages/'+epilot.igc_id+'.jpg', pilot.contestant_number, classid);
        }
        else if( epilot.nationality && epilot.nationality.match(/^[A-Z][A-Z]/) ) {
            //      download_picture( 'http://sample.onglide.com/globalimage/flags/'+epilot.nationality+'.png', pilot.contestant_number, classid);
        }
    });

    // remove any old pilots as they aren't needed, they may not go immediately but it will be soon enough
    await db.query( 'DELETE FROM PILOTS WHERE class=${classid} AND registereddt < DATE_SUB(NOW(),15 MINUTE)');

    // And update the pilots picture to the latest one in the image table - this should be set by download_picture
    //     await db.query( 'UPDATE PILOTS SET image=(SELECT filename FROM images WHERE keyid=compno AND width IS NOT NULL ORDER BY added DESC LIMIT 1)' );
}



//
// for a given class update all the results
async function process_class_results (class_url,classid,classname,keys) {
    let rows = 0;
    let latest_date_with_pilots = undefined;

    const results = await sendSoaringSpotRequest( class_url+'/results', keys );
    if( ! results ) {
        console.log( `${classname}: no results` );
        return 0;
    }

    // make sure we have result placeholder for each day, we will fail to save scores otherwise
    await db.query( escape`INSERT IGNORE INTO pilotresult
               ( class, datecode, compno, status, lonotes, start, finish, duration, distance, hdistance, speed, hspeed, igcavailable, turnpoints )
             SELECT pilots.class, contestday.datecode,
               compno, '-', '', '00:00:00', '00:00:00', '00:00:00', 0, 0, 0, 0, 'N', -2
             FROM pilots, contestday WHERE pilots.class = contestday.class`);

    await results._embedded['http://api.soaringspot.com/rel/class_results'].forEach( async function (day) {
        const date = day.task_date;
        console.log( `${classname}: processing ${date}` );

        latest_date_with_pilots = await process_day_task( day, classid, classname, latest_date_with_pilots, keys );
        latest_date_with_pilots = await process_day_scores( day, classid, classname, latest_date_with_pilots, keys );
    });

    // update the previous total rank
    await db.query( escape`update pilotresult pr1 left outer join pilotresult pr2
               on pr1.compno = pr2.compno and pr2.datecode = todcode(date_sub(fdcode(pr1.datecode),interval 1 day))
               set pr1.prevtotalrank = coalesce(pr2.totalrank,pr2.prevtotalrank)` );

    //if we have some results then record this
    if( latest_date_with_pilots ) {
        await db.query( escape`UPDATE compstatus SET resultsdatecode = todcode(${latest_date_with_pilots}) where class=${classid}`);
    }

    console.log( `${classname}: done.` );
    return rows;
}


//
// Store the task in the DB
async function process_day_task (day,classid,classname,latest_date_with_pilots,keys) {
    let rows = 0;
    let date = day.task_date;

    const task_details = await sendSoaringSpotRequest( day._links.self.href, keys );

    let script = '';
    let info = task_details.info;
    let status = day.result_status;//.replace(/^([a-z])/\U1/; I think this uppercases first letter? but perl

    // extract UK meta data from it (this is from UK scoring script and allows for windicapping
    let windspeed = 0;
    let winddir = 0;
    if( info.match( /^UK/ ) && info.match(/Contest Wind.*deg.*kts/i) ) {
        let info1, info2;
        [script,info1,info2] = task_details.info.split( ',' );
        info = (info1+','+info2).replace(/^\s+/g,'');
        [windspeed,winddir] = info.match(/Contest Wind ([0-9]+) degs\/([0-9]+) kts/i );
    }

    let tasktype = 'S';
    let duration = '00:00';
    if( task_details.task_type == 'assigned_area' ) {
        tasktype = 'A';
        duration = new Date(task_details.task_duration * 1000).toISOString().substr(11, 8);
    }
    
    // If it is the current day and we have a start time we save it
    await db.query( escape`
            UPDATE compstatus SET starttime = COALESCE(${convert_to_mysql(task_details.no_start)},starttime)
              WHERE datecode = todcode(${date})` );

    const taskid = (await db.query( escape`
         INSERT INTO tasks (datecode, class, flown, description, distance, hdistance, duration, type, task )
             VALUES ( todcode(${date}), ${classid},
                      'P', ${task_details.task_type},
                      ${task_details.task_distance/1000},
                      ${task_details.task_distance/1000},
                      ${duration}, ${tasktype}, 'A' )`)).insertId;

    const turnpoints = await sendSoaringSpotRequest( task_details._links['http://api.soaringspot.com/rel/points'].href, keys );
    let legno = 0;

    await turnpoints._embedded['http://api.soaringspot.com/rel/points'].forEach( async function (tp) {

        // We don't handle multiple starts at all so abort
        if( tp.multiple_start != 0 ) {
            next;
        }

        // can we extract a number off the leading part of the turnpoint name, if so treat it as a trigraph
        // it must be leading, and 3 or 4 digits long and we will then strip it from the name
        let tpname = tp.name;
        let trigraph = tpname.substr(0,3);
        if( tpname && ([trigraph] = tpname.match( /^([0-9]{3,4})/))) {
            tpname = tpname.replace( /^([0-9]{3,4})/, '');
        }

        // we will save away the original name for contest day info
//        tplist[ tp.point_index ] = tp.name;

	// Add the turnpoint.  The leg length etc is from the point to the previous one
	// so start point will have 0's
        await db.query( escape`INSERT INTO taskleg ( class, datecode, taskid, legno,
                    length, bearing, nlat, nlng, Hi, ntrigraph, nname, type, direction, r1, a1, r2, a2, a12 )
               VALUES (
                 ${classid}, todcode(${date}), ${taskid}, ${tp.point_index},
                 0, 0,
                 ${toDeg(tp.latitude)},${toDeg(tp.longitude)},
                 0, ${trigraph}, ${tpname}, 
                 'sector',
                 ${oz_types[tp.oz_type]},
                 ${tp.oz_radius1/1000},
                 ${(tp.oz_line?90:toDeg(tp.oz_angle1))},
                 ${tp.oz_radius2/1000},
                 ${toDeg(tp.oz_angle2)},
                 ${tp.oz_type == 'fixed' ? toDeg(tp.oz_angle12) : 0} )`);
    });

    // This query is a little special.
    // It inserts a new day which allows competitions to score days outside of their normal declared
    // time period
    await db.query( escape`INSERT INTO contestday (class, script, length, result_type, info, winddir, windspeed, daynumber, status, 
		                                   notes, calendardate, datecode ) 
				         VALUES ( ${classid}, LEFT(${script},60), ${Math.round(day.task_distance/100)/10}, 
                                                  ${status}, ${info.substring(0,250)}, winddir, windspeed, ${day.task_number}, 'Y',
                                                  ${task_details.notes}, ${date}, todcode(${date}))
				       ON DUPLICATE KEY 
				       UPDATE turnpoints = values(turnpoints), script = LEFT(values(script),60), length=values(length), 
				          result_type=values(result_type), info=values(info), 
				          winddir=values(winddir), windspeed=values(windspeed), daynumber=values(daynumber), 
				          status=values(status), notes=values(notes), calendardate=values(calendardate)`  );

    // Remove the old task and legs for this class and date 
    await db.query( escape`DELETE FROM tasks WHERE class=${classid} AND taskid != ${taskid} AND datecode = todcode(${date})` );
    await db.query( escape`DELETE FROM tasklegs WHERE class=${classid} AND taskid != ${taskid} AND datecode = todcode(${date})` );
    await db.query( escape`UPDATE tasks SET flown='Y' taskid = ${taskid}` );

    // redo the distance calculation, including calculating handicaps
    await db.query( escape`call wcapdistance_taskid( ${taskid} )` );

    // if it is today then set the briefing status properly, this is an update so does nothing
    // if they are marked as flying etc
    await db.query( escape`UPDATE compstatus SET status='B' WHERE class=${classid} AND datecode=todcode(${date}) AND status NOT IN ( 'L', 'S', 'R', 'H', 'Z' )`);

    // and some logging
    console.log( `${classname}: processed task ${date}` ); 
    return latest_date_with_pilots;
}

async function process_day_scores (day,classid,classname,latest_date_with_pilots,keys) {
    let rows = 0;
    let date = day.task_date;

    // It's a big long list of results ;)
    await day._embedded['http://api.soaringspot.com/rel/results'].forEach( async function (row) {

        const pilot = row._embedded['http://api.soaringspot.com/rel/contestant'].contestant_number;
        const handicap = correct_handicap( row._embedded['http://api.soaringspot.com/rel/contestant'].handicap );

        const start = row.scored_start ? (new Date(row.scored_start)).getTime()/1000 : 0;
        const finish = row.scored_finish ? (new Date(row.scored_finish)).getTime()/1000 : 0;
        const duration = finish && start ? (finish - start) / 3600 : 0;

        let scoredvals = {};
        if( keys.actuals < 0 ) {
            // for the bga scoring script that includes handicapped in the decimals
	    // it's a special case, but could be used by other competitions if they want to
            let [hcapd,actuald] =  (''+row.scored_distance).split('.');
            hcapd = hcapd ? parseInt(hcapd) : 0;
	    while(actuald&&actuald.length < 7) {
		actuald += '0';
	    }
	    actuald = actuald ? parseInt(actuald) : 0;
	    
            if( duration && row.scored_distance ) {
		scoredvals.as = (actuald / 1000 / duration) /3.6;
		scoredvals.ad = actuald;
		scoredvals.hs = row.scored_speed ; //(hcapd / 10000 / duration) * 3.6);
		scoredvals.hd = hcapd;
            }
            else {
		scoredvals.as = scoredvals.hs = 0;
		scoredvals.ad = actuald;
		scoredvals.hd = hcapd;
            }
        } 
        if( keys.actuals ) { // actuals on soaring spot (fai probably)
            scoredvals.as = row.scored_speed;
            scoredvals.ad = row.scored_distance;
            scoredvals.hs = duration ? row.scored_distance/(handicap/100)/duration/3600 : 0;
            scoredvals.hd = row.scored_distance/(handicap/100);
        }
        else { //handicap on soaring spot
            scoredvals.as = duration ? row.scored_distance*(handicap/100)/duration/3600 : 0;
            scoredvals.ad = row.scored_distance*(handicap/100);
            scoredvals.hs = row.scored_speed;
            scoredvals.hd = row.scored_distance;
        }

        // If there is data from scoring then process it into the database
        if( row.status_evaluated ) {
            const r = (await db.query( escape`
                           UPDATE pilotresult
                           SET
                             start=TIME(COALESCE(${convert_to_mysql(row.scored_start)},start)),
                             finish=TIME(COALESCE(${convert_to_mysql(row.scored_finish)},finish)),
                             duration=COALESCE(TIMEDIFF(${convert_to_mysql(row.scored_finish)},${convert_to_mysql(row.scored_start)}),duration),
                             scoredstatus= ${row.scored_finish ? 'F' : 'H'},
                             status = (CASE WHEN ((status = "-" or status = "S" or status="G") and ${row.scored_finish} != "") THEN "F"
                                        WHEN   ((status = "-" or status = "S" or status="G") and ${row.igc_file} != "") THEN "H"
                                        ELSE status END),
                             datafromscoring = "Y",
                             speed=${scoredvals.as*3.6}, distance=${scoredvals.ad/1000},
                             hspeed=${scoredvals.hs*3.6}, hdistance=${scoredvals.hd/1000},
                             daypoints=${row.points}, dayrank=${row.rank}, totalpoints=${row.points_total}, totalrank=${row.rank_total}, penalty=${row.penalty}
                          WHERE datecode=todcode(${date}) AND compno=${pilot} and class=${classid}`));

//	    console.log(`${pilot}: ${handicap} (${duration} H) ${scoredvals.ad} ${scoredvals.hd}` );
            rows += r.affectedRows;

            /* this would be for downloading the igc file, not needed when just displaying live tracking
               # check to see if we need to download the igc file
               my (igcavailable,dcode) = db->selectrow_array( 'select igcavailable,todcode(?) from pilotresult '.
               ' where datecode=todcode(?) and compno=? and class=? and (select noresults from competition) != "Y"',
               undef,
               date, date, pilot, classid );

               if( (igcavailable||'Y') eq 'N' ) {
               if( download_igc( dcode, pilot, row._links->{"http://api.soaringspot.com/rel/flight"}->{'href, client_id, secret ) ) {
               db->do( 'update pilotresult set igcavailable = "Y" where datecode=? and compno=? and class=?', undef,
               dcode, pilot, classid );
               }
               }
            */

            // we need to update what we have results for
            latest_date_with_pilots = ( latest_date_with_pilots && latest_date_with_pilots > date ) ? latest_date_with_pilots : row.scored_start;
        }

        // if somebody has manually put the start times into SeeYou then capture it
        else if( row.scored_start ) {
            await db.query( escape`UPDATE pilotresult
                                            SET start=TIME(COALESCE(${convert_to_mysql(row.scored_start)},start))
                                          WHERE datecode=todcode(${date}) AND compno=${compno} and class=${classid}`);
        }

        // we will capture the total if it is there but not update the scored status as
        // that would block preliminary scoring
        if( row.points_total || row.rank_total ) {
            await db.query( escape`UPDATE pilotresult
                                            SET totalpoints=${row.points_total}, totalrank=${row.rank_total}
                                          WHERE datecode=todcode(${date}) AND compno=${pilot} and class=${classid}` );
        }
    });


    // Did anything get updated?
    if( rows ) {
        await db.query( escape`UPDATE contestday SET results_uploaded=NOW()
                                 WHERE class=${classid} AND datecode=todcode(${date}) and STATUS != "Z"`);
    }

    // rescore the day, but only for preliminary results
    const status = day.result_status.toLowerCase();
    if( status == 'preliminary' ) {
        await db.query( escape`call daypoints(${classid})` );
    }

    return latest_date_with_pilots;
}



//
// We will now update the competition object, this isn't a new object
// as you will possibly want to tweak values in it!
//
async function update_contest(contest,keys) {

    //
    // Make sure the dates are copied across
    await db.query( escape`
         UPDATE competition SET start = ${contest.start_date},
                                  end = ${contest.end_date},
                                  countrycode = ${contest.country},
                                  name = ${contest.name}`);


    // If we have a location then update
    const location = contest._embedded['http://api.soaringspot.com/rel/location'];
    if( location && location.latitude ) {
        const lat = toDeg(location.latitude);
        const lng = toDeg(location.longitude);
        await db.query( escape`UPDATE competition SET lt = ${lat}, lg = ${lng},
                                                      sitename = ${location.name}`);
    }

    const dbtz = (await db.query( escape`
           SELECT tz, (TIMEDIFF(CONVERT_TZ(NOW(),'+00:00',${contest.time_zone}),NOW())) newtz
             FROM competition`))[0];

//    console.log(dbtz);

    // Extract timezone
    // probably wrong for tz 00:00, think it's in the ocean
    let newtz = dbtz.newtz.replace(/^[0]*/,'').replace(/:00/,'');
//    console.log( "current tz: "+dbtz.tz+" changing to "+newtz);
    if( newtz != dbtz.tz ) {
        await db.query( escape`UPDATE competition set tz=${newtz}`);
    }

    // And fix the URL to whatever is configured in soaringspot
    await db.query( escape`UPDATE competition set siteroot=${contest._links['http://api.soaringspot.com/rel/www']}` );

    if( keys.deep ) {
	// clear it all down, we will load all of this from soaring spot
	// NOTE: this should not be cleared every time, even though at present it is
	// TBD!!
	await db.query( escape`delete from classes` );
	await db.query( escape`delete from logindetails where type="P"` );
	await db.query( escape`delete from pilots` );
	await db.query( escape`delete from pilotresult` );
	await db.query( escape`delete from contestday` );
	await db.query( escape`delete from compstatus` );
	await db.query( escape`delete from taskleg` );
	await db.query( escape`delete from tasks` );
	console.log('deep update requested, deleted everything');
    }
}


//
// Fetch values from the soaringpot api
//
async function sendSoaringSpotRequest( url, keys ) {

    // This is used to confirm all is fine
    const nonce = crypto.randomBytes(30).toString('base64');

    // Form the message
    const dt = new Date().toISOString();
    const message = nonce + dt + keys.client_id;



    // And hash it
    const hash = crypto.createHmac('sha256', keys.secret).update(message).digest('base64');
    const auth_header = 'http://api.soaringspot.com/v1/hmac/v1 ClientID="'+keys.client_id+'", Signature="'+hash+'", Nonce="'+nonce+'", Created="'+dt+'"';

    return fetch( url, {
        headers: {
            'Authorization': auth_header
        }
    }).then(res => res.json());
}

// Get rid of the T at the front...
function convert_to_mysql(jsontime) {
    return jsontime ? jsontime.replace(/^.*T/, '') : jsontime;
}

// From radians
function toDeg(a) {
    return a/Math.PI*180;
}

//
// All the bizarre forms of handicap that have been spotted in scoring spot
function correct_handicap(handicap) {
    return ( !handicap ? 100 : ( handicap<2 ? handicap*100 : ( handicap > 140 ? handicap/10 : handicap)));
}
