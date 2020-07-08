/*
 * Start sectors are the same for all types of tasks
 * 
 * Although not all competitions use start sectors at present Onglide only supports sectors and when the task
 * is loaded from SoaringSpot it will convert a line into a sector. This isn't a perfect optimization but simplifies
 * in or out of sector calculation. Turf appears to do intersect so may be easier to fix this than it was using
 * goole maps
 *
 */

import LatLong from './LatLong';

import { checkIsInTP, timeToText } from './taskhelper.js';


// POINTS ARRAY IS OLDEST TO NEWEST
export default function findStart( tracker, state, task, points )
{
    // make sure we have enough points to make it worthwhile
    if( ! points || points.length < 3 ) {
	return 0;
    }

    function log(x) { if( tracker.compno == '' ) { console.log(x); }};
	
    // POINTS ARRAY IS OLDEST TO NEWEST
    // Note we start looking from the start at the newest point! this
    // is so we find the most recent start
    var t = 0;
    var p = points.length-2;
    var compno = tracker.compno; // logging

    // Make sure we don't do this too often as it's not fantastically efficient
    // when decoupled from rest of scoring
    if( state.lastCheckforStart ) {

	// Check every two minutes
	let threshold = 120;
	
	// If it has been started for more than 30 minutes then check every 15 minutes
	if( points[0].t - tracker.startutc < 30*60 ) {
	    threshold = 15*60;
	}

	// If we haven't hit the threshold then don't check again for a while
	if( state.lastCheckforStart + threshold > points[0].t ) {
	    return undefined;
	}
    }

    // We are checking now so cache away the time
    state.lastCheckforStart = points[0].t;

    // Helper to save us slicing all the time
    // this excludes start and finish
    let actualTurnpoints = task.slice(1,task.length-1);

    // state for the search
    var insector = 0;
    var wasinsector = 0;
    var laststarttime = 0;

    // Shortcut to the startline which is expected to always be the first point
    var startLine = task[0];    

    if( startLine.type !== 'sector' ) {
	log( "please write line cross stuff!" );
	return 0;
    }

    log( "---[ "+compno+"* start ] ------------------------------------------------------------" );

    do {
        insector = 0;
	
        // check if we are in the sector - skip on tps that don't have sectors...
        if( checkIsInTP( startLine, points[p] ) >= 0 ) {
            insector = 1;
            wasinsector = 1;

	    // If we are in the start sector this is now wrong
	    laststarttime = tracker.utcstart = undefined;
	    tracker.startLocation = undefined;
        }

	// We have left the start sector, remember we are going forward in time
	if( wasinsector && ! insector ) {
	    laststarttime = tracker.utcstart = points[p+1].t;
	    tracker.start = timeToText(laststarttime);
	    tracker.startLocation = points[p+1].ll;
	    tracker.dbstatus = 'S';
	    wasinsector = 0;
	}

	// And we keep going until we hit the first turn point then we can stop looking
	// (or within 3 km of it)
	// This means once you have turned one turn you can't easily restart but ensures
	// that flying back over the start doesn't cause a restart
	if( ! (insector in points[p]) || !(sectornumber in points[p]) ) {
	    actualTurnpoints.some( (tp) => {
		if( checkIsInTP( tp, points[p] ) + 3 >= 0 ) {
		    points[p].insector = 1;
		    points[p].sectornumber = tp.legno;
		    return true;
		}
		return false;
	    });
	}
	
	if( points[p].insector && points[p].sectornumber > 0 ) {
	    insector = 1;
	    log( compno + "* in tp sector at " + timeToText(points[p].t) );
	    break;
        }

        p--;

    } while ( p > 0 );

    if( wasinsector ) {
	log( compno + "* oops.. still insector at " + timeToText(points[p].t));
    }

    // set the last updated time...
    if( laststarttime ) {
	log( compno + "* assuming start at " + laststarttime + ", " + timeToText(laststarttime) );
    }

    return laststarttime;

}
