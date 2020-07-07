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

import _groupby  from 'lodash/groupby'
import _map  from 'lodash/map'
import _foreach  from 'lodash/foreach'
import _clone  from 'lodash/clone'

import Keyv from 'keyv'

// Helpers to deal with sectors and tasks etc.
import { preprocessSector, sectorGeoJSON, checkIsInTP } from '../../../lib/taskhelper.js';
import findStart from '../../../lib/scorefindstart.js';

//import scoreSpeedTask = '../../../lib/scorespeedtask'

// Different scoring techniques
import scoreAssignedAreaTask from '../../../lib/scoreassignedareatask'

/*
const cacheableResponse = require('cacheable-response')

export default async function scoreTask( req,res ) {

    const ssrCache = cacheableResponse({
	get: ({ req, res }) => ({
	    data: scoreSpeedTask(req,res),
	    ttl:  60000 // 1 minute
	}),
	send: ({ data, res, req }) => res.send(data)
    })
    
}
*/

const fetcher = url => fetch(url).then(res => res.json());

export default async function scoreTask( req, res ) {
    const {
	query: { className },
    } = req;

    if( !className ) {
	console.log( "no class" );
	res.status(404).json({error: "missing parameter(s)"});
	return;
    }

    // Fetch the tasks, legs, competition rules etc.  Needed for scoring
    let task = await fetcher('http://localhost:3000/api/'+className+'/task')
    if( ! task || ! task.task || ! task.task.type ) {
	console.log( 'no task for class: ' + className );
	res.status(404).json({error:'no task for class: ' + className});
	return;
    }
	
    // Fetch the tasks, legs, competition rules etc.  Needed for scoring
    const rawpilots = await fetcher('http://localhost:3000/api/'+className+'/pilots')
    if( ! rawpilots || ! rawpilots.pilots || ! rawpilots.pilots.length ) {
	console.log( 'no pilots for class: ' + className );
	res.status(404).json({error:'no pilots for class: ' + className});
	return;
    }

    // Decorate the tasks so we have sectors in geoJSON format, we need this
    // for point in polygon etc
    task.legs.forEach( (leg) => preprocessSector(leg) );
    task.legs.forEach( (leg) => sectorGeoJSON( task.legs, leg.legno ) );

    // Next up we will fetch a list of the pilots and their complete tracks
    // This is going to be a big query
    let rawpoints = await db.query(escape`
            SELECT compno, t, lat, lng, altitude a
              FROM trackpoints
             WHERE datecode=${task.contestday.datecode} AND class=${className}
            ORDER BY t DESC`);

    // Group them by comp number, this is quicker than multiple sub queries from the DB
    let points = _groupby( rawpoints, 'compno' );
    const pilots = _groupby( rawpilots.pilots, 'compno' );

    // We want to keep track of what we have scored before as this algo has always been
    // iterative. We expect them to have some values so initialise them correctly
    // NOTE: *trackers* is what is returned, it is an amalgam of the database data
    //         and the scored data (mergeDB to get DB and then scoring updates)
    //       *state* is internal calculation and wil depend on the type of task
    //         eg for AAT it stores the djikstra working set
    let kv = new Keyv({namespace: 'scoring_'+className});
//    kv.clear();
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

    // Generate LatLong and geoJSON objects for each point for each pilot
    // Also record min and max alititude (metres)
    _foreach( points, (ppoints,compno) => {
	_foreach( ppoints, (p) => {
	    p.ll = new LatLong( p.lat, p.lng );
	    p.geoJSON = point([p.lng,p.lat]);
	    trackers[compno].min = Math.min(trackers[compno].min,p.a);
	    trackers[compno].max = Math.max(trackers[compno].max,p.a);
	})
    });

    // Merge what we have on the pilot result from the database into the
    // tracker object.  This makes sure we know what scoring has reported
    // so when the pilot is scored we can display the actual scores on the screen
    _foreach( pilots, (pilot,compno) => {
	trackers[compno] = mergeDB(pilot[0],trackers[compno]);
	trackers[compno].taskduration = task.task.durationsecs;
    });

    // Next step for all types of task is to confirm we have a valid start
    _foreach( trackers, (pilot,compno) => findStart( trackers[compno], state[compno], task.legs, points[compno] ) );

    // Actually score the task
    let results = '';
    switch( task.task.type ) {
    case 'A': // Assigned Area Task
	results = _map( points, (points,compno) => scoreAssignedAreaTask(task.legs, trackers[compno], state[compno], points ) );
	//scoreAssignedAreaTask(task.legs, trackers['WO'], points['WO']);
	break;
    case 'S': // speed task
//	results = _map( points, (points,compno) => scoreSpeedTask(task.legs, trackers[compno], state[compno], points ) );
	break;
    case 'D': // distance handicapped task
//	results = _map( points, (points,compno) => scoreDistanceHandicapTask(task.legs, trackers[compno], state[compno], points ) );
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
	if( pilot.scoredpoints && pilot.scoredpoints.length) pilot.scoredGeoJSON = lineString(pilot.scoredpoints,{})
	pilot.altitude = points[pilot.compno] ? points[pilot.compno][0].a : undefined;
    } );

    // Store our calculations away, we don't need to wait for this to return
    // This means we won't need to reprocess every track point the next time
    // round
    kv.set('trackers',trackers);
    kv.set('state',state);

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
                             'hspeed', 'speed', 'hdistance', 'distance', 'forcetp' ];
	    
            copyKeys.forEach( function(value) {
		tracker[value] = pilot[value];
            } );
	}
    }

    return tracker;
}

