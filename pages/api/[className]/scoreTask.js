/*
 * The first of our scoring functions, this will process the points array for each pilot and produce a score
 * and make it available
 *
 */
const db = require('../../../lib/db')
const escape = require('sql-template-strings')
import { useRouter } from 'next/router'


import LatLong from '../../../lib/LatLong';
import { point,lineString } from '@turf/helpers';
import { useKVs } from '../../../lib/kv.js';

import _groupby  from 'lodash.groupby'
import _map  from 'lodash.map'
import _foreach  from 'lodash.foreach'
import _clone  from 'lodash.clone'
import _maxby  from 'lodash.maxby'

import Keyv from 'keyv'

// Helpers to deal with sectors and tasks etc.
import { preprocessSector, sectorGeoJSON, checkIsInTP } from '../../../lib/taskhelper.js';
import findStart from '../../../lib/scorefindstart.js';

//import scoreSpeedTask = '../../../lib/scorespeedtask'

// Different scoring techniques
import scoreAssignedAreaTask from '../../../lib/scoreassignedareatask'
import scoreSpeedTask from '../../../lib/scorespeedtask'
import scoreDistanceHandicapTask from '../../../lib/scoredistancehandicaptask'

// Helper
const fetcher = url => fetch(url).then(res => res.json());

// We want to keep track of what we have scored before as this algo has always been
// iterative. We expect them to have some values so initialise them correctly
// NOTE: *trackers* is what is returned, it is an amalgam of the database data
//         and the scored data (mergeDB to get DB and then scoring updates)
//       *state* is internal calculation and wil depend on the type of task
//         eg for AAT it stores the djikstra working set
//       *tasks* is the task data
let kvs = useKVs();

//
// Function to score any type of task - checks the task type field in the database
// to decide how to delegate to the various different kinds of tasks
export default async function scoreTask( req, res ) {
    const {
        query: { className },
    } = req;

    if( !className ) {
        console.log( "no class" );
        res.status(404).json({error: "missing parameter(s)"});
        return;
    }

    // We want to keep track of what we have scored before as this algo has always been
    // iterative. We expect them to have some values so initialise them correctly
    // The cache is per class as each class has different scoring and we need to be
    // able to do them all at once.
    //
    // NOTE: *trackers* is what is returned, it is an amalgam of the database data
    //         and the scored data (mergeDB to get DB and then scoring updates)
    //       *state* is internal calculation and wil depend on the type of task
    //         eg for AAT it stores the djikstra working set
    //       *tasks* is the task data
    let kv = kvs[className];
    if( ! kvs[className] ) {
        console.log( className + " new kv store created");
        kvs[className] = kv = new Keyv({namespace: 'scoring_'+className});

    }
    const now = Date.now();
    const startProfiling = process.hrtime();

    // Fetch the tasks, legs, competition rules etc.  Needed for scoring
    // try cache
    let task = await kv.get('task');
    let rawpilots = await kv.get('pilots');
    if( (!task || !task.ts || (task.ts+600*1000) < now ) ||
        (!rawpilots || ! rawpilots.ts || (rawpilots.ts+600*1000)<now )) {

        // and if it's stale then get from the api
        task = await fetcher('http://'+process.env.API_HOSTNAME+'/api/'+className+'/task')
        if( ! task || ! task.task || ! task.task.type ) {
            console.log( 'no task for class: ' + className );
            res.status(404).json({error:'no task for class: ' + className});
            return;
        }

        rawpilots = await fetcher('http://'+process.env.API_HOSTNAME+'/api/'+className+'/pilots')
        if( ! rawpilots || ! rawpilots.pilots || ! rawpilots.pilots.length ) {
            console.log( 'no pilots for class: ' + className );
            res.status(404).json({error:'no pilots for class: ' + className});
            return;
        }

        // Store what we have received so we don't need to query till it expires
        // which is handled below
        task.ts = rawpilots.ts = now;
        kv.set('pilots',rawpilots);
        kv.set('task',task);
    }

    // Decorate the tasks so we have sectors in geoJSON format, we need this
    // for point in polygon etc, this isn't cached as we can't serialise functions
    // geoJSON probably is but tidier to just redo it here than confirm and not very expensive
    task.legs.forEach( (leg) => preprocessSector(leg) );
    task.legs.forEach( (leg) => sectorGeoJSON( task.legs, leg.legno ) );

    // Next up we will fetch a list of the pilots and their complete tracks
    // This is going to be a big query
    let rawpoints = await db.query(escape`
            SELECT compno, t, lat, lng, altitude a, agl g
              FROM trackpoints
             WHERE datecode=${task.contestday.datecode} AND class=${className}
            ORDER BY t DESC`);

    /*    if( ! rawpoints || rawpoints.length == 0 ) {
          console.log( "no tracking yet" );
          res.status(200)
          .json({pilots:{}});
          return;
          } */

    // We need to make sure our cache is valid - this is both to confirm it hasn't
    // gone back in time more than our check interval (for running sample site)
    // and that the taskid hasn't changed (eg from a new contest day)
    const cacheTScheck = await kv.get('cacheTScheck');
    const cacheTaskId = await kv.get('cacheTaskId');
    //    console.log( className+' Cache Check: '+cacheTScheck+' vs '+rawpoints[0].t+', Cache Task Id:'+cacheTaskId+', task.id:'+task.task.taskid);
    if( (cacheTScheck && cacheTScheck > rawpoints[0].t) || (cacheTaskId && cacheTaskId != task.task.taskid) ) {
        kv.clear();
        console.log(className + " stale cache, fail request");
        res.status(503)
            .json({error:'stale cache'});
        return;
    }
    kv.set('cacheTScheck',(rawpoints[0]&&rawpoints[0].t)||0);
    kv.set('cacheTaskId',task.task.taskid);

    // Group them by comp number, this is quicker than multiple sub queries from the DB
    let points = _groupby( rawpoints, 'compno' );
    const pilots = _groupby( rawpilots.pilots, 'compno' );

    // Now we can get our tracker history and internal state for scoring, the scoring routines
    // should be iterative so don't need to reprocess all points.
    let trackers = await kv.get('trackers');
    if( ! trackers ) {
        trackers = {};
        _foreach( pilots, (undefined,compno) => { trackers[compno] = {}; trackers[compno].min = 9999999999; trackers[compno].max = 0 } );
    }
    let state = await kv.get('state');
    if( ! state ) {
        state = {};
        _foreach( pilots, (undefined,compno) => { state[compno] = {}} );
    }

    // Merge what we have on the pilot result from the database into the
    // tracker object.  This makes sure we know what scoring has reported
    // so when the pilot is scored we can display the actual scores on the screen
    _foreach( pilots, (pilot,compno) => {
        trackers[compno] = mergeDB(pilot[0],trackers[compno]);
        trackers[compno].taskduration = task.task.durationsecs;
    });

    // Generate LatLong and geoJSON objects for each point for each pilot
    // Also record min and max alititude (metres)
    _foreach( points, (ppoints,compno) => {
        if( ! trackers[compno] ) {
            console.log( compno + "missing" );
            return;
        }

		var tracker = trackers[compno];

        _foreach( ppoints, (p) => {
            p.ll = new LatLong( p.lat, p.lng );
            p.geoJSON = point([p.lng,p.lat]);
            tracker.min = Math.min(tracker.min,p.a);
            tracker.max = Math.max(tracker.max,p.a);
        })
		console.log( compno, tracker.min, tracker.max );

        // Enrich with the height information
        if( ppoints.length > 0 ) {
            tracker.altitude = ppoints[0].a;
            tracker.agl = ppoints[0].g;
            tracker.lastUpdated = ppoints[0].t;
        }
    });

    // Next step for all types of task is to confirm we have a valid start
    // Note that this happens throughout the flight regardless of how many turnpoints
    // have been flown, however to register as a new start the pilot must exit start sector and enter
    // 1st turn (or 3km near it). There is a restriction to stop it checking more than every 60 seconds
    _foreach( trackers, (pilot,compno) => findStart( trackers[compno], state[compno], task.legs, points[compno] ) );

    // Actually score the task
    switch( task.task.type ) {
    case 'A': // Assigned Area Task
        _map( points, (points,compno) => scoreAssignedAreaTask( task, trackers[compno], state[compno], points )  );
        //scoreAssignedAreaTask(task.legs, trackers['WO'], points['WO']);
        break;
    case 'S': // speed task
        _map( points, (points,compno) => scoreSpeedTask( task, trackers[compno], state[compno], points ) );
        break;
    case 'D': // distance handicapped task (needs to know the maximum handicap to score it properly)
        _map( points, (points,compno) => scoreDistanceHandicapTask( task, trackers[compno], state[compno], points, _maxby(trackers,'handicap') ));
        break;
    default:
        const error = 'no scoring function defined for task type: ' + task.task.type;
        console.log( error );
        res.status(404).json({error:error});
        return;
    }

    // Update the geoJSON with the scored trackline so we can easily display
    // what the pilot has been scored for
    _foreach( trackers, (pilot) => {
        if( pilot ) {
            if( pilot.scoredpoints && pilot.scoredpoints.length>1 ) {
                pilot.scoredGeoJSON = lineString(pilot.scoredpoints,{})
            }
            else {
                delete pilot.scoredpoints;
            }
        }});

    // Update the vario
    //    _map( points, (points,compno) => calculateVario( trackers[compno], state[compno], points )  );

    // Store our calculations away, we don't need to wait for this to return
    // This means we won't need to reprocess every track point the next time
    // round
    kv.set('trackers',trackers);
    kv.set('state',state);

    const profiled = process.hrtime(startProfiling);
    console.info(className+' * scored, time (elapsed): %d seconds', Math.round(1000*(profiled[0] + (profiled[1] / 1000000000)))/1000 );

    // How long should it be cached
    res.setHeader('Cache-Control','max-age=60');

    // Return the results, this returns basically the same as the pilot
    // API call except it will be enriched with results if we have any
    res.status(200)
        .json({pilots:trackers});
}


//
// Merge the DB record (pilot) into the local state (tracker)
///
function mergeDB( pilot, tracker )
{

    if( ! tracker || ! tracker.compno ) {
        tracker = _clone(pilot);       // by default use the db settings
        tracker.maxdistancedone = 0;   // how far, 0 isn't far
        tracker.min = 999999999999;    // heights
        tracker.max = 0;
        if( tracker.datafromscoring == 'N' ) {
            tracker.utcstart = undefined;
            tracker.start = '00:00:00';
            tracker.utcfinish = undefined;
        }
    }

    else {
        // Until we have scoring we will keep our internal calculations
        var copyKeys = [ 'dayrankordinal', 'lasttp', 'totalrank', 'prevtotalrank', 'lolat' ,'lolong', 'loreported', 'lonear',
                         'statustext', 'utctime', 'datafromscoring', 'lolat', 'lolng', 'looriginal',
                         'forcetp' ];

        copyKeys.forEach( function(value) {
            tracker[value] = pilot[value];
        } );

        // If it has been scored or has a finish time in the database then copy the rest of the data over
        if( pilot.datafromscoring == 'Y' || pilot.finish == 'Y' ) {
            var copyKeys = [ 'start', 'utcstart', 'finish', 'utcfinish', 'dbstatus', 'statustext', 'utctime', 'datafromscoring',
                             'hspeed', 'speed', 'hdistancedone', 'distancedone', 'forcetp' ];

            copyKeys.forEach( function(value) {
                tracker[value] = pilot[value];
            } );
        }
    }

    return tracker;
}


function calculateVario( tracker, state, points ) {

    // If we have a real score then we are not flying so don't report this...
    // same if no points
    if( tracker.datafromscoring == 'Y' || points.length < 1 ) {
        tracker.gainXsecond = undefined;
        tracker.lossXsecond = undefined;
        tracker.min = undefined;
        tracker.max = undefined;
        tracker.Xperiod = undefined;
        tracker.altitude = undefined;
        tracker.agl = undefined;
        return;
    }

    let p = 0;

    // How far are we scanning
    const firstTime = points[p].t;
    const endVarioTime = firstTime - 60;
    const endTime = Math.min(endVarioTime, (state.lastVarioTime ? state.lastVarioTime : points[points.length-1].t));

    // Save away our latest altitude
    tracker.altitude = points[0].a;
    tracker.agl = points[0].g;
    tracker.gainXsecond = 0;
    tracker.lossXsecond = 0;
    tracker.Xperiod = 0;

    while( p < points.length-1 && points[p].t > endTime) {
        const pt = points[p];

        tracker.min = Math.min(tracker.min,pt.a);
        tracker.max = Math.max(tracker.max,pt.a);

        if( pt.t > endVarioTime ) {
            var diff = pt.a - points[p+1].a;
            if( diff > 0 ) {
                tracker.gainXsecond += diff;
            }
            else {
                tracker.lossXsecond += diff;
            }
            tracker.Xperiod = firstTime - points[p+1].t;
        }
        p++;
    }

    // So we know
    state.lastVarioTime = points[p].t;

    // So it doesn't display if we didn't record it
    var climbing = false;
    if( tracker.Xperiod && tracker.Xperiod < 90 ) {
        tracker.gainXsecond = Math.round(tracker.gainXsecond*10)/10;
        tracker.lossXsecond = Math.round(tracker.lossXsecond*10)/10;
        // 9.87 = feet/minute to knots
        // 60 = m/minute to m/sec
        tracker.averager = Math.round(((tracker.gainXsecond + tracker.lossXsecond) / tracker.Xperiod )*10)/10;
        //        tracker.averager = Math.round(((tracker.gainXsecond + tracker.lossXsecond) / tracker.Xperiod) * 60 / (map.og_units?9.87:6))/10;
    }
    else {
        tracker.gainXsecond = undefined;
        tracker.lossXsecond = undefined;
        tracker.averager = undefined;
        tracker.Xperiod = undefined;
    }
}
