/*
 *
 * This will return a GeoJSON object for the task with taskid specified
 *
 */

const db = require('../../../lib/db')
const escape = require('sql-template-strings')
import LatLong from '../../../lib/LatLong';

import _sumBy from 'lodash/sumBy';

import { useRouter } from 'next/router'

var _2pi = Math.PI*2;

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


    console.log( tasklegs );

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


    // Check distances
    const taskLength = calculateTaskLength( tasklegs );

    // Now calculate the objects, they get added to each turnpoint
    tasklegs.forEach( (leg) => { drawTurnpoint( tasklegs, leg.legno ) });


    let geoJSON = {
	"type": "FeatureCollection",
	"features": []
    };
    
    tasklegs.forEach( (leg) => { geoJSON.features = [].concat( geoJSON.features, [{ 'type': 'Feature', properties: {}, geometry: leg.geoJSON }] ) } );

    const trackLine = {
            "type": "LineString",
	"coordinates": tasklegs.map( (leg) => { return [ leg.ll.dlong(), leg.ll.dlat() ] } ),
    };
//    };

   // geoJSON.features = [].concat( geoJSON.features, trackLine );
    
    // How long should it be cached
//    res.setHeader('Cache-Control','max-age=600');

    // And we succeeded - here is the json
res.status(200)
//        .json(tasklegs[0].geoJSON )
		      //        .json({task: task, legs: tasklegs })
    .json({tp:geoJSON, track:trackLine});
}

// Between LEGS!
function calculateTaskLength( task ) {

    // This is one place where the leg length does matter
    let i = 1;
    for( i = 1; i < task.length; i++ ) {
        console.log( "leg "+i+" db length:"+task[i].length+", length haversine: " + LatLong.distHaversine(task[i-1].ll,task[i].ll ) +", length vincenty: " + LatLong.distVincenty(task[i-1].ll,task[i].ll ));
        task[i].length = task[i].lengthA = LatLong.distVincenty(task[i-1].ll, task[i].ll );

    }

    // If it is the last point then we need to reduce it by the radius of the finish ring
    if( task[i-1].type == 'sector' && task[i-1].a1 ==180 ) {
        console.log( "reducing last leg by radius of finish ring" +task[i-1].r1);
        task[i-1].length -= task[i-1].r1;
    }

    // Return the length of the task
    return _sumBy( task, 'length' );
}

function preprocessSector( tp ) {

    // Save the point in GeoJSON ordering and calculate maximum radius
    tp.point = [ tp.nlng, tp.nlat ];
    tp.maxR = Math.max(tp.r1,tp.r2);

    // Help speed up turnpoint checking
    if( tp.type == 'sector' && tp.a1 == 180 && ! tp.a12 && !tp.r2 ) {
        tp.quickSector = 1;
    }

    tp.ll = new LatLong( tp.nlat, tp.nlng );
}


function drawTurnpoint( task, tpno ) {

    var polypoints = [];
    var turnpoint = task[tpno];

    var symmetric = 0;
    var np = 9999;
    var pp = 9999;

    var ltlg = turnpoint.ll;

    var a1 = -1, a2 = -1;
    if( tpno < task.length-1 ) {
        var ltlgn = task[tpno+1].ll;
        np = a1 = LatLong.radToDBrng(LatLong.bearing( ltlg, ltlgn ));
    }

    if( tpno >= 1 ) {
        var ltlgp = task[tpno-1].ll;
        pp = a2 = LatLong.radToDBrng(LatLong.bearing( ltlg, ltlgp ));
        console.log( "2b) pp=" + pp );

    }


    if( np == 9999 ) {
        np = pp;
    }

    if( pp == 9999 ) {
        pp = np;
    }

    var center = 0;
    switch( turnpoint.direction ) {
    case "symmetrical":
        if( a1 != -1 && a2 != -1 ) {
            var x1 = a1-a2;
            if( x1 < 0 ) {
                x1 += _2pi;
            }
            var x2 = a2-a1;
            if( x2 < 0 ) {
                x2 += _2pi;
            }
            var minAngle = Math.min(x1,x2);
            if( (a1+minAngle)%_2pi == a2 ) {
                center = (a1+minAngle/2+Math.PI)%_2pi;
            }
            else {
                center = (a2+minAngle/2+Math.PI)%_2pi;
            }
        }
        break;
    case "np":
        center = (np + Math.PI) % (2*Math.PI);
        break;
    case "pp":
        center = (pp + Math.PI) % (2*Math.PI);
        break;
    case "fixed":
        if( typeof turnpoint.a12 !== 'undefined' && ! isNaN(turnpoint.a12) && turnpoint.a12 !== '') {
            center = ((turnpoint.a12*Math.PI/180) + Math.PI) % (2*Math.PI);
            //            center = ((turnpoint.a12*Math.PI/180)) % (2*Math.PI);
        } else {
            console.log( 'No A12 specified' );
        }
        break;
    default:
        console.log( turnpoint.direction + " not implemented yet" );
        break;
    }

    // some sanity checking - we should really report this
    if( turnpoint.r2 > turnpoint.r1 ) {
        turnpoint.r2 = turnpoint.r1;
    }

    if( turnpoint.a1 > 180 ) {
        turnpoint.a1 = 180;
    }

    if( turnpoint.a2 > 180 ) {
        turnpoint.a2 = 180;
    }

    turnpoint.centerAngle = (center + 2*Math.PI)%(2*Math.PI);;
    turnpoint.centerAngleRaw = center;

    // Needed for both line and sectors
    var a1rad = turnpoint.a1*Math.PI/180;
    var from = (2*Math.PI+(center - a1rad))%(2*Math.PI);
    var to = (2*Math.PI+(center + a1rad))%(2*Math.PI);

    switch( turnpoint.type )
    {
        case "line":
        console.log( "line: from:" + from + ", to:" + to + ", r1:"+turnpoint.r1  );

        var dltlg = ltlg.destPointRad( from, turnpoint.r1 );
        polypoints = [].concat( polypoints, [ dltlg.dlong(), dltlg.dlat() ] );
        dltlg = ltlg.destPointRad( to, turnpoint.r1 );
        polypoints = [].concat( polypoints, [ dltlg.dlong(), dltlg.dlat() ] );
        turnpoint.geoJSONtype = 'LineString';
        break;

        case "sector":
        console.log( "sector: from:" + from + ", to:" + to + ", r1:"+turnpoint.r1 + ",r2:"+turnpoint.r2 );

	if( turnpoint.a1 != 180 ) {
	    console.log('!180');
	    polypoints.push( [ ltlg.dlong(), ltlg.dlat() ] );
        }

        polypoints = [].concat( polypoints, addArc( from, to, ltlg, turnpoint.r1, turnpoint.r2 ) );

        // something has been configured for turnpoint a2
        //turnpoint a2 has been configured and has a radius
        if( turnpoint.a2 != 0 && ! isNaN( turnpoint.a2 ) && ! isNaN( turnpoint.r2 ) &&
            Math.round(Math.abs(turnpoint.a2)) == Math.round(Math.abs(turnpoint.a1)) && turnpoint.r1 != turnpoint.r2  &&
            turnpoint.r2 != 0 ) {

            console.log( "(neg) a1:"+turnpoint.a1, ", a2:"+turnpoint.a2 );

            polypoints = [].concat( polypoints, addArc( center + (turnpoint.a1*Math.PI/180),
                                                        center - (turnpoint.a1/180*Math.PI),
                                                        ltlg, turnpoint.r2, 1 ));
        }
        else if( turnpoint.a2 != 0 && ! isNaN( turnpoint.a2 ) && ! isNaN( turnpoint.r2 ) &&
                 turnpoint.a1 != turnpoint.a2 &&
                 turnpoint.r1 != turnpoint.r2 ) {

            console.log( "! a1:"+turnpoint.a1, ", a2:"+turnpoint.a2 );

            polypoints = [].concat( polypoints, addArc( center + (turnpoint.a1*Math.PI/180),
                                                        center + (turnpoint.a2/180*Math.PI),
                                                        ltlg, turnpoint.r2 ) );

            if( turnpoint.a2 != 180 ) {
		polypoints.push( [ ltlg.dlong(), ltlg.dlat() ] );
            }

            polypoints = [].concat( polypoints, addArc( center - (turnpoint.a2/180*Math.PI),
                                                        center - (turnpoint.a1*Math.PI/180),
                                                        ltlg, turnpoint.r2 ) );

        }
        //turnpoint a2 has been configured and has a radius
        else if( turnpoint.a2 == 0 && turnpoint.r1 != turnpoint.r2  &&
                 turnpoint.r2 != 0 ) {

            polypoints = [].concat( polypoints, addArc( center + (turnpoint.a1*Math.PI/180),
                                                        center - (turnpoint.a1/180*Math.PI),
                                                        ltlg, turnpoint.r2, 0 ));
        }
        else if( turnpoint.a1 != 180 ) {
	    console.log('180');
            polypoints.push( [ ltlg.dlong(), ltlg.dlat() ] );
        }

        turnpoint.geoJSONtype='Polygon';
        break;
    }

    // Reduce precision
    polypoints.forEach( (p) => { p[0] = Math.round(100000*p[0])/100000; p[1] = Math.round(100000*p[1])/100000; } );

    // Save these away
    //    turnpoint.polygon = polypoints[0];
    turnpoint.geoJSON = {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'geometry': {
                'type': turnpoint.geoJSONtype,
                'coordinates': [ polypoints ],
            }
        }
    };
    turnpoint.geoJSON = {
        'type': turnpoint.geoJSONtype,
        'coordinates': [ polypoints ],
    };
}

// Iterate over an arc adding the appropriate points
function addArc( startAngle, endAngle, ltlg, radius, backwards ) {

    // accumulate the points and return them
    let points = [];

    if( Math.round(((2*Math.PI+startAngle)%(Math.PI*2))*20) == Math.round(((2*Math.PI+endAngle)%(Math.PI*2))*20) ) {
        for( var i = 2*Math.PI, adj = Math.PI/40; i >= 0; i -= adj ) {
            var dltlg = ltlg.destPointRad( i % (2*Math.PI), radius);
            points.push( [ dltlg.dlong(), dltlg.dlat() ] );
        }
        points.push( pointAtRadius( ltlg, 2*Math.PI, radius ) );
    }
    else if( 0 ) {
        if( startAngle < endAngle )    {
            for( var i = startAngle, adj = (endAngle-startAngle)/40, ea = Math.round(endAngle*100); Math.round(i*100) <= ea; i -= adj ) {
                var dltlg = ltlg.destPointRad( i, radius );
                points.push( [ dltlg.dlong(), dltlg.dlat() ] );
            }

        }
        else {
            for( var i = startAngle, adj = ((_2pi+(startAngle - endAngle))%(_2pi))/40, ea = Math.round(endAngle*100); i >= startAngle || Math.round(i*100) <= ea ; i = roundRad(i +adj) ) {
                var dltlg = ltlg.destPointRad( i, radius );
                points.push( [ dltlg.dlong(), dltlg.dlat() ] );
            }
        }
    }
    else if( startAngle < endAngle ) {
        for( var i = startAngle, adj = (endAngle-startAngle)/40, ea = Math.round(endAngle*100); Math.round(i*100) <= ea; i += adj ) {
            var dltlg = ltlg.destPointRad( i, radius );
            points.push( [ dltlg.dlong(), dltlg.dlat() ] );
        }

    }
    else {
        for( var i = startAngle, adj = ((_2pi+(startAngle - endAngle))%(_2pi))/40, ea = Math.round(endAngle*100); i >= startAngle || Math.round(i*100) <= ea ; i = roundRad(i +adj) ) {
            var dltlg = ltlg.destPointRad( i, radius );
            points.push( [ dltlg.dlong(), dltlg.dlat() ] );
        }
    }

    return points;
}

function pointAtRadius( ltlg, radians, radius ) {
    var dltlg = radius ? ltlg.destPointRad( radians, radius ) : ltlg;
    return [ dltlg.dlong(), dltlg.dlat() ];
}

// Make sure we have a round number
function roundRad( i ) {
    return (_2pi+i)%_2pi;
}
