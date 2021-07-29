
//
// This is responsible for creating and displaying rain radar on screen
//

import { useEffect, useState } from 'react';
import {AttributionControl} from 'react-map-gl';
//import Source from '../lib/source';
import { Source, Layer } from 'react-map-gl';
import { useRouter } from 'next/router'

import _maxby  from 'lodash.maxby'

export function RadarOverlay( {options, tz, setOptions} ) {

	const [ radarTileURL, setURL ] = useState();
	const [ radarTime, setTime ] = useState();
	const router = useRouter();

	useEffect( () => {
		let timer = undefined;
		
		function loadRadar() {
			clearTimeout(timer);
			if( options.rainRadar ) {
				setURL(undefined); setTime(undefined);
				fetch("https://api.rainviewer.com/public/weather-maps.json", {
					credentials: "omit",
					})
					.then(res => res.json())
					.then(apiData => {
						var imageMeta;
						if( options.rainRadarAdvance ) {
							imageMeta = apiData.radar.nowcast[options.rainRadarAdvance-1];
						}
						else {
							imageMeta = _maxby( apiData.radar.past, 'time' );
						}
						setURL( apiData.host + imageMeta.path + '/256/{z}/{x}/{y}/2/1_1.png' );

						// Figure out what the local language is for international date strings
						const lang = (navigator.languages != undefined) ? navigator.languages[0] :  navigator.language;

						// And then produce a string to display it locally
						const dt = new Date(imageMeta.time*1000);
						setTime( `✈️ ${dt.toLocaleTimeString( lang, {timeZone: tz, hour: "2-digit", minute: "2-digit"})}` );

						// Figure out when to run next, API updates in 10 minutes
						const interval = (parseInt(apiData?.generated) + 600) - (Date.now()/1000);
//						console.log( "next radar check in ", interval, "seconds", Date.now()/1000 );
						timer = setTimeout( () => { loadRadar(); }, Math.max(interval||0,60)*1000 );
					})
					.catch((e) => {
						console.log( new Date(), 'unable to fetch radar data, will try again in two minutes', e );
						timer = setTimeout( () => { loadRadar(); }, 2*1000*60 );
					})
			}

		}
		loadRadar();
		return () => clearTimeout(timer);
	}, [options.rainRadarAdvance] );

	// If it's to be displayed then make sure it is
	// note this is also used for refreshing the display - we will briefly set URL and Time to undefined
	// and update rainRadarAdvance. By setting to undefined first the components will be removed from
	// the built tree and a new one can be rebuilt. This gets around an issue in mapbox-gl2 where
	// the raster source layer is unable to update tiles, and the fact that react-mapbox-gl doesn't
	// know anything about rasters so doesn't deal with it either
	if( options.rainRadar && radarTileURL && radarTime ) {
//		console.log( new Date(), 'new radar tile', radarTileURL, radarTime );
		if( window ) {
			const nextRadar = (options.rainRadarAdvance + 1)%4;
			window.advanceRadar = () => { setOptions( { ...options, rainRadarAdvance: nextRadar } ); setURL(undefined); setTime(undefined) }
		}
		const attribution =  `<a href="https://www.rainviewer.com/">Rain Viewer</a> @ <a href='#'  onclick="advanceRadar()">${radarTime}</a>`;
		return (
			[
				<AttributionControl customAttribution={attribution} style={attributionStyle} key="attribution"/>,
				<Source type="raster" tiles={[radarTileURL]} key="rainmap">
					<Layer {...rainviewerLayer} />
				</Source>
			]
		);
	}
	else {
		return <>
				   <AttributionControl compact={false} customAttribution='' style={attributionStyle}/>
			   </>;
	}
}

const attributionStyle= {
	right: 0,
	bottom: 0,
	fontSize: '13px'
};

let rainviewerLayer = {
	id: 'rainRadar',
	type: "raster",
	paint: {
		"raster-opacity": 0.6,
	},
	source: 'raster',
    minzoom: 0,
    maxzoom: 12
};
