
//
// This is responsible for creating and displaying the task map on the screen
//
// It loads GeoJSON from the next.js server API and renders it on the screen
//
// It will also expose the helper functions required to update the screen
//

import { useState, useRef } from 'react';
import { useRouter } from 'next/router';

import { useTaskGeoJSON, usePilotsGeoJSON, usePilotFullGeoJSON, Spinner, Error } from '../lib/loaders.js';

import MapGL, { Source, Layer } from 'react-map-gl';

import mapboxtoken from '../lib/mapbox-token';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import _find  from 'lodash/find'

function proposedUrl(vc,datecode,router) {
    console.log(datecode)
    return 'wss://'+process.env.NEXT_PUBLIC_WEBSOCKET_HOST+'/'+vc.toUpperCase()+datecode.toUpperCase();
}

export function TaskMap( {vc,datecode,selectedPilot} ) {
    const [viewport, setViewport] = useState({
        latitude: 49.724,
        longitude: 14.3,
        zoom: 8,
        bearing: 0,
        pitch: 0
    });

  //  console.log('vc:'+vc );

    const { taskGeoJSON, isTLoading, Terror } = useTaskGeoJSON(vc);
    const { pilotsGeoJSON, isPLoading, Perror, pilotsGeoJSONmutate } = usePilotsGeoJSON(vc);
    const { pilotFullGeoJSON, isSPLoading, SPerror } = usePilotFullGeoJSON(vc,selectedPilot?selectedPilot.compno:null);
    const router = useRouter();
    const [ socketUrl, setSocketUrl ] = useState(proposedUrl(vc,datecode,router)); //url for the socket
    // We are using a webSocket to update our data here
    const { getWebSocket, lastMessage, readyState } = useWebSocket(socketUrl);
    const mapRef = useRef(null);

    // Do we have a loaded set of details?
    const valid = !( isPLoading || Perror || isTLoading || Terror );

    if( socketUrl != proposedUrl(vc,datecode,router) ) {
	setSocketUrl(proposedUrl(vc,datecode,router));
    }
    
    const updateMessage = lastMessage && lastMessage.data ? JSON.parse(lastMessage.data) : null;

    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Connected',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Closed',
        [ReadyState.UNINSTANTIATED]: 'Preparing',
    }[readyState];

    // Merge it into the displayed information
    if( valid && updateMessage && ! updateMessage.keepalive ) {
	mergePointToPilots( updateMessage, pilotsGeoJSON, pilotsGeoJSONmutate, mapRef, selectedPilot );
    }
    
    // Render the map component
    return (
        <div style={{height: '90vh', position: 'relative', minHeight: '400px'}}>
            <MapGL
                {...viewport}
                width="100%"
                height="100%"
		ref={mapRef}
                mapStyle="mapbox://styles/mapbox/light-v9"
                onViewportChange={nextViewport => setViewport(nextViewport)}
                mapboxApiAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
            >
                {valid?<>
                           <Source type="geojson" data={taskGeoJSON.tp}>
                               <Layer {...turnpointStyle}/>
                           </Source>
                           <Source type="geojson" data={taskGeoJSON.track}>
                               <Layer {...trackLineStyle}/>
                           </Source>
                           <Source type="geojson" data={pilotsGeoJSON.tracks}>
                               <Layer {...pilotsLineStyle}/>
                           </Source>
                           <Source type="geojson" data={pilotsGeoJSON.locations}>
                               <Layer {...markerStyle}/>
                           </Source>
                           {selectedPilot?
                            <Source type="geojson" data={selectedPilot.scoredGeoJSON}>
                                <Layer {...scoredLineStyle}/>
                            </Source>:null}
                           {pilotFullGeoJSON?
                            <Source type="geojson" data={pilotFullGeoJSON.track}>
                                <Layer {...pilotsFullLineStyle}/>
                            </Source>:null}

                       </>:null}
            </MapGL>
            <span>{connectionStatus} {updateMessage ? updateMessage.t : null}</span>
        </div>
    );
}

function mergePointToPilots( point, pilotsGeoJSON, pilotsGeoJSONmutate, mapRef, selectedPilot ) {


    // First update the point
    let pLocation = _find( pilotsGeoJSON.locations.features, (f) => { return (f.properties.c == point.g); } );

    if( ! pLocation ) {
	console.log( "unknown pilot "+point.g );
	return;
    }

    const map = mapRef.current.getMap();
    const wasGrey = pLocation.properties.v == 'grey';

    // Update the location of the point
    pLocation.properties.t = point.at;
    pLocation.properties.x = "*"+point.alt + "m ("+point.agl+"m agl)";
    pLocation.properties.v = 'green';
    pLocation.geometry.coordinates = [ point.lng, point.lat ];

    // Update the marker location (layer id comes from the style)
    map.getSource( map.getLayer('markers').source ).setData(pilotsGeoJSON.locations);

    // Now we need to add a point to the track and remove an old one
    let pTrack = _find( pilotsGeoJSON.tracks.features, (f) => { return (f.geometry.properties.c == point.g) } );

    if( ! pTrack ) {
	console.log( "unknown track for pilot "+point.g );
	return;
    }

    // If it had been out of coverage we will drop the points, need one to shift second onto
    // so we are actually a line
    if( wasGrey ) {
	pTrack.geometry.coordinates = [[point.lng,point.lat]];
    }
    
    pTrack.geometry.coordinates.unshift( [point.lng,point.lat] );
//    pTrack.geometry.coordinates.pop(); // this is wrong as the points are not equally spaced in time...

    // Update the track line (layer id comes from the style)
    map.getSource( map.getLayer('flight').source ).setData(pilotsGeoJSON.tracks);

    // And if it's the select pilot then recenter on it
    if( selectedPilot && selectedPilot.compno == point.g ) {
	map.panTo(pTrack.geometry.coordinates[0]);
    }
}


//
// Styling information for the map
//
const pilotsLineStyle = {
    id: 'flight',
    type: 'line',
    paint: {
        'line-color': 'grey',
        'line-width': 1,
        'line-opacity': 0.6,
    }
};

const pilotsFullLineStyle = {
    id: 'fullflight',
    type: 'line',
    paint: {
        'line-color': 'black',
        'line-width': 2,
        'line-opacity': 0.6,
    }
};

const scoredLineStyle = {
    id: 'scored',
    type: 'line',
    paint: {
        'line-color': 'green',
        'line-width': 5,
        'line-opacity': 0.8,
    }
};

const trackLineStyle = {
    id: 'track',
    type: 'line',
    paint: {
        'line-color': 'black',
        'line-width': 3,
        'line-opacity': 0.8,
    }
};

const turnpointStyle = {
    id: 'tp',
    type: 'fill',
    line: {
        'line-color': 'grey',
        'line-width': 1,
    },
    paint: {
        'fill-color': 'white',
        'fill-opacity': 0.6,
    },
}

    const markerStyle =  {
    'id': 'markers',
    'type': 'symbol',
    'source': 'points',
    'layout': {
        // get the icon name from the source's "icon" property
        // concatenate the name to get an icon from the style's sprite sheet
        'icon-image': ['concat', ['get', 'i'], '-11'],
        // get the title name from the source's "title" property
        'text-field': [
            'format',
            ['get', 'c'],
            {},
            '\n',
            {},
            ['get', 'x'],
            {'font-scale': 0.6}
        ],
        'text-offset': [0, 0.3],
        'text-anchor': 'top',
        'icon-allow-overlap': true,
        'text-ignore-placement': true,
        'text-allow-overlap': true,
    },
    paint: {
        'text-color': ['get', 'v'],
        'icon-color': ['get', 'v']
    },
}

