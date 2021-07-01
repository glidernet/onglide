

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

    function log(x) { if( tracker.compno == '' ) { console.log(x); }};

    if( ! points || points.length < 2 ) {
        log( tracker.compno + " unable to score AAT, no points" );
        return;
    }

    // If it has finished then do it once to get a scored point array but not gain.
    if( tracker.utcfinish && tracker.scoredpoints?.length == task.legs.length ) {
        console.log( "skipping "+tracker.compno+" as scored already" );
        return;
    }

    // We do a lot with these legs ;)
    let legs = task.legs;

    // What was the last one we did to make sure the task hasn't finished
    let t = tracker.lastTurnPoint;

    // We start from the start point not the track point
    if( t == 0 || t === undefined ) {
        // if we haven't got a start yet then do nothing...
        if( ! (tracker.utcstart > 0 ) || ! tracker.startFound ) {
            log( tracker.compno + "* no start detected" );
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
        state.pointsByTime[tracker.utcstart] = legs[0].ll;
        t=1;

        // skip to the first point after the start, we don't want to capture that point
        // as it will update pointsByTime and that will change where the scoring line is
        // drawn.
        state.lastProcessedTime = tracker.utcstart+1;
    }
    log( `number of points: ${points.length}, lastprocessedimte:${state.lastProcessedTime}` );

    // Skip all the points we have processed
    let p = points.length-2;
    if( state.lastProcessedTime !== undefined ) {
        while( p >= 0 && points[p].t < state.lastProcessedTime ) {
            p--;
        }
    }

    var finish = 0; // this is last time in the graph not the time of crossing finish line
    var finishLeg = legs.length-1;
    var wasinsector = 0;
    var minNextDist = 999999;
    var minNextDistP = undefined;
    var distanceDecreasing = 0;

    while( p >= 0 && t < legs.length ) {

        // skip small distance changes to reduce the workload, should help with
        // filtering out thermals
        var pprev = p+1;
        var ptime = points[p+1].t;
        const minDistance = 0.250; // 250m

        var _wasinsector = checkIsInTP( legs[t], points[p] );
        var _isinsector = _wasinsector;
        while( p > 0 &&
               LatLong.distHaversine( points[p].ll, points[pprev].ll ) < minDistance &&
               (points[p].t-ptime) < 90 && (_wasinsector >= 0) == (_isinsector>=0) ) {

            p--;
            _isinsector = checkIsInTP( legs[t], points[p] );
        }
        log( "exit inner loop "+p+", _isinsector "+_isinsector +", checking vs " + t);

        // So we can find out where they are...
        state.pointsByTime[points[p].t] = points[p].ll;

        // Find the closest point to the next turnpoint
        if( Math.abs(_isinsector) < minNextDist ) {
            minNextDist = Math.abs(_isinsector);
            minNextDistP = p;
            distanceDecreasing++;
            log( tracker.compno + "* sector"+t+", closest "+minNextDist+" @ "+points[p].t);
        }

        // if we are in the next sector then the previous sector is no longer valid - probably not needed
        // also confirm we have at least one point in the current sector or else we don't want to advance
        if( t != finishLeg ) {
            if( checkIsInTP( legs[t+1],points[p] ) >= 0 ) {
                if( state.sectorpoints[t].length > 0 ) {
                    log( tracker.compno + "* in next sector, sector " + t + " has " + state.sectorpoints[t].length + " points in sector" );
                    t++;
                    minNextDistP = undefined;
                    minNextDist = 9999999;
                }
                else {
                    log( tracker.compno + "* ignoring point in sector "+(t+1)+" as nothing recorded in sector "+(t) );
                }
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
            log( tracker.compno + "* in AAT sector "+t+", point "+useP+", at "+points[p].t+(t != finishLeg?(' distN:'+ (1000-LatLong.distHaversine(useP,legs[t+1].ll))):'') + ", p "+p);
            wasinsector = 1;
        }

        // If there were in the sector and are not any longer then treat it as going to next leg (and we are more than 3k away from the sector)
        // this will break if next sector is closer.  If they overlap we are totally screwed!
        else if ( wasinsector && t < finishLeg && Math.abs(_isinsector) > (legs[t].maxR + 3) ) {
            log( tracker.compno + "* has left sector " + t + " at " + points[p].t + ", sector has " + state.sectorpoints[t].length + " points in sector, _iis:" + _isinsector );
            wasinsector = 0;
            minNextDistP = undefined;
            minNextDist = 9999999;
            t++;
        }

        // Check for the finish, if it is then only one point counts and we can stop tracking
        if( t == finishLeg && state.sectorpoints[t].length > 0 )  {
            log( 'Point in finish sector' );
            tracker.utcfinish = points[p].t;
            finish = points[p].t;
            tracker.finish = timeToText( tracker.utcfinish );
            tracker.utcduration = Math.max(tracker.utcfinish - tracker.utcstart,tracker.taskduration);
            tracker.duration = durationToText( tracker.utcduration );
            minNextDistP = undefined;
            minNextDist = 9999999;
            t++;
        }

        p--;
    }

    // If the tracker has not actually finished then we need to dijkstra to a different point to get the distance
    var dpoints = [];
    var fakefinish = 0;

    // We didn't finish so we need to link up a temporary graph to do the scoring
    if( ! finish ) {
        p = 0;
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
            log( 'insector'+t );
            t++;

            // As we are already in the sector we can't use the current point as the destination
            // of the graph. To work around this we will use a pretend point of '0' which we will
            // initialize to our current point
            finish = 0;
            state.pointsByTime[finish] = points[p].ll;

            // We need a temporary point extension for the next TP as the current point is already in the
            // graph linked from all the previous sector points and therefore will always be the shortest
            // path
            const psectorpoints = state.sectorpoints[t-1];
            for( let o = 0; o < psectorpoints.length; o++ ) {
                const outerPoint = psectorpoints[o];
                for( let i = o+1; i < psectorpoints.length; i++ ) {
                    const innerPoint = psectorpoints[i];
                    tempGraph.addLink( innerPoint.t, outerPoint.t, 1000-LatLong.distHaversine( legs[t].ll, outerPoint.loc ));
                }
                tempGraph.addLink( finish, outerPoint.t, 1000-(LatLong.distHaversine( legs[t].ll, outerPoint.loc )/2));
            }
        }


        // If we are not in a sector it is a bit easier as it is just to the landout.  This is not
        // 100% correct as it..
        /// Annex A: to the point of the next Assigned Area which is nearest to the Outlanding Position,
        /// less the distance from the Outlanding Position to this nearest point
        // and this is doing it to the centre of the sector rather than the nearest point - it will be right
        // on circular sectors but not on wedges
        else {
            log( 'assuming leg end leg'+t+', at ' + (minNextDistP ? minNextDistP : p) + ' mdp:'+minNextDistP + ', finish:'+finish);

            finish = points[minNextDistP ? minNextDistP : p].t;
            state.pointsByTime[finish] = points[p].ll;
            state.sectorpoints[t-1].forEach( function(previousPoint) {
                tempGraph.addLink( finish, previousPoint.t, 1000-LatLong.distHaversine( legs[t].ll, previousPoint.loc ));
            } );

        }


        // Calculate the longest path, doesn't include the start for some reason so we'll add it
        dpoints = tempGraph.shortestPath(tracker.utcstart, finish);
        dpoints.push( ""+tracker.utcstart );
        log(dpoints);

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
    dpoints.reverse().forEach( function(optimizedatstring) {

        //      log( "optimized time:" + optimizedatstring );

        // We need this based on the index
        // .... but if we don't have a time for the point then it's last point in sector scoring
        // so we return it to be the last point time
        const optimizedat = parseInt(optimizedatstring);
        const at = optimizedat ? optimizedat : points[0].t;
        var point = state.pointsByTime[optimizedat]; // !at, we really do want optimized here...

        //      log( point );
        //      log( leg + "==" + finishLeg + ", t" + t);
        //      console.log( tracker.compno + ":" + optimizedatstring);

        // Actual distance to the point
        var distance = previousPoint !== undefined ? LatLong.distHaversine( previousPoint, point ) : 0;
        log( "distance for leg:" + distance );

        // If they have landed out then give them credit for what they have achieved
        if( leg == t ) { //&& tracker.stationary ) {
            log("leg==t");
            // The leg distance is from the previous point to the turnpoint - from the closest point
            // to the turnpoint. Can't just use the leg length as that is from centre of the TP and
            // they may not have flown that far in the previous sector
            distance = Math.abs(checkIsInTP(legs[t],{ll:previousPoint}))+checkIsInTP(legs[t],{ll:point});
            if( distance < 0 ) {
                distance = 0;
            }
            log( " distance="+distance+",ciitp:"+checkIsInTP(legs[t],{ll:point}));
            point = previousPoint.destPointRad( LatLong.bearing( previousPoint, legs[t].ll ), distance );
            //    log(point);
        }

        // Add to the map, except the end
        else if( leg != t ) {
            log("leg!=t"+leg);
        }
        tracker.scoredpoints.push( [ point.dlong(), point.dlat() ] );

        // And if it is the second point (ie part of a leg) then calculate the distances
        if( previousPoint !== undefined && Math.round(distance*10) > 0 ) {

            log('pp!==undefined');
            // Actual distance done
            distdone += distance;

            if( tracker.legspeeds != '' ) {
                tracker.legspeeds += ', ';
                tracker.legdistances += ', ';
            }
            tracker.legspeeds += leg+": "+ (Math.round( (distance * 10) / ((at - previousTime)/3600))/10) + "kph"; // kph
            tracker.legdistances += leg+": "+ (Math.round( (distance * 10)) / 10) + "km"; // km
            log( tracker.compno + "* leg " + leg + " distance " + distance + " from " + previousPoint + " to " + point + " in " + (at-previousTime) + " seconds @" +at  );

            // Handicap distance, handicap is on the next leg
            hdistancedone += (100.0*distance)/Math.max(tracker.handicap+legs[leg].Hi,25);
        }

        // Increment to next point aka leg
        //      if( distance > 0 ) {
        rpPoint = previousPoint;
        previousPoint = point;
        previousTime = at;
        leg++;
        //      }
    } );

    leg--;
    tracker.lasttp = leg;
    log( tracker.compno + "* st:"+tracker.utcstart+', finish'+finish);
    log( tracker.compno + "* dij:"+(dpoints)+", distance " + distdone);
    log( tracker.compno + "* " + tracker.legspeeds );

    tracker.remaining = undefined;
    tracker.hremaining = undefined;
    tracker.grremaining = undefined;
    tracker.hgrremaining = undefined;

    // If it has finished then do nothing more
    if( tracker.utcfinish ) {
        log( tracker.compno + " * utcfinish found" );
        return;
    }

    if( ! fakefinish ) {
        // If it is a real finish then we don't need any distance remaining!
        state.pointsByTime = [];
        state.aatGraph = undefined;
        state.sectorpoints = undefined;
        tracker.dbstatus = 'F';
    }
    else {

        // Pick up remained of current leg, don't adjust for finish ring as we want them home
        var distance = minNextDist; //LatLong.distVincenty(points[0].ll,legs[leg].ll);

        var remainingdistance = distance;
        var hremainingdistance = (100.0*distance)/Math.max(tracker.handicap+legs[leg].Hi,25);

        // Add up how much is left of each leg to the finish
        for(t = leg+1; t < legs.length;t++ ) {
            remainingdistance += legs[t].length;
            hremainingdistance += (100.0*legs[t].length)/Math.max(tracker.handicap+legs[t].Hi,25); // Accumulate the handicapped distance
        }

        log( tracker.scoredpoints );

        // And update the display with this
        tracker.remaining = Math.round(remainingdistance*10)/10;
        tracker.hremaining = Math.round(hremainingdistance*10)/10;
        if( points[0].g > 100 ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].g));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].g));
        }
    }


    // We can always calculate the speed and distance done
    // remember finish is last point in graph not the finish time
    var elapsed = (Math.max(finish,points[p].t) - tracker.utcstart)/3600;
    if( elapsed < 0 ) {
        elapsed = 1000000000000000;
    }
    // If it's a finish then we need to take into account minimum task time for speeds
    const d = task.task.duration.split(':');
    const minDuration = (parseInt(d[0])+(parseInt(d[1])/60));
    if( ! fakefinish && elapsed < minDuration ) {
        elapsed = minDuration;
    }

    log( tracker.compno + "* elapsed:"+elapsed+", completed:"+distdone+", utcs:"+tracker.utcstart+", utcf:"+tracker.utcfinish );
    log( tracker.compno + "* hdd:"+hdistancedone );

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

        // If they haven't flown very far or are flying too fast then we will
        // suppress speed display as it just looks very broken. First 10-15 km of the flight
        // speed is meaningless anyway
        if( tracker.speed > 180 || tracker.hspeed > 180 || tracker.distancedone < 15 ) {
            tracker.speed = undefined;
            tracker.hspeed = undefined;
        }

        log( tracker.compno + "* speed:"+tracker.speed+", hspped:"+tracker.hspeed);
    }

}
