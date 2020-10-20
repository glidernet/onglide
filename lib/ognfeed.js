
//
// This is responsible for creating and displaying the task map on the screen
//
// It loads GeoJSON from the next.js server API and renders it on the screen
//
// It will also expose the helper functions required to update the screen
//

import { useState, useRef } from 'react';

import { useTaskGeoJSON, usePilotsGeoJSON, usePilotFullGeoJSON, Spinner, Error } from '../lib/loaders.js';
import { Nbsp, Icon } from '../lib/htmlhelper.js';

import useWebSocket, { ReadyState } from 'react-use-websocket';

import _find  from 'lodash/find'
import _clonedeep from 'lodash.clonedeep';

import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'

function proposedUrl(vc,datecode) {
    const hn = '';//(process.env.NEXT_PUBLIC_SITEURL).split('.')[0].toUpperCase();
    return (/^https/.test(window.location.protocol) ? 'wss://' : 'ws://')+process.env.NEXT_PUBLIC_WEBSOCKET_HOST+'/'+(hn+vc+datecode).toUpperCase();
}

let mutateScoresTimer = 0;
export function OgnFeed( {vc,datecode,mutatePilots,pilots,selectedPilot,mapRef} ) {
    const { pilotsGeoJSON, isPLoading, Perror, pilotsGeoJSONmutate } = usePilotsGeoJSON(vc);
    const { pilotFullGeoJSON, isSPLoading, SPerror } = usePilotFullGeoJSON(vc,selectedPilot?selectedPilot.compno:null);
    const [ socketUrl, setSocketUrl ] = useState(proposedUrl(vc,datecode)); //url for the socket
    const [ wsStatus ] = useState({'c':1,'p':0,'lm':null});
    const [ attempt, setAttempt ] = useState(0);

    // We are using a webSocket to update our data here
    const { getWebSocket, lastMessage, readyState } = useWebSocket(socketUrl, {
        reconnectAttempts: 3,
        reconnectInterval: 30000,
        shouldReconnect: (closeEvent) => {
            console.log(closeEvent);
            return true;
        },
        onOpen: () => { setAttempt( attempt+1 ); }
    } );

    // Do we have a loaded set of details?
    const valid = !( isPLoading || Perror) && mapRef && mapRef.current && mapRef.current.getMap();

    // Have we had a websocket message, if it hasn't changed then ignore it!
    let updateMessage = null;
    if( lastMessage ) {
        if( wsStatus.lm != lastMessage.data ) {
            updateMessage = JSON.parse(lastMessage.data);
            wsStatus.lm = lastMessage.data;
        }
    }

    const connectionStatus = {
        [ReadyState.CONNECTING]:     <span style={{color:'orange'}}>Connecting</span>,
        [ReadyState.OPEN]:           <>Connected <Icon type='time'/>.</>,
        [ReadyState.CLOSING]:        <span style={{color:'red'}}>Closed</span>,
        [ReadyState.CLOSED]:
        <>
            <div style={{position:'absolute',width:'50%',left:'25%',top:'25%',zIndex:10}}>
                <AlertDisconnected mutatePilots={()=>{setSocketUrl('');mutatePilots(pilots,true);}} attempt={attempt}/>
            </div>
            <span style={{color:'red'}}>Closed</span>,
        </>,
        [ReadyState.UNINSTANTIATED]: <span style={{color:'orange'}}>Preparing</span>,
    }[readyState];

    if( socketUrl != proposedUrl(vc,datecode)) {
        setSocketUrl(proposedUrl(vc,datecode));
    }

    // Merge it into the displayed information
    if( valid && updateMessage ) {

        // Keep alive - updates listeners and active planes
        if( 'keepalive' in updateMessage ) {
            wsStatus.c = updateMessage.listeners;
            wsStatus.p = updateMessage.airborne;
        }

        // Scores so we are always displaying the right one
        if( 'pilots' in updateMessage ) {
            requestAnimationFrame( () => {
                console.log( "updating scores from websocket" );
                mutatePilots(updateMessage,false);
            });
        }

        // Track point
        if( 'g' in updateMessage ) {
            requestAnimationFrame( () => {
                mergePointToPilots( updateMessage, mapRef, selectedPilot, pilots, mutatePilots );
            });
        }
    }

    // Render the map component
    return (<>
                <div style={{width: '100%', color:'grey', fontSize: '80%'}}>
                    <span>{connectionStatus} {updateMessage ? updateMessage.t : null}</span>
                    <span style={{float:'right', textAlign:'right', width: '330px'}}>In the last minute there were {wsStatus.c} <Icon type="group"/> and {wsStatus.p} <Icon type="plane"/> tracked</span>
                </div>
            </>
           );
}

let mutateTimer = 0;
function mergePointToPilots( point, mapRef, selectedPilot, pilots, mutatePilots ) {

    if( ! pilots ) {
        return;
    }

    // We need to do a deep clone for the change detection to work
    const compno = point.g;
    const p = _clonedeep(pilots);
    const cp = p[compno];

    // If the pilot isn't here noop
    if( ! cp ) {
        return;
    }

    // If we are getting the same update twice - this happens because
    // of the mutation forcing a rebuild of the map, which results in the whole
    // thing being redrawn.
    if( cp.lastUpdated == point.at ) {
        return;
    }
    cp.lastUpdated = point.at;

    const newPoint = [point.lng,point.lat];
    const map = mapRef.current.getMap();
    const markerSource = map.getLayer('markers')?.source;
    const trackSource = map.getLayer('flights')?.source;
    const fullSource = map.getLayer('fullflight')?.source;

    // Naughtily extract our GeoJSON out of the map so we can update it
    // without touching SWR
    let tracks = trackSource ? (map.getSource( trackSource )?._data) : undefined;
    let markers = markerSource ? (map.getSource( markerSource )?._data) : undefined;
    let fulltrack = fullSource ? (map.getSource( fullSource )?._data) : undefined;
    let wasGrey = false;

    if (map._frame) {
        map._frame.cancel();
        map._frame = null;
        console.log('mf cancel 0');
    }

    // Now we need to add a point to the track and remove an old one
    if( tracks ) {

        let pTrack = _find( tracks.features, (f) => { return (f.geometry.properties.c == point.g) } );
        if( ! pTrack ) {
            console.log( "unknown track for pilot "+point.g );
            return;
        }

        // If it had been out of coverage we will drop the points, need one to shift second onto
        // so we are actually a line
        if( wasGrey ) {
            pTrack.geometry.coordinates = [newPoint];
        }

        pTrack.geometry.coordinates.unshift( newPoint );
        pTrack.geometry.coordinates.pop(); // this is wrong as the points are not equally spaced in time...

        // Update the track line (layer id comes from the style)
        map.getSource( trackSource ).setData(tracks);
        if (map._frame) {
            map._frame.cancel();
            map._frame = null;
            console.log('mf cancel 1');
        }
    }

    // If we are selected update the full track as well
    if( selectedPilot && selectedPilot.compno == point.g ) {

        if( fullSource && fulltrack && fulltrack.features.length > 0 ) {
            fulltrack.features[0].geometry.coordinates.unshift( newPoint );
            map.getSource( fullSource ).setData(fulltrack);

        }
        if (map._frame) {
            map._frame.cancel();
            map._frame = null;
        }
    }

    // First update the point
    if( markers ) {

        let pLocation = _find( markers.features, (f) => { return (f.properties.c == point.g); } );
        if( ! pLocation ) {
            console.log( "unknown pilot "+point.g );
            return;
        }

        wasGrey = (pLocation.properties.v == 'grey');

        // Update the location of the point
        pLocation.properties.t = point.at;
        pLocation.properties.x = "*"+point.alt + "m ("+point.agl+"m agl)";
        pLocation.properties.v = 'black';
        pLocation.geometry.coordinates = newPoint;

        // Update the marker location (layer id comes from the style)
        //    const markers = map.getLayer('markers');
        map.getSource( markerSource ).setData(markers);
    }

    // If we are selected update the full track as well
    if( selectedPilot && selectedPilot.compno == point.g ) {
        // And pan!
        map.panTo( newPoint );
    }

    // Force a re-render
    // cancel the scheduled update & trigger synchronous redraw
    // see https://github.com/mapbox/mapbox-gl-js/issues/7893#issue-408992184
    // NOTE: THIS MIGHT BREAK WHEN UPDATING MAPBOX
    if (map._frame) {
        map._frame.cancel();
        map._frame = null;
    }
    map._render();

    // Update the altitude and height AGL for the pilot
    // Mutate the vario and altitude back into SWR
    cp.altitude = point.alt;
    cp.agl = point.agl;

    [ cp.lossXsecond,
      cp.gainXsecond,
      cp.total,
      cp.average,
      cp.Xperiod,
      cp.min,
      cp.max ] =  point.v.split(',');


    // Update the pilot information, this will cause a redraw but we can't do that inside
    // a redraw as it barfs. So schedule a timeout in 1ms which is basically immediately
    // that tells the screen it needs to be redrawn. false means don't reload data from
    // server
    if( mutateTimer ) {
        clearTimeout(mutateTimer);
    }
    mutateTimer = setTimeout( () => {
        console.log( "updating: " +compno + ", vario: "+point.v );
        mutatePilots({ pilots: p},false);
    }, 50 );

}

export function AlertDisconnected({mutatePilots,attempt}) {
    const [show, setShow] = useState(attempt);
    const [pending, setPending] = useState(attempt);

    if (show == attempt) {
        return (
            <Alert variant="danger" onClose={() => setShow(attempt+1)} dismissible>
                <Alert.Heading>Disconnected</Alert.Heading>
                <p>
                    Your streaming connection has been disconnected, you can reconnect or
                    just look at the results without live tracking
                </p>
                <hr/>
                <Button variant="success" onClick={() => {mutatePilots();setPending(attempt+1);}}>Reconnect{(pending==(attempt+1))?<Spinner/>:null}</Button>
            </Alert>
        );
    }
    return null;
}
