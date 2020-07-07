
//
// This is responsible for creating and displaying the task map on the screen
//
// It loads GeoJSON from the next.js server API and renders it on the screen
//
// It will also expose the helper functions required to update the screen
//

import { useState } from 'react';
import { useTaskGeoJSON, usePilotsGeoJSON, Spinner, Error } from '../lib/loaders.js';

import MapGL, { Source, Layer } from 'react-map-gl';

import mapboxtoken from '../lib/mapbox-token';

export function TaskMap( {vc} ) {
    const [viewport, setViewport] = useState({
	latitude: 49.724,
	longitude: 14.3,
	zoom: 8,
	bearing: 0,
	pitch: 0
    });

    const { taskGeoJSON, isTLoading, Terror } = useTaskGeoJSON(vc);
    const { pilotsGeoJSON, isPLoading, Perror} = usePilotsGeoJSON(vc);

    // Do we have a loaded set of details?
    const valid = !( isPLoading || Perror || isTLoading || Terror );

    const pilotsLineStyle = {
	id: 'flight',
	type: 'line',
	paint: {
	    'line-color': 'grey',
	    'line-width': 1,
	    'line-opacity': 0.6,
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
	'icon-allow-overlap': true,
	'layout': {
	    // get the icon name from the source's "icon" property
	    // concatenate the name to get an icon from the style's sprite sheet
	    'icon-image': ['concat', ['get', 'i'], '-11'],
	    // get the title name from the source's "title" property
	    'text-field': ['get', 'c'],
//	    'text-font': ['Open Sans Bold', 'Arial Unicode MS'],
	    'text-offset': [0, 0.3],
	    'text-anchor': 'top',
	    'icon-allow-overlap': true
	}
    }

//		mapStyle="mapbox://styles/ifly7charlie/ckca72piu4vn91iozg78mnsjf"

    return (
	<div style={{height: '100%', position: 'relative', minHeight: '400px'}}>
            <MapGL
		{...viewport}
		width="100%"
		height="100%"
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
		       </>:null}
            </MapGL>
	</div>
    );
}
