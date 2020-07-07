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



export default async function taskHandler( req, res) {
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
    let latest = (await db.query(escape`
            SELECT MAX(t) maxt FROM trackpoints
             WHERE datecode=${datecode} AND class=${className} `))[0].maxt;
    latest -= 600;

    // Get the points
    let points = await db.query(escape`
            SELECT compno, lat, lng
              FROM trackpoints
             WHERE datecode=${datecode} AND class=${className} AND t > ${latest}
             ORDER BY t DESC`);

    // Group them by comp number, this is quicker than multiple sub queries from the DB
    const grouped = _groupby( points, 'compno' );//function(p) { return p.compno } );


    const collection = _mapvalues( grouped, (points) => {
	if( points.length > 1 ) {
	    const pilotGeoJSON = {
		'type': 'LineString',
		'coordinates': points.map( (p) => { return [ p.lng, p.lat ]; } ) ,
	    };   
	    return pilotGeoJSON;
	    //geoJSON.features = [].concat( geoJSON.features, [{ 'type': 'Feature', properties: {}, geometry: pilotGeoJSON }] );
	}
	return null;
    });


    let trackJSON = {
	"type": "FeatureCollection",
	"features": []
    };

    Object.keys(collection).forEach( (key) => {
	const pilot = collection[key];
	if( pilot && pilot.coordinates ) {
	    trackJSON.features = [].concat( trackJSON.features, [{ 'type': 'Feature', properties: {'c':key}, geometry: pilot }] );
	}
    });

    let locationJSON = {
	"type": "FeatureCollection",
	"features": []
    };

    Object.keys(collection).forEach( (key) => {
	const pilot = collection[key];
	if( pilot && pilot.coordinates ) {
	    locationJSON.features = [].concat( locationJSON.features,
					       [{ 'type': 'Feature',
						  properties: { 'i': 'circle', 'c': key },
						  geometry: { 'type': 'Point',
							      'coordinates': pilot.coordinates[0]
							    }
						}] );
	}
    });

    res.status(200)
	.json({tracks:trackJSON,locations:locationJSON});
}
