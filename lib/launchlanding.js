// Helper functions for geometry
const length = (require( '@turf/length' )).default;
const distance = (require( '@turf/distance' )).default;
const { point, lineString } = (require( '@turf/helpers' ));

// Database
const escape = require('sql-template-strings')

// line at a time reading of streamed webpage for igc download
var readline = require('readline');

//
const _groupby = require('lodash.groupby');
const _foreach = require('lodash.foreach');
const _reduce = require('lodash.reduce');

// Keep track of the unknowns
var unknownTrack = {};

function resetPossibleLaunchLanding( id ) {
	console.log( "reset", id );
	delete unknownTrack[id];
}


// How long do we need to evaluate distance
// if this is too high then we will miss loggers that truncate trace immediately on cease of motion
const minTestTime = 5;

//
// This is called only for unknown flarm IDs that didn't match from the DDB,
// it will capture possible launch times or landing times for the flarm ID
// that we can use both in soaringspot.js (on the igc file) or for the flarm
// ID. We can then correlate the two
// note: id could be either class+compno or flarmid
function capturePossibleLaunchLanding( id, at, point, agl, db, type )
{

	// Now we are going to manipulate this track to look for either launch or landing
	let track = unknownTrack[id];

	if( track ) {
		let lastTime = track.times[track.times.length-1];

		// If the point is prior to the latest one we have had then we will
		// ignore it (out of order isn't unusual on OGN)
		if( at <= lastTime ) {
			console.log("ooo");
			return;
		}

		if( at !== undefined ) {
			// add the new point
			track.path.geometry.coordinates.push( point );
			track.times.push( at );
			track.heights.push( agl );
		}
		else {
			// special case for loggers that truncate before stationary
			// CH has this problem, often finishes when 5s average is > 50kph!
			point = track.path.geometry.coordinates[track.path.geometry.coordinates.length-1];
			at = lastTime + minTestTime;
			agl = track.heights.pop();
		}
	}

	// If we don't have one for this id then create it
	else {
		unknownTrack[id] = {
			path: lineString([point,point]),
			times: [at,at],
			heights: [agl,agl],
			airborne: (agl > 200)
		};

		if( agl > 200 ) {
			console.log( id, new Date(at*1000),
						 Math.round(agl),'m (current)',  'high first point' );
		}

		// by reference
		track = unknownTrack[id];
	}

	// Check to see if it's a possible launch or landing
	let trackDistance = length( track.path, { units: 'kilometers' }); // km
	let endToEndDistance = distance( track.path.geometry.coordinates[0], point, { units: 'kilometers' });
	let elapsed = at - track.times[0]; // seconds
	let speed = endToEndDistance / (elapsed/3600); // kph
	let gain = agl - track.heights[0]; // m (+ gain or - loss)


	// we need enough samples
	if( elapsed < minTestTime ) {
		return;
	}

	if( agl < 200 ) {

		if( trackDistance > 0.01 ) {
			console.log( id, new Date(at*1000), elapsed,"s", track.times.length, "points",
						 Math.round(trackDistance*1000)/1000,'km (points)',
						 Math.round(endToEndDistance*1000)/1000,'km (end2end)',
						 Math.round(speed),'kph (end2end)', Math.round(agl),'m (current)', Math.round(gain), 'm (since start)' );
		}
		
		if( speed > 70 && gain > 25 && agl > 40 && trackDistance > 0.1) {

			if( ! track.airborne ) {
				if( db ) {
					db.query( escape`INSERT IGNORE INTO movements ( action, time, id, type, datecode ) VALUES ( 'launch', ${at}, ${id}, ${type}, (select datecode from compstatus limit 1) )` );
				}
				console.log( id, at, "launch", speed, gain, agl );
				track.airborne = true;
			}
		}
		else {
			// Otherwise if we have a record of it being airborne then we can look
			// for landings
			if( track.airborne ) {
				
				// If we haven't changed height much (ridge soaring at the mind will break this if people are within 50m of takeoff altitude!)
				if( Math.abs(gain) < 10 && speed < 35 && agl < 50 ) {
					if( db ) {
						db.query( escape`INSERT IGNORE INTO movements ( action, time, id, type datecode ) VALUES ( 'landing', ${at}, ${id}, ${type}, (select datecode from compstatus limit 1) )` );
					}
					console.log( id, at, "landing", speed, gain, agl );
					track.airborne = false;
				}
			}
		}
	}
	
	// Are we airborne? Only an 'on' here, toggle off after landing detected extra check
	if( ! track.airborne && (speed > 130 && agl > 200)) {
		console.log( id, at, "airborne trace start", speed, agl );
		track.airborne = true;
	}
		
	// And flush stuff we don't need any more
	let numberOfPoints = track.times.length;
	while( elapsed > minTestTime+1 && numberOfPoints > 3 )
	{
		track.path.geometry.coordinates.shift();
		track.heights.shift();
		elapsed = at - track.times.shift();
		numberOfPoints = track.times.length;
	}
}

//
// Check to see if the movements table has any matches for the class and the date
// date is YYYY-MM-DD format
async function checkForOGNMatches( classid, date, mysql ) {
		
	// Check what ones we have (simplier to do as two queries)
	const trackersRaw = (await mysql.query( escape`SELECT compno, trackerid FROM tracker WHERE class=${classid}` ));
	const trackers = _groupby( trackersRaw, 'compno' );
	
	// Check for the tugs
	const frequentFlyersRaw = (await mysql.query( escape`select id,count(*) c from movements
                                                     where movements.datecode = todcode(${date})
                                                     group by 1 having c > 8` ));
	const frequentFlyers = _groupby( frequentFlyersRaw || [{'id':'none'}], 'id' );
	
	// Find the potential associations
	const key = [date.substring(8,11),classid,'%'].join('/');
	const matchesRaw = (await mysql.query( escape`SELECT mo.id flarmid, mi.id glider, group_concat(mi.action ORDER BY mi.action) actions FROM movements mo 
                                                            JOIN movements mi ON mo.action = mi.action and abs(truncate(mo.time/30,0)-truncate(mi.time/30,0)) < 4 and mo.id != mi.id 
                                                            WHERE mi.type='igc' and mo.type='flarm' and mi.id like ${key} and mo.datecode=mi.datecode and mo.datecode = todcode(${date})
                                                            GROUP BY 1,2 
                                                            HAVING actions='landing,launch'`));
	if( ! matchesRaw || ! matchesRaw.length ) {
		console.log( `${date} ${classid}: no IGC/OGN matches found` );
	}
	else {
		
		// Collect duplicates, if we have more than one match then we must ignore it
		const matches = _groupby( matchesRaw, 'glider' );
		const flarmIds = _groupby( matchesRaw, 'flarmid' );
		
		console.log( `${date} ${classid}: ${Object.keys(matches).length} matches found, ${Object.keys(flarmIds).length} distinct flarm ids` );
		
		_foreach(matches, (mx) => {
			const m = mx[0];
			
			// Get compno and make sure it's valid
			const mCompno = m.glider.split('/')[2];
			if( ! (mCompno in trackers) ) {
				console.log( `${date} ${classid} - ${mCompno} missing from tracker table` );
				return;
			}
			
			if( frequentFlyers[m.flarmid] ) {
				console.log( `${date} ${classid} - ${m.flarmid} matched ${mCompno} but flarmid is in frequent flyer list so ignoring match` );
				return;
			}

			if( flarmIds[m.flarmid].length > 1 ) {
				console.log( `${date} ${classid} - ${m.flarmid} matched ${mCompno} but flarmid also matched other gliders so ignoring match` );
				return;
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
				else {
					console.log( `${date} ${classid} - ${mCompno} flarm ID ${flarmid} confirmed from takeoff/landing time match` );
				}
			}
		} );
	}
}

//
// Get an IGC file from a website spot so we can process it
async function processIGC( classid, compno, location, date, url, https, mysql, getHeaders ) {

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
	let key = [date.substring(8,11),classid,compno].join('/');

	// De-escape it
	url = url.replaceAll( '&amp;', '&' );

	// Initiate a streaming request
	return https
		.get(url,
			 getHeaders ? getHeaders() : undefined,
			 function(response) {
				 var myInterface = readline.createInterface({
					 input: response
				 });
				 
				 myInterface.on( 'close', () => {
					 mysql.query( escape`UPDATE pilotresult SET igcavailable=${validFile?'P':'F'} WHERE datecode=todcode(${date}) and compno=${compno} and class=${classid}` );
					 if( validFile ) {
						 capturePossibleLaunchLanding( key, undefined, undefined, undefined, mysql, 'igc' ); // force a final point for longers that truncate before stationary
						 console.log( `processed ${date} ${classid} - ${compno} successfully` );
					 }
				 });
				 
				 // For each line in the response
				 myInterface.on( 'line', (line) => {
					 console.log(line);

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
														   jPoint, alt - location.altitude,
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

module.exports = { capturePossibleLaunchLanding, resetPossibleLaunchLanding, checkForOGNMatches, processIGC };
