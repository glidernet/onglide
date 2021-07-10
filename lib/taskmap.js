
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
import { Nbsp, Icon } from '../lib/htmlhelper.js';

import MapGL, { Source, Layer } from 'react-map-gl';
import { RadarOverlay } from '../lib/rainradar';

import mapboxtoken from '../lib/mapbox-token';

export default function TaskMap( {vc,datecode,selectedPilot,mapRef,lat,lng,options,setOptions,tz} ) {
    const [viewport, setViewport] = useState({
        latitude: lat,
        longitude: lng,
        zoom: 8,
        bearing: 0,
        pitch: 0
    });

    const { taskGeoJSON, isTLoading, Terror } = useTaskGeoJSON(vc);
    const { pilotsGeoJSON, isPLoading, Perror, pilotsGeoJSONmutate } = usePilotsGeoJSON(vc);
    const { pilotFullGeoJSON, isSPLoading, SPerror } = usePilotFullGeoJSON(vc,selectedPilot?selectedPilot.compno:null);

    // Do we have a loaded set of details?
    const valid = !( isPLoading || Perror || isTLoading || Terror ) && (taskGeoJSON.tp && taskGeoJSON.track);

    // Render the map component
    return (<>
                <div style={{height: '90vh', position: 'relative', minHeight: '400px'}}>
                    <MapGL
                        {...viewport}
                        width="100%"
                        height="100%"
                        ref={mapRef}
                        mapStyle="mapbox://styles/ifly7charlie/ckck9441m0fg21jp3ti62umjk"
                        onViewportChange={nextViewport => setViewport(nextViewport)}
                        mapboxApiAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
						attributionControl={false}
					>
						<RadarOverlay options={options} setOptions={setOptions} tz={tz}/>
								   
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
                                   {selectedPilot&&selectedPilot.scoredGeoJSON?
                                    <Source type="geojson" data={selectedPilot.scoredGeoJSON} key={selectedPilot.compno}>
                                        <Layer {...scoredLineStyle}/>
                                    </Source>:null}
                                   {pilotFullGeoJSON?
                                    <Source type="geojson" data={pilotFullGeoJSON.track}>
                                        <Layer {...pilotsFullLineStyle}/>
                                    </Source>:null}

                               </>:null}
                    </MapGL>
                </div>
            </>
           );
}


//
// Styling information for the map
//

// Pilots (recent track)
const pilotsLineStyle = {
    id: 'flights',
    type: 'line',
    paint: {
        'line-color': 'grey',
        'line-width': 1,
        'line-opacity': 0.6,
    }
};

// full track for selected pilot
const pilotsFullLineStyle = {
    id: 'fullflight',
    type: 'line',
    paint: {
        'line-color': 'black',
        'line-width': 2,
        'line-opacity': 0.6,
    }
};

// scored track for selected pilot
const scoredLineStyle = {
    id: 'scored',
    type: 'line',
    paint: {
        'line-color': 'green',
        'line-width': 5,
        'line-opacity': 0.8,
    }
};

// Current position of each pilot
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

//
// Tasks - trackline
const trackLineStyle = {
    id: 'track',
    type: 'line',
    paint: {
        'line-color': 'black',
        'line-width': 3,
        'line-opacity': 0.8,
    }
};

// turnpoint
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
