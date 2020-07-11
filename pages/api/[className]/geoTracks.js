/*
 *
 * This will return a GeoJSON object for the task with taskid specified
 *
 */

const db = require('../../../lib/db')
const escape = require('sql-template-strings')

import { useRouter } from 'next/router'
import _groupby  from 'lodash/groupby'
import _mapvalues  from 'lodash/mapvalues'

// How far back in time to do we want to show
const historyLength = 600;

export default async function geoTracks( req, res) {
    const {
        query: { className },
    } = req;

    if( !className ) {
        console.log( "no className" );
        res.status(404).json({error: "missing parameter(s)"});
        return;
    }

    // We need to figure out what date is needed as this isn't passed in to the webpage
    const datecode = (await db.query(escape`
      SELECT datecode
      FROM compstatus cs
      WHERE cs.class = ${className}
    `))[0].datecode;

    // Only last 10 minutes
    const latest = (await db.query(escape`
            SELECT MAX(t) maxt FROM trackpoints
             WHERE datecode=${datecode} AND class=${className} `))[0].maxt;

    // Get the points, last
    let points = await db.query(escape`
            SELECT tp.compno, lat, lng, t, altitude a, agl g FROM trackpoints tp
              JOIN (select compno, max(t) mt FROM trackpoints ti WHERE ti.datecode=${datecode} AND ti.class=${className} GROUP by ti.compno) ti 
                ON tp.t > ti.mt - ${historyLength} and tp.compno = ti.compno
             WHERE tp.datecode=${datecode} AND tp.class=${className} ORDER by t DESC`);

    // Group them by comp number, this is quicker than multiple sub queries from the DB
    const grouped = _groupby( points, 'compno' );

    const collection = _mapvalues( grouped, (points) => {
	if( points.length > 1 ) {
	    const pilotGeoJSON = {
		'type': 'LineString',
		'properties': { 'c': points[0].compno, 't': points[0].t },
		'coordinates': points.map( (p) => { return [ p.lng, p.lat ]; } ) ,
	    };   
	    return pilotGeoJSON;
	    //geoJSON.features = [].concat( geoJSON.features, [{ 'type': 'Feature', properties: {}, geometry: pilotGeoJSON }] );
	}
	return null;
    });


    //
    // Generate the track
    let trackJSON = {
	"type": "FeatureCollection",
	"features": []
    };

    Object.keys(collection).forEach( (key) => {
	const pilot = collection[key];
	if( pilot && pilot.coordinates ) {
	    trackJSON.features = [].concat( trackJSON.features,
					    [{ 'type': 'Feature',
					       geometry: pilot }] );
	}
    });

    //
    // Generate the icon
    let locationJSON = {
	"type": "FeatureCollection",
	"features": []
    };

    // Get the latest ones
    Object.keys(grouped).forEach( (key) => {
	const points = grouped[key];
	if( points && points.length > 0 ) {
	    locationJSON.features = [].concat( locationJSON.features,
					       [{ 'type': 'Feature',
						  properties: { 'i': 'circle',
								'c': key,
								'v':(latest-points[0].t>historyLength?'grey':'green'),
								'x': points[0].a + 'm (' + points[0].g + 'm agl)',
								't': points[0].t,
							      },
						  geometry: { 'type': 'Point',
							      'coordinates': [points[0].lng,points[0].lat]
							    }
						}] );
	}
    });
				   
    // How long should it be cached - 2 seconds (increase when websockets are working)
    res.setHeader('Cache-Control','max-age=2');
				     
    res.status(200)
	.json({tracks:trackJSON,locations:locationJSON});
}
