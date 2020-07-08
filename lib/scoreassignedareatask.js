

import Graph from './dijkstras.js'


import LatLong from './LatLong';

import { checkIsInTP, timeToText, durationToText } from './taskhelper.js';

/*
 * This is used just for scoring an AAT task
 *
 * It accepts the task object, the tracker object the points to add
 *
 */

export default function scoreAssignedAreaTask( task, tracker, state, points ) {
    
    // If it has finished then do nothing more
    if( tracker.utcfinish ) {
	return;
    }

    if( ! points || points.length < 2 ) {
	console.log( tracker.compno + " unable to score AAT, no points" );
	return;
    }

    // We do a lot with these legs ;)
    let legs = task.legs;

    // What was the last one we did to make sure the task hasn't finished
    let t = tracker.lastTurnPoint;

    // We start from the start point not the track point
    if( t == 0 || t === undefined ) {
	// if we haven't got a start yet then do nothing...
	if( ! (tracker.utcstart > 0 ) || tracker.startLocation === undefined ) {
	    return;
	}

	// Initialise everything
	state.sectorpoints = [];
	for( let x = 0; x < legs.length; x++ ) {
	    state.sectorpoints[x] = [];
	}
	state.aatGraph = new Graph();
	state.pointsByTime = [];
	tracker.scoredpoints = [];
	
	// pick up where it started and make sure we score from the startline not the actual
	// point the glider crossed the line
	state.sectorpoints[0].push( {t:(tracker.utcstart), loc:(legs[0].ll) } );
	state.lastProcessedTime = tracker.utcstart;
	state.pointsByTime[tracker.utcstart] = legs[0].ll;
	t=1;
    }

    // Skip all the points we have processed
    let p = points.length-2;
    if( state.lastProcessedTime !== undefined ) {
	while( p >= 0 && points[p].t < state.lastProcessedTime ) {
	    p--;
	}
    }

    var finish = 0;
    var finishLeg = legs.length-1; 
    var wasinsector = 0;
    var minNextDist = 999999;
    var minNextDistLL = undefined;
    var distanceDecreasing = 0;

    while( p >= 0 && t < legs.length ) {

	// skip small distance changes to reduce the workload, should help with
	// filtering out thermals
	var pprev = p+1;
	var ptime = points[p+1].t;
	const minDistance = 1; // 1km
	
	var _wasinsector = checkIsInTP( legs[t], points[p] );
	var _isinsector = _wasinsector;
	while( p > 0 &&
	       LatLong.distHaversine( points[p].ll, points[pprev].ll ) < minDistance &&
	       (points[p].t-ptime) < 90 && (_wasinsector >= 0) == (_isinsector>=0) ) {
	    
	    p--;
	    _isinsector = checkIsInTP( legs[t], points[p] );
	}

	// So we can find out where they are...
	state.pointsByTime[points[p].t] = points[p].ll;

	var nextDistance;
	
	// if we are in the next sector then the previous sector is no longer valid - probably not needed
	// also confirm we have at least one point in the current sector or else we don't want to advance
        if( t != finishLeg ) {
	    if( (nextDistance = checkIsInTP( legs[t+1],points[p] )) >= 0 && state.sectorpoints[t].length > 0 ) {
//		console.log( tracker.compno + "* in next sector, sector " + t + " has " + state.sectorpoints[t].length + " points in sector" );
		t++;
	    }
	    
	    // Find the closest point to the next turnpoint
	    else if( Math.abs(nextDistance) < minNextDist ) {
		minNextDist = Math.abs(nextDistance);
		//		minNextDistLL = points[p].ll;
		distanceDecreasing++;
	    }
	}
	
        // check if we are in the sector, these are scoring points.
	// Note it is possible to leave sector and return as long as a new sector is not done in the middle
	//        if( checkIsInTP( legs[t], points[p].ll ) >= 0 ) {
	if( _isinsector >= 0 ) {

	    // We either need to use the actual point, or if we are in the finish ring then we
	    // need to use the point of the finish rather than the actual
	    // we need to put this into the pointsByTime array as well otherwise we will use the wrong point
	    // to calculate distances later
	    var useP = points[p].ll;
	    if( t == finishLeg ) {
		useP = legs[t].ll; // note this DOESN'T ADJUST FINISH RING, perhaps it should?
		state.pointsByTime[points[p].t] = useP; 
	    }
	    
	    // we need to add this to the graph pointing at each point in the previous sector
	    state.sectorpoints[t-1].forEach( function(previousPoint) {
		state.aatGraph.addLink( points[p].t, previousPoint.t, 1000-LatLong.distHaversine( useP, previousPoint.loc ));
	    } );
	    
	    state.sectorpoints[t].push( {t:points[p].t, loc:useP} );
//	    console.log( tracker.compno + "in AAT sector "+t+", point "+useP+", at "+points[p].t );
	    wasinsector = 1;
        }

	// If there were in the sector and are not any longer then treat it as going to next leg (and we are more than 10k away from the sector)
	else if ( wasinsector && t < finishLeg && _isinsector < -20 ) {
//	    console.log( tracker.compno + "* has left sector " + t + " at " + points[p].t + ", sector has " + state.sectorpoints[t].length + " points in sector" );
	    wasinsector = 0;
	}

	// Check for the finish, if it is then only one point counts and we can stop tracking
	if( t == finishLeg && state.sectorpoints[t].length > 0 )  {
//	    console.log( 'Point in finish sector' );
	    tracker.utcfinish = points[p].t;
	    finish = points[p].t;
	    tracker.finish = timeToText( tracker.utcfinish );
	    tracker.utcduration = Math.max(tracker.utcfinish - tracker.utcstart,tracker.taskduration);
	    tracker.duration = durationToText( tracker.utcduration );
	    minNextDistLL = undefined;
	    minNextDist = 9999999;
	    t++;
	}

        p--;
    }

    // If the tracker has not actually finished then we need to dijkstra to a different point to get the distance
    var dpoints = [];
    var fakefinish = 0;
    
    if( ! finish ) {
	p = 0; // should be an exception
	finish = points[p].t;
	fakefinish = 1;

	// To figure out the partial time we will generate a temporary object and copy
	// the data into it, then we will add a link from current point to all the points
	// in the previous sector so we can optimise properly
	var tempGraph = new Graph;
	tempGraph.vertices = state.aatGraph.vertices;

	// If our last point was in a sector then we need to figure out how to score it
	// basically we need to duplicate all the points in the sector and add a link from them
	// to the end this should allow it to optimise the whole task length.  It works
	// on the assumption that the next leg starts when a single fix is put in the sector
	// though the reality is that while in a sector you are actually on two legs at the same time
	if( wasinsector ) {
	    state.sectorpoints[t-1].forEach( function(outerPoint) {
		state.sectorpoints[t-1].forEach( function(innerPoint) {
		    if( innerPoint.t != outerPoint.t ) {
			tempGraph.addLink( innerPoint.t, outerPoint.t, 1000-LatLong.distHaversine( legs[t].ll, outerPoint.loc ));
		    }
		} );
	    } );
	}

	// If we are not in a sector it is a bit easier as it is just to the landout.  This is not
	// 100% correct as it..
	/// Annex A: to the point of the next Assigned Area which is nearest to the Outlanding Position,
	/// less the distance from the Outlanding Position to this nearest point
	// and this is doing it to the centre of the sector rather than the nearest point - it will be right
	// and circular sectors but not on wedges
	else {
	    state.sectorpoints[t-1].forEach( function(previousPoint) {
		tempGraph.addLink( points[p].t, previousPoint.t, 1000-LatLong.distHaversine( legs[t].ll, previousPoint.loc ));
	    } );
	}
	
	    
	// Calculate the longest path, doesn't include the start for some reason so we'll add it
	dpoints = tempGraph.shortestPath(tracker.utcstart, finish);
	dpoints.push( ""+tracker.utcstart );

    }
    else {
	// Calculate the longest path, doesn't include the start for some reason so we'll add it
	dpoints = state.aatGraph.shortestPath(tracker.utcstart, finish);
	dpoints.push( ""+tracker.utcstart );
    }

    // Next step is to calculate the distances done on each leg
    // the graph contains weights only between points in consecutive sectors
    var distdone = 0;
    var hdistancedone = 0;
    var previousPoint = undefined;
    var previousTime = undefined;
    var rpPoint = undefined;
    var leg = 0;
    tracker.legspeeds = tracker.legdistances = "";

    // We get them out backwards so switch it round and iterate, each node is named after its time
    dpoints.reverse().forEach( function(at) {
	var point = state.pointsByTime[at];
	
	// Actual distance to the point
	var distance = previousPoint !== undefined ? LatLong.distHaversine( previousPoint, point ) : 0;
	
	// Are we finishing to a ring or a line/sector
	// We need to handle this a bit differently as we need to find the point on the finish ring that the
	// glider is scored to rather than the one it crosses
	if( leg == finishLeg && legs[finishLeg].a1 != 90 ) {
	    distance -= legs[finishLeg].r1;
	    point = previousPoint.destPointRad( LatLong.bearing( previousPoint, legs[finishLeg].ll ), distance );
	}

	// If they have landed out then give them credit for what they have achieved
	if( leg == t && tracker.stationary ) {
	    point = previousPoint.destPointRad( LatLong.bearing( previousPoint, legs[t].ll ), distance );
	}

	// Add to the map, except the end
	if( leg != t ) {
 	    tracker.scoredpoints.push( [ point.dlong(), point.dlat() ] );
	}
		
	// And if it is the second point (ie part of a leg) then calculate the distances
	if( previousPoint !== undefined ) {
	    // Actual distance done
	    distdone += distance;

	    if( tracker.legspeeds != '' ) {
		tracker.legspeeds += ', ';
		tracker.legdistances += ', ';
	    }
	    tracker.legspeeds += leg+": "+ (Math.round( (distance * 10) / ((at - previousTime)/3600))/10) + "kph"; // kph
	    tracker.legdistances += leg+": "+ (Math.round( (distance * 10)) / 10) + "km"; // km
//	    console.log( tracker.compno + "* leg " + leg + " distance " + distance + " from " + previousPoint + " to " + point + " in " + (at-previousTime) + " seconds" );
	    
	    // Handicap distance, handicap is on the next leg
	    hdistancedone += (100.0*distance)/Math.max(tracker.handicap+legs[leg].Hi,25);
	}

	// Increment to next point aka leg
	rpPoint = previousPoint;
	previousPoint = point;
	previousTime = at;
	leg++;
    } );

    leg--;
    tracker.lasttp = leg;
//    console.log( tracker.compno + "* dij:"+(dpoints)+", distance " + distdone);
//    console.log( tracker.compno + "* " + tracker.legspeeds );

    tracker.remaining = undefined;
    tracker.hremaining = undefined;
    tracker.grremaining = undefined;
    tracker.hgrremaining = undefined;

    if( ! fakefinish ) {
	// If it is a real finish then we don't need any distance remaining!
	state.pointsByTime = [];
	state.aatGraph = undefined;
	state.sectorpoints = undefined;
	tracker.dbstatus = 'F';
    }
    else {

	// Pick up remained of current leg, don't adjust for finish ring as we want them home
	var distance = LatLong.distVincenty(points[0].ll,legs[leg].ll);
	
	var remainingdistance = distance;
	var hremainingdistance = (100.0*distance)/Math.max(tracker.handicap+legs[leg].Hi,25);

	// Figure out how far home
	if( rpPoint ) {
	    var legLength = LatLong.distHaversine(rpPoint, legs[leg].ll );
//	    if( leg == finishLeg && legs[finishLeg].type == 'sector' && legs[finishLeg].a1 == 180 ) {
//		legLength -= legs[finishLeg].r1;
//	    }
	    
	    var scoredTo = LatLong.intermediatePoint(rpPoint,legs[t].ll,
						     (legLength)/6371,1-(Math.min(distance,legLength)/legLength));
	    
 	    tracker.scoredpoints.push( [ scoredTo.dlong(), scoredTo.dlat() ] );
	}

	// Add up how much is left of each leg to the finish
        for(t = leg+1; t < legs.length;t++ ) {
            remainingdistance += legs[t].length;
            hremainingdistance += (100.0*legs[t].length)/Math.max(tracker.handicap+legs[t].Hi,25); // Accumulate the handicapped distance
        }

	// And update the display with this
	tracker.remaining = Math.round(remainingdistance*10)/10;
        tracker.hremaining = Math.round(hremainingdistance*10)/10;
	if( ! tracker.stationary ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].agl));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].agl));
	}
    }

    // We can always calculate the speed and distance done
    var elapsed = (finish - tracker.utcstart)/3600;
    if( elapsed < 0 ) {
        elapsed = 1000000000000000;
    }
//    console.log( tracker.compno + "* elapsed:"+elapsed+", completed:"+distdone+", utcs:"+tracker.utcstart+", utcf:"+tracker.utcfinish );
//    console.log( tracker.compno + "* hdd:"+hdistancedone );

    if( tracker.datafromscoring != 'Y')
    {
	tracker.speed = undefined;
	tracker.hspeed = undefined;
	
	tracker.distancedone = distdone;
	tracker.hdistancedone = hdistancedone;
	
	// If we have a distance, the glider is not stationary or it is but  it finished
	if( tracker.distancedone > 0 && (! tracker.stationary || ! fakefinish)) {
            tracker.speed = Math.round( (distdone * 10) / elapsed )/10; // kph
            tracker.hspeed = Math.round( (hdistancedone * 10) / elapsed )/10; // kph;
	}

	if( tracker.speed > 180 || tracker.hspeed > 180 ) {
	    tracker.speed = undefined;
	    tracker.hspeed = undefined;
	}
	
//	console.log( tracker.compno + "* speed:"+tracker.speed+", hspped:"+tracker.hspeed);
    }

}
