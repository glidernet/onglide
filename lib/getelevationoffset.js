
//
// Taken from:
//   https://github.com/scijs/get-pixels/blob/master/node-pixels.js
//   https://github.com/mcwhittemore/mapbox-elevation/blob/master/index.js
//
// Modules not used because they include a LOAD of things we don't need, some of which
// sound more like a rootkit than something useful.
//

let tilebelt      = require('@mapbox/tilebelt');
let ndarray       = require('ndarray')
let PNG           = require('pngjs').PNG
const fetch       = require('node-fetch');


// Track duplicate requests for the same time and service them together from one response
let pending = [];
let referrer = undefined;

let LRU = require("lru-cache")
, options = { max: 3600,
              length: function (n, key) { return 1 },
              dispose: function (key, n) { console.log( "flushed "+key+" from cache" ); },
              updateAgeOnGet: true,
              maxAge: 72 * 3600 * 1000 }
, cache = new LRU(options)

//    module.exports = function(tk) {
//      return function(p, cb) {


function getCacheSize() {
    return cache.length;
}

//
// For a given lat, lng lookup the elevation
// NOTE: there is a race condition here - as we are async we could have two requests for the same
//       point at the same time and do more work.  It won't cause it to fail it just wastes CPU and
//       memory as we keep fetching the same item
//
async function getElevationOffset( config, lat, lng, cb ) {

    // Figure out what tile it is (obvs same order as geojson)
    // see https://docs.mapbox.com/help/glossary/zoom-level/,
    // zoom 15 gives 1.8m per pixel at 40 degrees which should be fine
    let tf = tilebelt.pointToTileFraction( lng, lat, 15);
    let tile = tf.map(Math.floor);
    let domain = 'https://api.mapbox.com/v4/';
    let source = `mapbox.terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}.pngraw`;
    let url = `${domain}${source}?access_token=${config.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;

    // Have we cached it
    let pixels = cache.get( url );

    // Convert to elevation
    function pixelsToElevation(npixels) {
        let xp = tf[0] - tile[0];
        let yp = tf[1] - tile[1];
        let x = Math.floor(xp*npixels.shape[0]);
        let y = Math.floor(yp*npixels.shape[1]);

        let R = npixels.get(x, y, 0);
        let G = npixels.get(x, y, 1);
        let B = npixels.get(x, y, 2);

        let height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1);
        return Math.floor(height);
    }


    // If it isn't in the cache then we need to fetch it, cache it
    // and do the CB with the elevation
    if( ! pixels ) {

        // Make sure we don't fetch same thing twice at the same time
        if( url in pending ) {
            console.log( 'queued request' );
            pending[url].push(cb);
            return;
        }
        else {
            pending[url] = [cb];
        }

        // With a PNG from fetch we can create the NDArray we need
        // to calculate the elevation
        function parsePNG(err,img_data) {
            if( err ) {
                throw(err);
            }
            // Save it away
            const npixels = ndarray(new Uint8Array(img_data.data),
                                    [img_data.width|0, img_data.height|0, 4],
                                    [4, 4*img_data.width|0, 1],
                                    0)

            cache.set( url, npixels );
            pending[url].forEach( (cbp) => cbp( pixelsToElevation(npixels) ));
            delete pending[url];
        };
		
        // Checking process.env is expensive so cache this
        if( ! referrer ) {
            referrer = "https://"+(process.env.NEXT_PUBLIC_SITEURL||config.NEXT_PUBLIC_SITEURL)+"/";
        }

        // Go and get the URL
        fetch( url, { "headers": { "Referer":referrer }} )
            .then( (res) => {
				if( res.status != 200 ) {
					throw `MapBox API returns ${res.status}: ${res.statusText}, ensure "https://${config.NEXT_PUBLIC_SITEURL}/" is in the allowed ACL`;
				}
				else {
					return res.arrayBuffer()
			}})
            .then( data => {
                (new PNG()).parse( data, parsePNG );
            })
            .catch(err => {
                // We still call the callback on an error as we don't want to drop the packet
                console.error("unable to read elevation: "+err);
                pending[url].forEach( (cbp) => cbp( 0 ) );
                delete pending[url];
            });
    }
    else {
        cb( pixelsToElevation(pixels) );
    }

};


module.exports = { getCacheSize, getElevationOffset };
