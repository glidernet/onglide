/*
 *
 * This will return a GeoJSON object for the task with taskid specified
 *
 */

const db = require('../../../lib/db')
const escape = require('sql-template-strings')

import { useRouter } from 'next/router'
import _groupby  from 'lodash.groupby'
import _mapvalues  from 'lodash.mapvalues'

import { useKVs } from '../../../lib/kv.js';
let kvs = useKVs();

const historyLength = 600;

export default async function taskHandler( req, res ) {
    const {
        query: { className, compno },
    } = req;

    if( !className || !compno) {
        console.log( "no className/compno" );
        res.status(404).json({error: "missing parameter(s)"});
        return;
    }

    // We need to figure out what date is needed as this isn't passed in to the webpage
    const datecode = (await db.query(escape`
      SELECT datecode
      FROM compstatus cs
      WHERE cs.class = ${className}
    `))[0].datecode;

	let trackers = await kvs[className]?.get('trackers');
	const start = (trackers?.[compno]?.utcstart)||0;
	console.log( compno, start, trackers?.[compno] );

    // Get the points
    let points = await db.query(escape`
            SELECT lat, lng, t
              FROM trackpoints
             WHERE datecode=${datecode} AND compno=${compno} AND class=${className} AND t > ${start}
             ORDER BY t DESC`);

    let trackJSON = {
	"type": "FeatureCollection",
	"features": []
    };

    let tLastPoint = 0;
    let lastSegment = []; // array of points
    for( let i = 0; i < points.length; i++ ) {
	const p = points[i];

	// If there is a gap (seconds)
	if( tLastPoint - p.t > 300 ) {

	    // If we only had one point then we will make it into a segment
	    // by duplicating the point
	    if( lastSegment.length == 1 ) {
		lastSegment.push([lastSegment[0][0]+0.0005,lastSegment[0][1]+0.0005]);
	    }

	    // Add to the list
	    trackJSON.features.push(
		{ 'type': 'Feature',
		  'properties': {},
		  'geometry': {
		      "type": "LineString",
		      "coordinates": lastSegment
		  }
		}
	    );
	    lastSegment = [];
	}

	// Add the point and save the time
	lastSegment.push( [p.lng,p.lat] );
	tLastPoint = p.t;
    }

    // Catch the trailing segment
    if( lastSegment.length > 1 ) {
	trackJSON.features.push(
	    { 'type': 'Feature',
	      'properties': {},
	      'geometry': {
		  "type": "LineString",
		  "coordinates": lastSegment
	      }
	    }
	);
    }
	
    res.status(200)
	.json({track:trackJSON});
}
