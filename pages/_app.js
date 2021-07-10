import 'bootstrap/dist/css/bootstrap.min.css';
import '../public/bootstrap/css/font-awesome.min.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../style.css';

import { useState } from 'react';

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }) {
    const [ options, setOptions ] = useState( { rainRadar: 1, rainRadarAdvance: 0, units: 0 } );
    return <Component {...pageProps} options={options} setOptions={setOptions} />
}
