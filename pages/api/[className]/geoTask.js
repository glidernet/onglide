/*
 *
 * This will return a GeoJSON object for the task with taskid specified
 *
 */

const db = require('../../../lib/db')
const escape = require('sql-template-strings')

// Helpers to deal with sectors and tasks etc.
import { preprocessSector, sectorGeoJSON } from '../../../lib/taskhelper.js';

import { useRouter } from 'next/router'

export default async function taskHandler( req, res) {
    const {
        query: { className },
    } = req;

    if( !className ) {
        console.log( "no class" );
        res.status(404).json({error: "missing parameter(s)"});
        return;
    }

    let task = await db.query(escape`
      SELECT tasks.*
      FROM tasks, compstatus cs
      WHERE cs.class = ${className} AND cs.datecode = tasks.datecode AND tasks.flown = 'Y' 
    `);

    let tasklegs = await db.query(escape`
      SELECT taskleg.*, nname name, 0 altitude
      FROM taskleg
      WHERE taskleg.taskid = ${task[0].taskid}
      ORDER BY legno
    `);

    // Get the legs ready for handling
    tasklegs.forEach( (leg) => { preprocessSector(leg) } );

    // Prep names and look for duplicates
    let names = {};
    tasklegs[0].text = 'S'; tasklegs[tasklegs.length-1].text = 'F';
    tasklegs.map( (leg) => { if( !leg.text ) {leg.text = leg.legno; }
                             const n = leg.text;
                             if( ! names[leg.trigraph] ) {
                                 names[leg.trigraph] = { point: leg.point, name: n }
                             } else {
                                 names[leg.trigraph].name += '_' + n;
                             }
                           });


    // Check distances (not used at present)
//    const taskLength = calculateTaskLength( tasklegs );

    // Now calculate the objects, they get added to each turnpoint
    tasklegs.forEach( (leg) => { sectorGeoJSON( tasklegs, leg.legno ) });


    let geoJSON = {
	"type": "FeatureCollection",
	"features": []
    };
    
    tasklegs.forEach( (leg) => { geoJSON.features = [].concat( geoJSON.features, [{ 'type': 'Feature', properties: {}, geometry: leg.geoJSON }] ) } );

    const trackLine = {
            "type": "LineString",
	"coordinates": tasklegs.map( (leg) => { return [ leg.ll.dlong(), leg.ll.dlat() ] } ),
    };
    
    // How long should it be cached
//    res.setHeader('Cache-Control','max-age=600');

    // And we succeeded - here is the json
    res.status(200)
	.json({tp:geoJSON, track:trackLine});
}

