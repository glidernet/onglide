// Helper function
const length = (require( '@turf/length' )).default;
const distance = (require( '@turf/distance' )).default;
const { lineString } = (require( '@turf/helpers' ));
const escape = require('sql-template-strings')

// Keep track of the unknowns
var unknownTrack = {};

function resetPossibleLaunchLanding( id ) {
	console.log( "reset", id );
	delete unknownTrack[id];
}

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

	// If we don't have one for this id then creae it
	if( ! track ) {
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
	else {

		// If the point is prior to the latest one we have had then we will
		// ignore it (out of order isn't unusual on OGN)
		if( at <= track.times[track.times.length-1] ) {
			return;
		}
		
		// add the new point
		track.path.geometry.coordinates.push( point );
		track.times.push( at );
		track.heights.push( agl );
	}

	// Check to see if it's a possible launch or landing
	let trackDistance = length( track.path, { units: 'kilometers' }); // km
	let endToEndDistance = distance( track.path.geometry.coordinates[0], point, { units: 'kilometers' });
	let elapsed = at - track.times[0]; // seconds
	let speed = endToEndDistance / (elapsed/3600); // kph
	let gain = agl - track.heights[0]; // m (+ gain or - loss)


	// we need enough samples
	if( elapsed < 20 ) {
		return;
	}

	if( agl < 200 ) {

		if( trackDistance > 0.03 ) {
			console.log( id, new Date(at*1000), elapsed,"s", track.times.length, "points",
						 Math.round(trackDistance*1000)/1000,'km (points)',
						 Math.round(endToEndDistance*1000)/1000,'km (end2end)',
						 Math.round(speed),'kph (end2end)', Math.round(agl),'m (current)', Math.round(gain), 'm (since start)' );
		}
		
		if( speed > 80 && gain > 25 && agl > 40 ) {

			if( ! track.airborne ) {
				if( db ) {
					db.query( escape`INSERT IGNORE INTO movements ( action, time, id, type ) VALUES ( 'launch', ${at}, ${id}, ${type} )` );
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
				if( Math.abs(gain) < 10 && speed < 25 && agl < 50 ) {
					if( db ) {
						db.query( escape`INSERT IGNORE INTO movements ( action, time, id, type ) VALUES ( 'landing', ${at}, ${id}, ${type} )` );
					}
					console.log( id, at, "landing", speed, gain, agl );
					track.airborne = false;
				}
			}
		}
	}
	
	// Are we airborne? Only an 'on' here, toggle off after landing detected extra check
	if( ! track.airborne && (speed > 30 && agl > 100)) {
		console.log( id, at, "airborne trace start", speed, agl );
		track.airborne = true;
	}
		
	// And flush stuff we don't need any more
	// We don't need to keep it for ever, 60 seconds & 12 points up to max of 12 points
	let numberOfPoints = track.times.length;
	while( numberOfPoints > 12 ||
		(elapsed > 60 && numberOfPoints > 4 ))
	{
		track.path.geometry.coordinates.shift();
		track.heights.shift();
		elapsed = at - track.times.shift();
		numberOfPoints = track.times.length;
	}
}

module.exports = { capturePossibleLaunchLanding, resetPossibleLaunchLanding };
