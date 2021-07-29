/* this is from original site, being taken to pieces */
/* Copyright(c)2007-2020, Melissa Jenkins.  All rights reserved */

import LatLong from './LatLong';

import { checkIsInTP, timeToText, durationToText } from './taskhelper.js';

import _sumby from 'lodash.sumby';

export default function scoreSpeedTask( task, tracker, state, points ) {

    // If we have a handicap distance task then we need to
    // adjust it for our handicap
    // apart from that we treat it exactly the same as a normal speed task
    const handicap = tracker.handicap;
    function calcHandicap(dist,leg) {
        return ((100.0*dist)/Math.max(handicap+leg.Hi,25))
    }

    function log(x) { if( tracker.compno == '' ) { console.log(x); }};

    // Shortcut
    let legs = task.legs;

    // Always start at start for speed scored task
    tracker.scoredpoints = [ [ legs[0].ll.dlong(), legs[0].ll.dlat() ]];

    let t = 1;
    let p = points.length-2;

	if( p < 0 ) {
		return;
	}

    let prevdist = Math.round(LatLong.distHaversine( points[p+1].ll, legs[t].ll )*10)/10;
    let prevdistances = [];
    let prevpoint = [];
    let prevtime = [];
    let sectorpoints = 0;
    let maxpoint = 0; // AAT: last point used for scoring
    let insector = 0;

    let distancedone = 0;
    let hdistancedone = 0;
    let maxdistancedone = 0;
    let hremainingdistance = 0;
    let remainingdistance = 0;
    let lasttp = undefined;

    const finishLeg = legs.length-1;

    if( tracker.forcetp && tracker.forcetp != '' ) {
        log( tracker.compno + "* forcetp: " + tracker.forcetp );
        tracker.forcetp = parseInt(tracker.forcetp);

        while( t < tracker.forcetp ) {
            distancedone += legs[t].length;
            hdistancedone += calcHandicap(legs[t].length,legs[t]); // Accumulate the handicapped distance
            tracker.scoredpoints.push( [ legs[t].ll.dlong(), legs[t].ll.dlat() ] );
            t++;
        }
    }

    // Calculate handicapped task distance if there isn't one already calculated
    if( ! state.htaskdistance ) {
        state.htaskdistance = _sumby(legs, (leg) => calcHandicap(leg.length,leg));
        log( tracker.compno+ "* handicap "+handicap+", task distance:"+state.htaskdistance );
    }


    log( "------------------------------------------------------------" );
    while( p >= 0 && t < legs.length ) {

        // Skip over points that are too close in distance, this should ignore thermalling
        // we really want about a 2.5 k jump
        let forward = p+1;
        let accumulated = 0;
        let skipmore = 0;

        do {
            skipmore = 0;

            if( legs[t].type == 'sector' ) {

                // check if we are in the sector - skip on tps that don't have sectors...
                if( checkIsInTP(legs[t], points[p]) >= 0 ) {
                    sectorpoints++;
                    insector = 1;
                    log( tracker.compno + "* in sector " + t + " at " + timeToText(points[p].t));
                }
                else {
                    insector=0;
                }
            }
            // Cache and accumulate distance till we find 2km
            accumulated += points[p].pdist ? points[p].pdist : (points[p].pdist = LatLong.distHaversine( points[p].ll, points[p+1].ll ));

            if( accumulated < 2 ) {
                p--;
                skipmore = 1;
            }

        } while ( p >= 0 && skipmore && ! insector );

        // We wanted to do the insector on the last point but we don't want to advance past it
        if( p < 0 ) {
            p = 0;
        }

        // If we are longer than the leg we are on then we are not on the leg or something odd, assume we
        // are at the beginning of it - this should stop negative numbers.  Note we adjust by r1 only if we are
        // not an AAT.  AATs deal with this differently!  This adjustment is mostly needed for the distance handicapped
        // task
        const curdist = LatLong.distHaversine( points[p].ll, legs[t].ll);
        let advancetp = 0;

        // Store these and only keep previous 3
        prevdistances.push( curdist );
        prevpoint.push( points[p].ll );
        prevtime.push( points[p].t );

        if( prevdistances.length > 3 ) {
            prevdistances.shift();
            prevpoint.shift();
            prevtime.shift();
        }

        log( tracker.compno + " ---> " + insector + ", " + sectorpoints + ", t " + t );

        // Check for the finish, if it is then only one point counts and we can stop tracking
        if( t == finishLeg && sectorpoints > 0 )  {
            log( tracker.compno + "* found a finish " + points[p].t );
            tracker.utcfinish = points[p].t;
            //            finish = points[p].t;
            tracker.finish = timeToText( tracker.utcfinish );
            t++;
        }

        // If we don't have 3 previous distances then skip this point
        else if( prevdistances.length == 3 ) {

            // If we aren't in the sector but we have some points in what we consider to be the sector then we will advance it
            if( ! insector && sectorpoints > 0 ) {
                log( tracker.compno + "* next tp:" + t + "/"+insector + ",sp:"+sectorpoints );
                advancetp = 1;
            }


            // Allow for a dog leg - ie closer and then further
            // most recent two point may be the departure rather than
            // the entry so we need to look back an extra one
            const timeTaken = (prevtime[2] - prevtime[0]);
            const achievedSpeed = ((prevdistances[0] + prevdistances[2]) / timeTaken );
            const possibleSpeed = (timeTaken > 600 ? 120 : 240)/3600;
            if ( t !== finishLeg && curdist > prevdistances[1] &&
                 achievedSpeed < possibleSpeed ) {
                log( tracker.compno + "* dog leg "+t+", "+ (prevdistances[0]+prevdistances[2]) + "km in " + timeTaken +
                     "seconds, but could have achieved distance in the time: "+ achievedSpeed +" < "+ possibleSpeed );
                advancetp = 1;
            }

            // Next task turn point and distance to it
            if( advancetp ) {

                if( t != legs.length-1 ) {
                    tracker.scoredpoints.push( [ legs[t].ll.dlong(), legs[t].ll.dlat() ] );
                }
                t++;
                insector = 0;
                sectorpoints = 0;
            }

        }

        prevdist = curdist;
        p--;
    }

    log( tracker.compno + "* leg t" + t + " length " + legs.length);

    ///////////////////////////////////////////
    // Output the information about how the task is going here
    ///////////////////////////////////////////

    if( t == legs.length ) {
        log( tracker.compno + "* finished" );
        tracker.status = "finished";

        // Store away our finish
        if( ! tracker.capturedfinishtime && tracker.datafromscoring == 'N' ) {
            tracker.dbstatus = 'F';
            tracker.utcfinish = tracker.capturedfinishtime = points[p>0?p:0].t;
            tracker.finish = timeToText( tracker.utcfinish );
            tracker.utcduration = tracker.utcfinish - tracker.utcstart;
            tracker.duration = durationToText( tracker.utcduration );
            log( tracker.compno + "* captured finish time: "+timeToText(tracker.utcfinish));
        }

        // not relevant on a finished task
        tracker.remaining = undefined;
        tracker.hremaining = undefined;
        tracker.grremaining = undefined;
        tracker.hgrremaining = undefined;

        // We figure this out because we score to the edge of the sector not to the
        // tp center - note this is calculated on the task track not on the pilots track!
        tracker.lasttp = lasttp = t-1;
        log( tracker.compno+ "* final leg " + (lasttp-1) + "," + legs[lasttp].length );
        const scoredTo = LatLong.intermediatePoint(legs[lasttp-1].ll,legs[lasttp].ll,
                                                   (legs[lasttp].lengthCenter)/6371,(legs[lasttp].length/legs[lasttp].lengthCenter));
        tracker.scoredpoints.push( [ scoredTo.dlong(), scoredTo.dlat() ] );

        // pass onwards as the reference numbers rather than any calculations
        maxdistancedone = task.task.distance;
        hdistancedone = state.htaskdistance;
        log( tracker );
    }
    else {

        // We haven't finished but want to calculate everything properly

        // Distance from current point to next turnpoint...
        // Make sure we aren't further than the next leg is long
        const nextdist = Math.round(Math.min(LatLong.distVincenty( points[0].ll, legs[t].ll),legs[t].length)*10)/10;


        // We will only report next turn point if it isn't the last turn point,
        // also doesn't mean much when we are inside the sector so slightly different display for that
        let nexttp = '';
        tracker.lasttp = lasttp = t;

        if ( t+1 < legs.length ) {
            tracker.status = `${nextdist} km to tp #${t}, ${legs[t].trigraph?legs[t].trigraph+':':''}${legs[t].name}`;
        }
        else {
            tracker.status = nextdist + " km to finish";
        }

        // add rest of task to outstanding distance
        remainingdistance = nextdist;
        hremainingdistance = t < legs.length ? calcHandicap(nextdist,legs[t]) : 0; // Accumulate the handicapped distance

        for(t++; t < legs.length;t++ ) {
            remainingdistance += legs[t].length;
            hremainingdistance += calcHandicap(legs[t].length,legs[t]); // Accumulate the handicapped distance
        }

        // These are the only differences for the display between the two
        // last point and task distance calculations
        maxdistancedone = Math.max( task.task.distance - remainingdistance, 0);
        hdistancedone = Math.max( state.htaskdistance - hremainingdistance, 0);

        log('not finished yet> dd:'+maxdistancedone+', hdd:'+hdistancedone);

        // And draw to where it has been scored
        const scoredTo = LatLong.intermediatePoint(legs[lasttp-1].ll,legs[lasttp].ll,
                                                   legs[lasttp].length/6371,1-(nextdist/legs[lasttp].lengthCenter));

        tracker.scoredpoints.push( [ scoredTo.dlong(), scoredTo.dlat() ] );
    }

    log( tracker.compno + "* start: " + tracker.start + ", finish "+ tracker.finish);

    // establish distance flown and speed
    if( tracker.utcstart && tracker.datafromscoring != 'Y') {

        let elapsed = ((tracker.utcfinish ? tracker.utcfinish : points[0].t) - tracker.utcstart)/3600;
        if( elapsed < 0 ) {
            elapsed = 1000000000000000;
        }
        log( tracker.compno + "* elapsed:"+elapsed+", utcs:"+tracker.utcstart+", utcf:"+tracker.capturedfinishtime );
        log( tracker.compno + "* h distance done:"+hdistancedone+", distance done:"+maxdistancedone );

        tracker.hdistancedone = hdistancedone;
        tracker.distancedone = maxdistancedone;
        tracker.lasttp = lasttp;

        const speed = Math.round( (maxdistancedone * 10) / elapsed )/10; // kph
        const hspeed = Math.round( (hdistancedone * 10) / elapsed )/10; // kph
        if( maxdistancedone > 0 ) {
            tracker.speed = speed;
            tracker.hspeed = hspeed;
        }

        // make sure we aren't too fast and that we have been past start for a few minutes (x/60)
        if( tracker.speed > 180 || tracker.hspeed > 180 || elapsed < (5/60) ) {
            tracker.speed = undefined;
            tracker.hspeed = undefined;
        }

        tracker.remaining = Math.round(remainingdistance*10)/10;
        tracker.hremaining = Math.round(hremainingdistance*10)/10;

        if( points[0].g > 100 ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].g));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].g));
        }

        log( tracker.compno + "* speed:"+tracker.speed+", hspeed:"+tracker.hspeed);
    }

    if( tracker.datafromscoring == 'Y' ) {
        tracker.utcduration = tracker.utcfinish - tracker.utcstart;
        tracker.duration = tracker.utcduration ? durationToText( tracker.utcduration ) : '';
        tracker.remaining = tracker.hremaining = 0;
        tracker.grremaining = tracker.hgrremaining = 0;
    }
}
