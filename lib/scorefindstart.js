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
	
    // POINTS ARRAY IS OLDEST TO NEWEST
    // Note we start looking from the start at the newest point! this
    // is so we find the most recent start
    var t = 0;
    var p = points.length-2;
    var compno = tracker.compno; // logging

    // Make sure we don't do this more than once every 60 seconds
    if( state.lastCheckforStart && state.lastCheckforStart + 60 > points[0].t ) {
	return undefined;
    }
    //console.log( compno + "* " + state.lastCheckforStart ? state.lastCheckforStart : '-1' + "," + points[0].t );
    state.lastCheckforStart = points[0].t;

    // state for the search
    var insector = 0;
    var wasinsector = 0;
    var laststarttime = 0;

    // Shortcut to the startline which is expected to always be the first point
    var startLine = task[0];    

    if( startLine.type !== 'sector' ) {
	console.log( "please write line cross stuff!" );
	return 0;
    }

//    console.log( "---[ "+compno+"* start ] ------------------------------------------------------------" );

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
	if( (points[p].insector && points[p].sectornumber == 1) ||
	    checkIsInTP( task[1], points[p] ) + 3 >= 0 ) {
	    points[p].insector = 1;
	    points[p].sectornumber = 1;
//	    console.log( compno + "* in tp sector at " + timeToText(points[p].t) );
	    break;
        }
        p--;

    } while ( p > 0 );

//    if( wasinsector ) {
//	console.log( compno + "* oops.. still insector at " + timeToText(points[p].t));
//   }

    // set the last updated time...
    if( laststarttime ) {
//	console.log( compno + "* assuming start at " + laststarttime + ", " + timeToText(laststarttime) );
    }

    return laststarttime;

}
