#!/usr/bin/env node

// Copyright 2020 (c) Melissa Jenkins
// Part of Onglide.com competition tracking service
// BSD licence but please if you find bugs send pull request to github

const crypto = require('crypto');

const tabletojson = require('tabletojson').Tabletojson;
const htmlparser = require('htmlparser2');

const { findOne, findAll, existsOne, 
		removeElement,
		getChildren,
		getInnerHTML, getOuterHTML, textContent } = require('domutils');


// Helper
const fetcher = url => fetch(url).then(res => res.json());

// We use these to get IGCs from SoaringSpot streaming
var readline = require('readline');
var https = require('https');
var http = require('http');
const { point } = require ( '@turf/helpers' );
const distance = (require( '@turf/distance' )).default;
const { getElevationOffset } = require('../lib/getelevationoffset.js');
// handle unkownn gliders
const { capturePossibleLaunchLanding } = require('../lib/launchlanding.js');


const _groupby = require('lodash.groupby');
const _foreach = require('lodash.foreach');
const _reduce = require('lodash.reduce');

// DB access
//const db = require('../db')
const escape = require('sql-template-strings')
const mysql = require('serverless-mysql')();
const fetch = require('node-fetch');

let cnhandicaps = {};

// Fix the turpoint types from SoaringSpot to what we know
//const oz_types = { 'Line': 'send',
  //                 'next':  'np',
    //               'previous':  'pp',
      //             'fixed':  'fixed',
        //           'start':  'sp' }


// Load the current file
const dotenv = require('dotenv').config({ path: '.env.local' })
const config = dotenv.parsed;

// Location information, fetched from DB
var location;

// Set up background fetching of the competition
async function main() {

    if (dotenv.error) {
        console.log( "New install: no configuration found, or script not being run in the root directory" );
        process.exit();
    }

    mysql.config({
        host: config.MYSQL_HOST,
        database: config.MYSQL_DATABASE,
        user: config.MYSQL_USER,
        password: config.MYSQL_PASSWORD
    });

	console.log(config);

	// Now get data from soaringspot
    rst();

    console.log( "Background download from soaring spot enabled" );
    setInterval( function() {
        rst();
    }, 5*60*1000 );
}


main()
    .then("exiting");

async function rst(deep = false) {

	// Get the soaring spot keys from database
    let keys = (await mysql.query(escape`
              SELECT *
                FROM soaringspotkey`))[0];

    if( ! keys ) {
        console.log( 'no soaringspot keys configured' );
        return {
            error:'no soaringspot keys configured'
        };
    }

	let hcaps = {};
	
	fetch( keys.secret )
		.then( res => res.text() )
		.then( body => {
			var dom = htmlparser.parseDocument(body);
			var competitionnames = [];
			const headings = findAll( (li) => (li.name == 'li'
											   && li?.attribs?.class == 'TabbedPanelsTab'
											   && li?.parent?.parent?.attribs?.id == 'TabbedPanelsIHcup'),
									  
									  findAll( (tab) => (tab.name == 'div' && tab?.attribs?.id == 'TabbedPanelsIHcup'),
											   dom.children ));

			
			for (const h of headings) {
				competitionnames.push( textContent(h));
			}

			// Get the handicaps from the result
			const gliders = findOne( (li) => (li.attribs?.id == 'id_idglider_fk'), dom.children );
			for ( const g of getChildren(gliders) ) {
				const matches = textContent( g ).match( /^([A-Z0-9]+[ -][A-Z0-9]+)\s.*koeff=([0-9]+)/ );
				if( matches ) {
					hcaps[ matches[1] ] = parseInt( matches[2] );
				}
			}

			// Now extract the competitions
			console.log( "***********" );
			const matches = findAll( (test) =>
				{ return (test.name == 'div'
						  && test?.attribs?.id?.match(/TabbedPanelsIHcup[0-9]+/))
				}, dom.children );

			console.log( `found ${matches.length} competitions on RST` );
			console.log( competitionnames );
			console.log( `looking for competition ${keys.contest_name}` );

			let mnumber = 0;
			for( const m of matches ) {

				// Check to see if it is our configured competition, if it is then we will also extract the className from the name
				// it's considered to be anything after the competition name excluding leading whitespace
				const identity = competitionnames[mnumber].match( new RegExp(keys.contest_name + '\s*(.*)$', 'i') );
//				const identity = competitionnames[mnumber].match( keys.contest_name, 'i' );
				if( identity ) {
					const className = identity[1];
					console.log( "processing", className );
					
					const removes = findAll( (test) => (test.name == 'select'), m.children );
					for ( const r of removes ) {
						removeElement( r );
					}

					// Array of section headers
					const sectionHeaders = findAll( (test) => (test.name == 'li' && test.attribs?.class == 'TabbedPanelsTab' ), m.children );
					
					// Array of the sections themselves
					const sections = findAll( (test) => (test.name == 'div' && test.attribs?.class == 'TabbedPanelsContent' ), m.children );
					
					let mapped = {};
					let mappedHtml = {};
					
					for( let i = 0; i < sectionHeaders.length; i++ ) {
						const sh = textContent(sectionHeaders[i]);
						mapped[ sh ] = tabletojson.convert( getInnerHTML(sections[i]), { stripHtmlFromCells: true});
						mappedHtml[ sh ] = tabletojson.convert( getInnerHTML(sections[i]), { stripHtmlFromCells: false});
					}

					update_contest( keys.contest_name, mapped[ 'Info' ] );
					
					// Put data into the database
					update_class( className, mapped, mappedHtml, hcaps );
					console.log("===");
				}
				mnumber = mnumber+1;
			}
			console.log( "done." );
		});

};


async function update_class(className, data, dataHtml, hcaps ) {

    // Get the name of the class, if not set use the type
    const nameRaw = className

    // Name for URLs and Database
    const classid = nameRaw
          .replace(/\s*(class|klasse)/gi,'')
          .replace(/[^A-Z0-9]/gi,'')
          .substring(0,14);

	const name = nameRaw
		  .replace(/[_]/gi, ' ');

    // Add to the database
    await mysql.query( escape`
             INSERT INTO classes (class, classname, description, type )
                   VALUES ( ${classid}, ${name.substr(0,29)}, ${name}, 'club' )
                    ON DUPLICATE KEY UPDATE classname=values(classname), description=values(description),
                                            type=values(type) `);

    await mysql.query( escape`insert ignore into compstatus (class) values ( ${classid} )` );

    // Make sure we have rows for each day and that compstatus is correct
    //    await mysql.query( escape`call contestdays()`);
    await mysql.query( escape`update compstatus set status=':', datecode=todcode(now())`);

    // Now add details of pilots
    await update_pilots( classid, data[ 'Piloter' ], hcaps );

    // Import the results
    await process_class_tasks_and_results( classid, className, dataHtml );
}


//
// generate pilot entries and results for each pilot, this needs to be done before we
// download the scores
async function update_pilots(classid, data, hcaps) {

    let unknowncompno = 0;
	let pilotnumber = 0;

    // Start a transaction for updating pilots
    let t = mysql.transaction();

    for ( const pilot of data[0] ) {

        // Make sure it has a comp number
        if( ! pilot.Reg || pilot.Reg == '' ) {
            pilot.contestant_number = -(unknowncompno++);
			console.log( "Skipping pilot as no registration", pilot );
			continue;
        }

		let regsplit = pilot.Reg.match( /^([A-Z0-9]+[- ][A-Z0-9]+)\s+([A-Z0-9]+)$/ );
		if( ! regsplit ) {
			regsplit = pilot.Reg.match( /^([A-Z0-9]+)[- ]([A-Z0-9]+)$/ );
			if( ! regsplit ) {
				console.log( "can't match registration", pilot.Reg );
				continue;
			}
			regsplit[1] = regsplit[1] + '-' + regsplit[2];
		}
		
		// And change handicaps to BGA style
		const greg = regsplit[1];
		const compno = regsplit[2];
		const handicap = correct_handicap( hcaps[ greg ] );
		cnhandicaps[classid+"_"+compno] = handicap;
		
		pilotnumber = pilotnumber+1;
		t.query( escape`
             INSERT INTO pilots (class,firstname,lastname,homeclub,username,fai,country,email,
                                 compno,participating,glidertype,greg,handicap,registered,registereddt)
                  VALUES ( ${classid},
                           ${pilot.Pilot}, ${pilot.Copilot}, ${pilot.Klubb}, null,
                           ${pilotnumber}, 'SE',
                           null,
                           ${compno},
                           'Y',
                           ${pilot.Segelflygplan},
                           ${greg},
                           ${handicap}, 'Y', NOW() )
                  ON DUPLICATE KEY UPDATE
                           class=values(class), firstname=values(firstname), lastname=values(lastname),
                           homeclub=values(homeclub), fai=values(fai), country=values(country),
                           participating=values(participating), handicap=values(handicap),
                           glidertype=values(glidertype), greg=values(greg), registereddt=NOW()`);
	}

    // remove any old pilots as they aren't needed, they may not go immediately but it will be soon enough
    t.query( escape`DELETE FROM pilots WHERE class=${classid} AND registereddt < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`)


    // Trackers needs a row for each pilot so fill any missing, perhaps we should
    // also remove unwanted ones
        .query( 'INSERT IGNORE INTO tracker ( class, compno, type, trackerid ) select class, compno, "flarm", "unknown" from pilots' )
    //  .query( 'DELETE FROM tracker where concat(class,compno) not in (select concat(class,compno) from pilots)' );

    // And update the pilots picture to the latest one in the image table - this should be set by download_picture
    //   .query( 'UPDATE PILOTS SET image=(SELECT filename FROM images WHERE keyid=compno AND width IS NOT NULL ORDER BY added DESC LIMIT 1)' );

        .rollback( e => { console.log("rollback") } )
        .commit();
}


//
// for a given class update all the tasks
async function process_class_tasks_and_results (classid, className, data ) {

    let rows = 0;
	//    let date = day.task_date;
    for ( const day of Object.keys(data) ) {

		const matches = day.match( /Dag ([0-9]+)$/, 'i' );
		if( matches ) {

			const day_number = matches[1];
			const day_data = data[day];

			const dbdate = (await mysql.query( escape`SELECT DATE_ADD(start, INTERVAL ${day_number-1} DAY) date FROM competition` ));
			const date = dbdate[0].date;

			const day_info = day_data[0];
			const task_info = day_data[1];
			const results = day_data[2];

			process_class_task( classid, className, date, day_number, day_info, task_info );
			process_class_results( classid, className, date, day_number, results);
		}
	}
}

async function process_class_task (classid, className, date, day_number, day_info, task_info ) {
	let script = '';
	let info = '';
	let status = '';
	
	// extract UK meta data from it (this is from UK scoring script and allows for windicapping
	let windspeed = 0;
	let winddir = 0;
	let tasktype = 'S';
	let tasktype_long = 'Speed';
	let duration = '00:00';
	let task_distance = 0;
	
	if( day_info ) {
		info = [day_info[0]?.Distans, day_info[0]?.Minimitid, day_info[1]?.Minimitid].join(' ');

		task_distance = (parseFloat( day_info[0]?.Minimitid || day_info[0]?.Distans ));

		// Check for AAT
		if( day_info[1]?.Minimitid ) {
			duration = day_info[1]?.Minimitid;
			tasktype = 'A';
			tasktype_long = 'AAT';
		}
	}

	if( task_info ) {
		const tps = _reduce(task_info, function(text,v) { return [text,v.Label,v.Brytpunkt,v.Radie].join('_'); }, '');
		const hash = crypto.createHash('sha256').update(info).update(tps).digest('base64');
		const dbhashrow = (await mysql.query( escape`SELECT hash FROM tasks WHERE datecode=todcode(${date}) AND class=${classid}` ));
		if( (dbhashrow && dbhashrow.length > 0) && hash == dbhashrow[0].hash ) {
			return;
		}
		else {
			console.log( `${classid} - ${date}: task changed` );
			console.log(tps);
		}
		
		// Do this as one block so we don't end up with broken tasks
		mysql.transaction()

		// If it is the current day and we have a start time we save it
		//        .query( escape`
		//          UPDATE compstatus SET starttime = COALESCE(${convert_to_mysql(task_details.no_start)},starttime)
		//          WHERE datecode = todcode(${date})` )

		// remove any old crud
			.query( escape`DELETE FROM tasks WHERE datecode=todcode(${date}) AND class=${classid} AND task='B'` )

		// and add a new one
			.query( escape`
          INSERT INTO tasks (datecode, class, flown, description, distance, hdistance, duration, type, task, hash )
             VALUES ( todcode(${date}), ${classid},
                      'N', ${tasktype_long},
                      ${task_distance},
                      ${task_distance},
                      ${duration}, ${tasktype}, 'B', ${hash} )`)

		// This query is a built one as we have to have it all as one string :( darn transactions

			.query( (r) => {
				const taskid = r.insertId;
				if( ! taskid ) {
					console.log( `${classid} - ${date}: unable to insert task!` );
					return null;
				}
				if( !task_info || !task_info.length ) {
					console.log( `${classid} - ${date}: no turnpoints for task` );
					throw "oops";
					return null;
				}

				let values = [];
				let query = "INSERT INTO taskleg ( class, datecode, taskid, legno, "+
					"length, bearing, nlat, nlng, Hi, ntrigraph, nname, type, direction, r1, a1, r2, a2, a12 ) "+
					"VALUES ";

				let point_index = 0;
				for ( const tp of task_info ) {
					// can we extract a number off the leading part of the turnpoint name, if so treat it as a trigraph
					// it must be leading, and 3 or 4 digits long and we will then strip it from the name
					let tpname = tp.Brytpunkt;
					let trigraph = tpname?.substr(0,3);
					if( tpname && ([trigraph] = (tpname.match( /^([0-9]{3,4})/)||[]))) {
						tpname = tpname.replace( /^([0-9]{3,4})/, '');
					}

					query = query + "( ?, todcode(?), ?, ?, 0,0, ?, ?, 0, ?, ?, 'sector', ?, ?, ?, ?, ?, ? ),";

					values = values.concat( [
						classid, date, taskid, point_index,
						toDeg(tp.Latitud),toDeg(tp.Longitud),
						trigraph, tpname,
						point_index > 0 ? 'symmetrical' : 'np',
						parseFloat(tp.Radie),
						(tp.Typ == 'Line'?90:0),
						0, 0, 0 ]);

					point_index++;
				}

				query = query.substring(0,query.length-1);
				// This is done in the chaining
				return [ query, values ];
			})

		// Remove the old task and legs for this class and date
			.query( (r,ro) => { const taskid = ro[1].insertId;
								return ['DELETE FROM tasks WHERE class=? AND taskid != ? AND datecode = todcode(?)', [classid,taskid,date]]; })
			.query( (r,ro) => { const taskid = ro[1].insertId;
								return ['DELETE FROM taskleg WHERE class=? AND taskid != ? AND datecode = todcode(?)', [classid,taskid,date]]; })
			.query( (r,ro) => { const taskid = ro[1].insertId;
								return ['UPDATE tasks SET task="A", flown="Y" WHERE class=? AND taskid = ?',[classid,taskid]]; })

		// redo the distance calculation, including calculating handicaps
			.query( (r,ro) => { const taskid = ro[1].insertId;
								console.log( "WCAP DIS", taskid, ro );
								return ['call wcapdistance_taskid( ? )', [taskid]]; })

		// make sure we have result placeholder for each day, we will fail to save scores otherwise
			.query( escape`INSERT IGNORE INTO pilotresult
               ( class, datecode, compno, status, lonotes, start, finish, duration, distance, hdistance, speed, hspeed, igcavailable, turnpoints )
             SELECT ${classid}, todcode(${date}),
               compno, '-', '', '00:00:00', '00:00:00', '00:00:00', 0, 0, 0, 0, 'N', -2
             FROM pilots WHERE pilots.class = ${classid}`)

		// And update the day with status and text etc
			.query( escape`INSERT INTO contestday (class, script, length, result_type, info, winddir, windspeed, daynumber, status,
                                                   notes, calendardate, datecode )
                                         VALUES ( ${classid}, LEFT(${script},60), ${task_distance},
                                                  ${status}, ${info.substring(0,250)}, winddir, windspeed, ${day_number}, 'Y',
                                                  '', ${date}, todcode(${date}))
                                       ON DUPLICATE KEY
                                       UPDATE turnpoints = values(turnpoints), script = LEFT(values(script),60), length=values(length),
                                          result_type=values(result_type), info=values(info),
                                          winddir=values(winddir), windspeed=values(windspeed), daynumber=values(daynumber),
                                          status=values(status), notes=values(notes), calendardate=values(calendardate)`  )

		// if it is today then set the briefing status properly, this is an update so does nothing
		// if they are marked as flying etc. If the day is cancelled we want that updated here as well
		// Status not used at present but a way of keeping track of if they are flying etc.
//			.query( () => {
//				if( day.result_status != "cancelled" )
//					return ["UPDATE compstatus SET status='B' WHERE class=? AND datecode=todcode(?) AND status NOT IN ( 'L', 'S', 'R', 'H', 'Z' )", [classid,date]];
//				else
//					return ["UPDATE compstatus SET status='Z' WHERE class=? AND datecode=todcode(?)", [classid,date]];
//			})

		// If it was cancelled then mark it as not flown, this will stop the UI from displaying it
//			.query( () => {
//				if( day.result_status == "cancelled" )
//					return [ 'UPDATE tasks SET flown="N" WHERE class=? AND datecode=todcode(?)', [classid,date]];
//				else
//					return null;
//			})
//			.query( () => {
//				if( day.result_status == "cancelled" )
//					return [ 'UPDATE contestday SET status="N" WHERE class=? AND datecode=todcode(?)', [classid,date]];
//				else
//					return null;
//			})
		// Combine results
		//  .query( escape`update pilotresult pr1 left outer join pilotresult pr2
		//               on pr1.compno = pr2.compno and pr2.datecode = todcode(date_sub(fdcode(pr1.datecode),interval 1 day))
		//               set pr1.prevtotalrank = coalesce(pr2.totalrank,pr2.prevtotalrank)` )

		// Update the last date for results
			.query( escape`UPDATE compstatus SET resultsdatecode = GREATEST(todcode(${date}),COALESCE(resultsdatecode,todcode(${date})))
                       WHERE class=${classid}`)

			.rollback( (e) => { console.log( "rollback" ); } )
			.commit();

		// and some logging
		console.log( `${classid}: processed task ${date}` );
	}
}

async function process_class_results (classid, className, date, day_number, results_info ) {
    let rows = 0;
	let checkForOGNMatches = false;

	if( ! results_info || results_info.length < 0 ) {
		console.log( `${className}: ${date} - no results` );
		return;
	}


    // It's a big long list of results ;)
    for ( const row of results_info ) {

		if( row.Pos == 'DNF' ) {
			continue;
		}

		let pilotExtractor = row.CN.match( /^<a .*href="([^"]+)">.*?([A-Z0-9]+)<.a>$/, 'i' );
		if( ! pilotExtractor ) {
			console.log( `${date} ${className} ${row.CN} - no IGC file available` );
			pilotExtractor = [ undefined, row.CN ];
		}

        const pilot = pilotExtractor[2];
		const url = pilotExtractor[1] ? 'http://www.rst-online.se/' + pilotExtractor[1] : undefined;
        const handicap = correct_handicap( cnhandicaps[classid+"_"+pilot] );

		function cDate(d) {
			if( d == undefined ) {
				return undefined;
			}
			let x = new Date(date);
			const p = d.match(/([0-9]{2}):([0-9]{2}):([0-9]{2})/);
			x.setUTCHours( p[1] );
			x.setUTCMinutes( p[2] );
			x.setUTCSeconds( p[3] );
			return x;
		}

		function cHour(d) {
			if( d == undefined ) {
				return undefined;
			}
			const p = d.match(/([0-9]{2}):([0-9]{2}):([0-9]{2})/);
			return parseInt(p[1]) + parseInt(p[2])/60 + parseInt(p[3])/3600;
		}

        const start = row.Start ? (cDate(row.Start).getTime()/1000) : 0;
        const finish = row.Tid != '' ? (cDate(row['M�l']).getTime()/1000) : 0;
        const duration = (finish && start) ? (finish - start) : 0 ;

//		console.log( pilot, start, finish, duration );
		
            // for the bga scoring script that includes handicapped in the decimals
            // it's a special case, but could be used by other competitions if they want to
        const actuals = parseFloat( row.Hastighet );
		const actuald = parseFloat( row.Distans );
		 
        let scoredvals = {};
		scoredvals.as = actuals;
        scoredvals.ad = actuald;
        scoredvals.hs = actuals/(handicap/100);
        scoredvals.hd = actuald/(handicap/100);
//		console.log( pilot, date, scoredvals, actuals, actuald, duration );

		const finished = parseFloat(row.Hastighet) > 0;
		
        // If there is data from scoring then process it into the database
		// NOTE THE TIMES ARE UTC not local so we to convert back to local
        if( row['M�l'] != '' || finished ) {
            const r = (await mysql.query( escape`
                           UPDATE pilotresult
                           SET
		                     start=TIME(from_unixtime(${start}+(SELECT tzoffset FROM competition))),
		                     finish=TIME(from_unixtime(${finish}+(SELECT tzoffset FROM competition))),
                             duration=TIME(from_unixtime(${duration})),
                             scoredstatus= ${finished > 0 ? 'F' : 'H'},
                             status = (CASE WHEN ((status = "-" or status = "S" or status="G") and ${finished} != "") THEN "F"
                                        WHEN   ((status = "-" or status = "S" or status="G") and ${row['M�l']} != "") THEN "H"
                                        ELSE status END),
                             datafromscoring = "Y",
                             speed=${scoredvals.as}, distance=${scoredvals.ad},
                             hspeed=${scoredvals.hs}, hdistance=${scoredvals.hd},
                             daypoints=${row['Po�ng'].replace(' ','')}, dayrank=${row.Pos}, totalpoints=${0}, totalrank=${0}, penalty=${0}
                          WHERE datecode=todcode(${date}) AND compno=${pilot} and class=${classid}`));

            //          console.log(`${pilot}: ${handicap} (${duration} H) ${scoredvals.ad} ${scoredvals.hd}` );
            rows += r.affectedRows;

            // check the file to check tracking details
            let { igcavailable } = (await mysql.query( escape`SELECT igcavailable FROM pilotresult
                                                              WHERE datecode=todcode(${date}) and compno=${pilot} and class=${classid}` ))[0]||{igcavailable:false};
            if( (igcavailable||'Y') == 'N' && url ) {
				console.log( date, pilot, igcavailable );
				await processIGC( classid, pilot, location.altitude, date, url);
				checkForOGNMatches = true;
			}
		}
    }


	// If we processed an IGC file we should check to see if we have an OGN launch/landing match
	if( checkForOGNMatches ) {
		
		// Check what ones we have (simplier to do as two queries)
		const trackersRaw = (await mysql.query( escape`SELECT compno, trackerid FROM tracker WHERE class=${classid}` ));
		const trackers = _groupby( trackersRaw, 'compno' );

		// Find the potential associations
		const key = [date.getDate(),classid,'%'].join('/');
		const matchesRaw = (await mysql.query( escape`SELECT mo.id flarmid, mi.id glider, group_concat(mi.action ORDER BY mi.action) actions FROM movements mo 
                                                            JOIN movements mi ON mo.action = mi.action and abs(truncate(mo.time/30,0)-truncate(mi.time/30,0)) < 4 and mo.id != mi.id 
                                                            WHERE mi.type='igc' and mo.type='flarm' and mi.id like ${key} 
                                                            GROUP BY 1,2 
                                                            HAVING actions='landing,launch'`));
		if( ! matchesRaw || ! matchesRaw.length ) {
			console.log( `${date} ${classid}: no IGC/OGN matches found` );
		}
		else {

			// Collect duplicates, if we have more than one match then we must ignore it
			const matches = _groupby( matchesRaw, 'glider' );
			
			console.log( `${date} ${classid}: ${Object.keys(matches).length} matches found` );
			
			_foreach(matches, (mx) => {
				const m = mx[0];

				// Get compno and make sure it's valid
				const mCompno = m.glider.split('/')[2];
				if( ! (mCompno in trackers) ) {
					console.log( `${date} ${classid} - ${mCompno} missing from tracker table` );
				}

				// Make sure there is only one match, if there are two then we ignore it
				if( mx.length > 1 ) {
					console.log( `${date} ${classid} - ${mCompno} skipping launch matching as duplicate flarm launch times` );
					return;
				}

				// Check what is in the tracker table
				const flarmid = trackers[mCompno]?.[0].trackerid;
				if( flarmid == 'unknown' ) {
					console.log( `${date} ${classid} - ${mCompno} associated to ${m.flarmid} from takeoff/landing time match` );
					
					// Do an associate and log that we did (or tried)
					mysql.transaction()
						.query( escape`UPDATE tracker SET trackerid = ${m.flarmid} 
                                                WHERE compno = ${mCompno} AND class = ${classid} AND trackerid="unknown" limit 1` )
						.query( escape`INSERT INTO trackerhistory (compno,changed,flarmid,launchtime,method) VALUES ( ${mCompno}, now(), ${m.flarmid}, now(), "tltimes" )`)
						.commit();
				}
				else {
					if( flarmid != m.flarmid ) {
						console.log( `${date} ${classid} - ${mCompno} already has ID ${flarmid} but matched ${m.flarmid} from takeoff/landing time match` );
					}
				}
			} );
		}
	}
	
    // Did anything get updated?
    if( rows ) {
        await mysql.query( escape`UPDATE contestday SET results_uploaded=NOW()
                                 WHERE class=${classid} AND datecode=todcode(${date}) and STATUS != "Z"`);
    }

    // rescore the day, but only for preliminary results
    //    const status = day.result_status.toLowerCase();
    //    if( status == 'preliminary' ) {
    //        await db.query( escape`call daypoints(${classid})` );
    //    }
}



//
// We will now update the competition object, this isn't a new object
// as you will possibly want to tweak values in it!
//
async function update_contest(contest_name, info) {

	// All we know is what date range we have
	console.log( info[0] );

    // Add a row if we need to
    const count = (await mysql.query( 'SELECT COUNT(*) cnt FROM competition' ));
    if( ! count || !count[0] || ! count[0].cnt ) {
        console.log( "Empty competition, pre-populating" );
        mysql.query( 'INSERT IGNORE INTO competition ( tz, tzoffset, mainwebsite ) VALUES ( "Europe/Stockholm", 7200, "http://www.rst-online.se/RSTmain.php?main=excup&cmd=list&excup=list&sub=EX" )' );
    }


	for( const i of info[0] ) {
		//		for( const v of i ) {
		{
			const v = i[ 'Max antal deltagare' ];
			const matches = v.match( /([0-9]{4}-[0-9]{2}-[0-9]{2}) till ([0-9]{4}-[0-9]{2}-[0-9]{2})/ );
			if( matches ) {
				
				//
				// Make sure the dates are copied across
				await mysql.query( escape`
         UPDATE competition SET start = ${matches[1]},
                                  end = ${matches[2]},
                                  countrycode = 'SE',
                                  name = ${contest_name}`);
			}
		}
	}

    // If we have a location then update
	const ssLocation = undefined;
//	if( ssLocation && ssLocation.latitude ) {
  //      const lat = toDeg(ssLocation.latitude);
  //  //    const lng = toDeg(ssLocation.longitude);
//        await mysql.query( escape`UPDATE competition SET lt = ${lat}, lg = ${lng},
    //                                                  sitename = ${ssLocation.name}`);
    location = (await mysql.query( escape`SELECT lt, lg FROM competition`))[0];

		// Save four our use
	location.point = point( [location.lt, location.lg] );

	// Calculate elevation so we can do launch calculations from the IGC files
	getElevationOffset( config, location.lt, location.lg,
						(agl) => { location.altitude = agl;console.log('SITE Altitude:'+agl) });

    if( 0 ) { //keys.deep ) {
        // clear it all down, we will load all of this from soaring spot
        // NOTE: this should not be cleared every time, even though at present it is
        // TBD!!
        mysql.transaction()
            .query( escape`delete from classes` )
            .query( escape`delete from logindetails where type="P"` )
            .query( escape`delete from pilots` )
            .query( escape`delete from pilotresult` )
            .query( escape`delete from contestday` )
            .query( escape`delete from compstatus` )
            .query( escape`delete from taskleg` )
            .query( escape`delete from tasks` )
            .commit();
        console.log('deep update requested, deleted everything');
    }
}

//
// Get an IGC file from soaring spot so we can process it
async function processIGC( classid, compno, airfieldalt, date, url ) {
	console.log(date);

	// IGC files may be from a Flarm, if they are then we can extract the flarm ID from them
	// and associate it with the device
	let flarm_lfla = new RegExp(/LFLA[0-9]+ID [0-9] ([0-9A-F]{6})/i );
	let flarm_lxvfla = new RegExp(/LLXVFLARM:LXV,[0-9.]+,([0-9A-F]{6})/i );
	let brecord = new RegExp(/^B([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{3})([NS])([0-9]{3})([0-9]{2})([0-9]{3})([EW])A([0-9]{5})([0-9]{5})/i);
	let hfdte = new RegExp(/^HFDTE([0-9]{2})([0-9]{2})([0-9]{2})/i);
	let hfdtedate = new RegExp(/^HFDTEDATE:([0-9]{2})([0-9]{2})([0-9]{2})/i);

	// This will be captured from the header hfdte record, file isn't valid without hfdte record
	let epochbase = 0;
	let validFile = false;

	// Used to track state and updated into the database we use the day of the month
	// because in node these could be executed in parallel
	let key = [date.getDate(),classid,compno].join('/');

	// De-escape it
	url = url.replaceAll( '&amp;', '&' );

	// Initiate a streaming request
	let request = http
		.get(url,
			 function(response) {
				 var myInterface = readline.createInterface({
					 input: response
				 });
				 
				 myInterface.on( 'close', () => {
					 mysql.query( escape`UPDATE pilotresult SET igcavailable=${validFile?'P':'F'} WHERE datecode=todcode(${date}) and compno=${compno} and class=${classid}` );
					 if( validFile ) {
						 console.log( `processed ${date} ${classid} - ${compno} successfully` );
					 }
				 });
				 
				 // For each line in the response
				 myInterface.on( 'line', (line) => {

					 var matches;

					 // We will also look for takeoffs and landings just in case
					 // we need a date record in the file to form a valid time
					 if( epochbase && (matches = line.match( brecord ))) {

						 // Get the file time, will be UTC convert to seconds
						 const time = (parseInt(matches[1]) * 3600)
							   + (parseInt(matches[2]) * 60)
							   + parseInt(matches[3])
							   + epochbase;

						 // Extract lat & lng
						 let lat = (parseInt(matches[4])) + (parseInt(matches[5])/60) + (parseInt(matches[6])/1000)/60;
						 let lng = (parseInt(matches[8])) + (parseInt(matches[9])/60) + (parseInt(matches[10])/1000)/60;

						 if( matches[7] == 'S' ) {
							 lat = -lat;
						 }

						 if( matches[11] == 'W' ) {
							 lng = -lng;
						 }
						 const jPoint = point( [lat, lng] );

						 // Use GPS if present otherwise use pressure altitude, less drift during the day
						 let alt = parseInt(matches[13] ? matches[13] : matches[12]);

						 if( distance( jPoint, location.point, { units: 'kilometers' } ) < 20 ) {

							 // We are valid if we have a point within 20km of configured airfield
							 // will also require epochbase to be set to make it this far
							 validFile = true;

							 // Now we need to check if it is a launch or landing point
							 // yes some files contain this information but we use same algo
							 // for flarm so hopefully a closer match
							 capturePossibleLaunchLanding( key, time,
														   jPoint, alt - airfieldalt,
														   mysql, 'igc' );
						 }
					 }

					 
					 // If the file contains a flarm ID then we can just use that and be done
					 else if( (matches = line.match( flarm_lfla )) || (matches = line.match( flarm_lxvfla ))) {
						 let flarmId = matches[1];
						 console.log( ` SoaringSpot IGC for ${classid}:${compno} contains flarm id ${flarmId}`)

						 // Do an associate and log that we did (or tried)
						 mysql.transaction()
							 .query( escape`UPDATE tracker SET trackerid = ${flarmId} WHERE
                                      compno = ${compno} AND class = ${classid} AND trackerid="unknown" limit 1` )
							 .query( escape`INSERT INTO trackerhistory (compno,changed,flarmid,launchtime,method) VALUES ( ${compno}, now(), ${flarmId}, now(), "igcfile" )`)
							 .commit();

						 // We may not have processed it but we did get useful information from it so that's
						 // good enough
						 validFile = true;
					 }

					 // Get the file date
					 else if( (matches = line.match( hfdte )) || (matches = line.match( hfdtedate )) ) {
						 const fileDate = `20${matches[3]}-${matches[2]}-${matches[1]}`;
						 epochbase = Math.round(new Date(fileDate).getTime()/1000);
					 }
					 
				 });
			 });
}

// Get rid of the T at the front...
function convert_to_mysql(jsontime) {
    return jsontime ? jsontime.replace(/^.*T/, '') : jsontime;
}

// From radians
function toDeg(a) {
	const lt = a.match( /([NS])([0-9]{2}):([0-9]{2}):([0-9]{2})/ );
	if( lt ) {
		return (lt[1] == 'S' ? -1 : 1) *
			parseInt(lt[2]) +
			parseInt(lt[3])/60 +
			parseInt(lt[4])/3600;
	}
	const lg = a.match( /([EW])([0-9]{2,3}):([0-9]{2}):([0-9]{2})/ );
	if( lg ) {
		return (lg[1] == 'W' ? -1 : 1) *
			parseInt(lg[2]) +
			parseInt(lg[3])/60 +
			parseInt(lg[4])/3600;
	}
	return undefined;
}

//
// All the bizarre forms of handicap that have been spotted in scoring spot
function correct_handicap(handicap) {
    return ( !handicap ? 100 : ( handicap<2 ? handicap*100 : ( handicap > 140 ? handicap/10 : handicap)));
}
