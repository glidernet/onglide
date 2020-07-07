/* this is from original site, being taken to pieces */
/* Copyright(c)2007-2020, Melissa Jenkins.  All rights reserved */

import LatLong from './LatLong';

import { checkIsInTP, timeToText, durationToText } from './taskhelper.js';


export default function scoreSpeedTask( task, tracker, state, points ) {

    // If we have a handicap distance task then we need to
    // adjust it for our handicap
    // apart from that we treat it exactly the same as a normal speed task
    var handicap = tracker.handicap;

    var task = task.legs;

    // Always start at start for speed scored task
    tracker.scoredpoints = [ [ legs[0].ll.dlong(), legs[0].ll.dlat() ]];

    var t = 1;
    var p = points.length-2;

    let prevdist = Math.round(LatLong.distHaversine( points[p+1].ll, legs[t].ll )*10)/10;
    var prevdistances = [];
    var prevpoint = [];
    var prevtime = [];
    var sectorpoints = 0;
    var maxpoint = 0; // AAT: last point used for scoring
    var insector = 0;

    var distancedone = 0; 
    var hdistancedone = 0; 
    var maxdistancedone = 0;
    var hdistancedone = 0;
    var hremainingdistance = 0;
    var remainingdistance = 0;
    
    const finishLeg = legs.length-1; 

    if( tracker.forcetp != '' ) {
        console.log( tracker.compno + "* forcetp: " + tracker.forcetp );
        tracker.forcetp = parseInt(tracker.forcetp);

        while( t < tracker.forcetp ) {
            distancedone += legs[t].length; 
            hdistancedone += (100.0*legs[t].length)/Math.max(tracker.handicap+legs[t].hi,25); // Accumulate the handicapped distance
 	    tracker.scoredpoints.push( [ legs[t].ll.dlong(), legs[t].ll.dlat() ] );
            t++;
        }
    }

    //    console.log( "------------------------------------------------------------" );
    while( p >= 0 && t < legs.length ) {

        // Skip over points that are too close in distance, this should ignore thermalling
        // we really want about a 2.5 k jump
        var forward = p+1;
	var accumulated = 0;
	
        do {
            var skipmore = 0;

	    if( legs[t].type == 'sector' ) {

                // check if we are in the sector - skip on tps that don't have sectors...
                if( checkIsInTP(legs[t], points[p]) >= 0 ) {
		    sectorpoints++;
		    insector = 1;
		    console.log( tracker.compno + "* in sector " + t + " at " + timeToText(points[p].t));
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
        var curdist = LatLong.distHaversine( points[p].ll, legs[t].ll);
        var advancetp = 0;
	
        // Store these and only keep previous 3
        prevdistances.push( curdist );
        prevpoint.push( points[p].ll );
        prevtime.push( points[p].t );

        if( prevdistances.length > 3 ) {
            prevdistances.shift();
            prevpoint.shift();
            prevtime.shift();
        }

//	console.log( tracker.compno + " ---> " + insector + ", " + sectorpoints + ", t " + t );
	
	// Check for the finish, if it is then only one point counts and we can stop tracking
	if( t == finishLeg && sectorpoints > 0 )  {
	    console.log( tracker.compno + "* found a finish " + points[p].t );
	    tracker.utcfinish = points[p].t;
	    finish = points[p].t;
	    tracker.finish = timeToText( tracker.utcfinish );
	    t++;
	}

        // If we don't have 3 previous distances then skip this point
        else if( prevdistances.length == 3 ) {

            // If we aren't in the sector but we have some points in what we consider to be the sector then we will advance it
            if( ! insector && sectorpoints > 0 ) {
                console.log( tracker.compno + "* next tp:" + t + "/"+insector + ",sp:"+sectorpoints );
                advancetp = 1;
            }

	    
            // Allow for a dog leg - ie closer and then further
            // most recent two point may be the departure rather than
            // the entry so we need to look back an extra one
	    var timeTaken = (prevtime[2] - prevtime[0]);
	    var achievedSpeed = ((prevdistances[0] + prevdistances[2]) / timeTaken );
	    var possibleSpeed = (timeTaken > 600 ? 120 : 240)/3600;
            if ( t !== finishLeg && curdist > prevdistances[1] && 
                 achievedSpeed < possibleSpeed ) {
		console.log( tracker.compno + "* dog leg "+t+", "+ (prevdistances[0]+prevdistances[2]) + "km in " + timeTaken +
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

    console.log( tracker.compno + "* leg t" + t + " length " + legs.length);

    ///////////////////////////////////////////
    // Output the information about how the task is going here
    ///////////////////////////////////////////

    if( t == legs.length ) {
	console.log( tracker.compno + "* finish leg" );
        tracker.status = "finished";

        // Store away our finish
        if( ! tracker.capturedfinishtime && tracker.datafromscoring == 'N' ) {
	    tracker.dbstatus = 'F';
	    tracker.utcfinish = tracker.capturedfinishtime = points[p>0?p:0].t;
            tracker.finish = timeToText( tracker.utcfinish );
	    tracker.utcduration = tracker.utcfinish - tracker.utcstart;
	    tracker.duration = durationToText( tracker.utcduration );
            console.log( tracker.compno + "* captured finish time: "+timeToText(tracker.utcfinish));
        }

	// not relevant on a finished task
        tracker.remaining = undefined;
        tracker.hremaining = undefined;
        tracker.grremaining = undefined;
        tracker.hgrremaining = undefined;

        var lasttp = t-1;
	console.log( "XX leg " + (lasttp-1) + "," + legs[lasttp].length );
	var scoredTo = LatLong.intermediatePoint(legs[lasttp-1].ll,legs[lasttp].ll,
						 (legs[lasttp].lengthA)/6371,(legs[lasttp].length/legs[lasttp].lengthA));
 	tracker.scoredpoints.push( [ scoredTo.dlong(), scoredTo.dlat() ] );
	
	// pass onwards as the reference numbers rather than any calculations
        maxdistancedone = task.distance;
        hdistancedone = tracker.htaskdistance;
    }
    else {
	    
	// We haven't finished but want to calculate everything properly

        // Distance from current point to next turnpoint...
	// Make sure we aren't further than the next leg is long
        var nextdist = Math.round(Math.min(LatLong.distVincenty( points[0].ll, legs[t].ll),legs[t].length)*10)/10;


        // We will only report next turn point if it isn't the last turn point,
        // also doesn't mean much when we are inside the sector so slightly different display for that
        var nexttp = '';
        tracker.lasttp = t;

        if ( t+1 < legs.length ) {
            tracker.status = nextdist + " km to tp #"+t+", "+legs[t].trigraph+" ("+legs[t].name+")";
        }
        else {
	    tracker.status = nextdist + " km to finish";
        }

        // add rest of task to outstanding distance
        var lasttp = t;
        remainingdistance = nextdist;
        hremainingdistance = t < legs.length ? (100.0*nextdist)/Math.max(handicap+legs[t].hi,25) : 0; // Accumulate the handicapped distance

        for(t++; t < legs.length;t++ ) {
            remainingdistance += legs[t].length;
            hremainingdistance += (100.0*legs[t].length)/Math.max(handicap+legs[t].hi,25); // Accumulate the handicapped distance
        }

        // These are the only differences for the display between the two
        // last point and task distance calculations
        maxdistancedone = Math.max( task.distance - remainingdistance, 0);
        hdistancedone = Math.max( tracker.htaskdistance - hremainingdistance, 0);

	// And draw to where it has been scored
	var scoredTo = LatLong.intermediatePoint(legs[lasttp-1].ll,legs[lasttp].ll,
						 legs[lasttp].length/6371,1-(nextdist/legs[lasttp].lengthA));
	    
 	tracker.scoredpoints.push( [ scoredTo.dlong(), scoredTo.dlat() ] );
    }
    
    console.log( tracker.compno + "* " + tracker.start + ", finish "+ tracker.finish);

    // establish distance flown and speed
    if( tracker.utcstart && tracker.datafromscoring != 'Y') {

        var elapsed = ((tracker.utcfinish ? tracker.utcfinish : points[0].t) - tracker.utcstart)/3600;
        if( elapsed < 0 ) {
            elapsed = 1000000000000000;
        }
        console.log( tracker.compno + "* elapsed:"+elapsed+", utcs:"+tracker.utcstart+", utcf:"+tracker.capturedfinishtime );
        console.log( tracker.compno + "* hdd:"+hdistancedone+", mhdd:"+maxdistancedone );

        tracker.hdistancedone = hdistancedone;
        tracker.distancedone = maxdistancedone;
	tracker.lasttp = lasttp;

        var speed = Math.round( (maxdistancedone * 10) / elapsed )/10; // kph
        var hspeed = Math.round( (hdistancedone * 10) / elapsed )/10; // kph
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

 	if( ! tracker.stationary ) {
            tracker.grremaining = Math.round((remainingdistance*1000)/(points[0].agl));
            tracker.hgrremaining = Math.round((hremainingdistance*1000)/(points[0].agl));
	}

        console.log( tracker.compno + "* speed:"+speed+", hspped:"+hspeed);
    }
}
