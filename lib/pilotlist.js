import next from 'next'

import { useRouter } from 'next/router'

// What do we need to render the bootstrap part of the page
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'
import NavDropdown from 'react-bootstrap/NavDropdown'


import { useState } from 'react';

// Helpers for loading contest information etc
import { useContest, usePilots, useTask, Spinner, Error } from '../lib/loaders.js';
import { Nbsp, Icon } from '../lib/htmlhelper.js';

import _find from 'lodash/find';
import _sortby from 'lodash.sortby';
import _clone from 'lodash/clone';

// Helpers for sorting pilot list
import { updateSortKeys, nextSortOrder, getSortDescription } from '../lib/pilot-sorting.js';

// Figure out what image to display for the pilot. If they have an image then display the thumbnail for it,
// if they have a country then overlay that on the corner.
function PilotImage(props) {
    if( props.image && props.image !== '' ) {
        return <div className="ih" style={{backgroundImage: `url(/uploaded/_${props.image}.jpg)`}}>
                   {props.country !== ''&& <div className="icountry" style={{backgroundImage: `url(/flags/${props.country}.png)`}}/>}
               </div>

    }
    if( props.country !== '' ) {
        return <div className="ih" style={{backgroundImage: `url(/flags/${props.country}.png)`}}/>
    }

    return <div className="ih" style={{backgroundImage: `url(/flags/outline.png)`}}/>
}

function RoundNumber(v) {
    if( typeof v === 'number' ) {
        v = Math.round(v*10)/10;
        if( isNaN(v) ) {
            v = undefined;
        }
    }

    if( v != '' && v != 0.0 && v != undefined && v != '00:00:00' ) {
        return v;
    }
    else {
        return null;
    }
}

function Optional(props) {
    const v = RoundNumber(props.v);
    if( v ) {
        return (<span style={props.style}>{props.b} {v} {props.e}</span>);
    }
    return null;
}
function OptionalDiv(props) {
    const v = RoundNumber(props.v);
    if( v ) {
        return (<div style={props.style}>{props.b} {v} {props.e}</div>);
    }
    return null;
}

function Details({units,pilot}) {

    if( ! pilot ) {
        return null;
    }

    // If it is a landout then we need to update the static map and the landout details
    // this is a special case
    /*
      if( tracker.lolat ) {
      this.details.find('.lomap img').src=
      "//maps.googleapis.com/maps/api/staticmap?markers=color:black%7C"+
      tracker.lolat + "," +
      tracker.lolong + "&amp;size=200x200&amp;scale=2&amp;zoom=13&amp;api&amp;sensor=false";
      }
    */
    // Simplify displaying units
    const aglunit = units?'ft':'m';
    const climbunit = units?'knots':'m/s';

    const altitude =  pilot.altitude ? (<span>
                                            Altitude {pilot.altitude} {aglunit}  (AGL {pilot.agl} {aglunit})
                                        </span>) : null;

    const climb = (pilot.gainXsecond > 0 || pilot.lossXsecond > 0 ) ? (<><span>
                                                                             <br/>
                                                                             {pilot.Xperiod}s average
                                                                             <Nbsp/><Icon type="upload"/> {pilot.gainXsecond} {aglunit}
                                                                             <Nbsp/><Icon type="download"/> {pilot.lossXsecond} {aglunit}
                                                                             <Nbsp/><Icon type="circle-blank"/> {pilot.averager} {climbunit}
                                                                         </span><br/></>) : null;

    const speed = (<>
                       <Optional b="Task Speed" v={pilot.hspeed} e="kph,"/>
                       <Optional b="Actual Speed" v={pilot.speed} e="kph"/>
                   </>);

    const distance = (<>
                          <Optional b="Task Completed" v={pilot.distancedone} e=" km actual, "/>
                          <Optional b="Task Completed" v={pilot.distance} e=" km actual, "/>
                          <Optional b="(" v={pilot.hdistance} e=" km handicapped )"/>
                          <Optional b="Remaining" v={pilot.remaining} e="km actual"/>
                      </>);


    // Figure out what to show based on the db status
    let flightDetails = null;

    switch(pilot.dbstatus) {
    case '-':
    case 'G':
        flightDetails = (<div>
                             No start reported yet<br/>
                             {altitude}{climb}
                         </div>);
        break;

    case 'S':
        flightDetails = (<div>
                             {altitude}{climb}
                             <br/>
                             <Optional b="Started at" v={pilot.start} e=","/>
                             <Optional b="Duration" v={pilot.duration} e={<br/>}/>

                             <br/>
                             {speed}
                             <br/>
                             <OptionalDiv b={<><b>Leg Speeds:</b><br/></>} v={pilot.legspeeds} e={<br/>} style={{marginLeft:'50px'}}/>
                             {distance}

                             <br/>
                             <Optional v={pilot.status}/>

                             <Optional b="Glide Ratio to Finish" v={pilot.grremaining} e=":1"/>
                             <Optional b=", HCap Ratio" v={pilot.hgrremaining} e=":1"/>
                         </div>);
        break;
    case 'F':
        flightDetails = (<div>
                             Finished<br/>
                             <Optional b="Started at" v={pilot.start}/>
                             <Optional b=", Finished at" v={pilot.finish}/>
                             <Optional b=", Duration" v={pilot.duration}/><br/>

                             {speed}
                             <br/>
                             <OptionalDiv b={<><b>Leg Speeds:</b><br/></>} v={pilot.legspeeds} e={<br/>} style={{marginLeft:'50px'}}/>
                             {distance}
                         </div>);
        break;
    case 'H':
        flightDetails = (<div>Home<br/>
                             <Optional b="Started at" v={pilot.start}/>
                             <Optional b=", Finished at" v={pilot.finish}/>
                             <Optional b=", Duration" v={pilot.duration}/><br/>
                             {distance}
                         </div>);
        break;

    case '/':
    case 'D':
        flightDetails = (<div>Did not fly</div>);
        break;

    default:
        flightDetails = (<div>Possible Landout<br/>
                             {altitude}
                             {distance}

                             <Optional b="Landed Near:" v={pilot.lonear}/>
                             <Optional v={pilot.status}/><br/>
                         </div>);
        break;
    }

    // Check at render if we are up to date or not
    const delay = (new Date().getTime()/1000) - (pilot.lastUpdated||0);
    const uptodate = ( delay < 45 );
	pilot.delay = delay;

    // Are we in coverage or not, keyed off uptodate
    const ognCoverage = uptodate ?
          (<span><Nbsp/><a href="#" style={{color:'white'}} title="In OGN Flarm coverage"><Icon type="check"/> {Math.round(delay)}s delay</a></span>) :
          (<span><Nbsp/><a href="#" style={{color:'white'}} title="No recent points, waiting for glider to return to coverage">
                            {delay < 3600 ?
                             <><Icon type="spinner" spin={true}/>Last point {delayToText(delay)} ago</> :
                             <><Icon type="exclamation"/>{pilot.max > 0?<>Last point more than two hours ago</>:<>No tracking yet</>}</>}
                        </a></span>);

    const flag = ( pilot.country !== '' ) ? <div className="details-flag" style={{backgroundImage: `url(/flags/${pilot.country}.png)`}}/> : null;

    return (
        <div className="details" style={{paddingTop:'5px'}}>
            {flag}<h6>{pilot.compno}:<b>{pilot.name}</b> {pilot.country}, {pilot.glidertype}, handicap {pilot.handicap}<br/>
                      <span style={{fontSize:'80%'}}>{ognCoverage}</span>
                  </h6>
            <hr style={{borderColor:'white', height:'1px', margin:'0'}}/>
            {flightDetails}
        </div>
    );
}


function Sorting(props) {
    return (
        <>
            <h5>Results
                <span className="pull-right">
                    <a title="Sort Automatically" href="#" onClick={()=>props.setSort('auto')}><Icon type="star"/></a>
                    <a title="Show Speed" href="#" onClick={()=>props.setSort('speed')}><Icon type="trophy"/></a>
                    <a title="Show Height" href="#" onClick={()=>props.setSort('height')}><Icon type="cloud-upload "/>&nbsp;</a>
                    {//<a title="Show Current Climb Average" href="#" onClick={()=>props.setSort('climb')}><Icon type="upload "/>&nbsp;</a>
                    }
                <a title="Show L/D Remaining" href="#" onClick={()=>props.setSort('ld')}><Icon type="fast-forward "/>&nbsp;</a>
                <a title="Show Handicapped Distance Done" href="#" onClick={()=>props.setSort('distance')}><Icon type="signout "/>&nbsp;</a>
                <a title="Show Handicapped Distance Remaining" href="#" onClick={()=>props.setSort('remaining')}><Icon type="signin "/>&nbsp;</a>
                <a title="Cycle through times" href="#" onClick={()=>props.setSort('times')}><Icon type="time "/>&nbsp;</a>
                <Nbsp/>

                <a href="#" onClick={() => props.toggleVisible()}
                   title={props.visible?"Hide Results":"Show Results"}
                   aria-controls="task-collapse"
                   aria-expanded={props.visible}>
                <Icon type="tasks"/><Icon type="caret-down"/></a>
            </span>
        </h5>
        <div id="sortdescription">{props.sortDescription}</div>
        </>
    );
}


// Display the current height of the pilot as a percentage bar, note this is done altitude not AGL
// which is probably wrong
function PilotHeightBar({pilot}) {
    let bcolour = 'grey';
    const thirds = (pilot.max - pilot.min)/3;
    // Adjust the bar on the pilot marker regardless of status
    let top = Math.min(Math.round(30/(pilot.max - pilot.min) * (pilot.altitude - pilot.min)),30);

	// No altitude, or top to bottom difference is small
    if( !pilot.altitude || thirds < 75 ) {
        top = 0;
    }
    else if( pilot.altitude > thirds * 2 + pilot.min) {
        bcolour = 'green';
    }
    else if ( pilot.altitude > thirds + pilot.min) {
        bcolour = 'orange';
    }
    else {
        bcolour = 'red';
    }

	pilot.heightColour = bcolour;

    return (
        <div className="height" style={{marginTop: `${30-top}px`, height: `${top}px`, borderColor: `${bcolour}`}}/>
    )
}

//
// Figure out what status the pilot is in and choose the correct icon
function PilotStatusIcon(props) {
    let icon = 'question';

    switch(props.pilot.dbstatus) {
    case '-':
    case 'G':
        if( ! props.pilot.altitude ) {
            icon = 'exclamation';
        }
        else {
            icon='cloud-upload';
        }
        break;

    case 'S':
        if( ! props.pilot.altitude ) {
            icon = 'question';
        }
        else
        {
            if( props.pilot.averager > 1 ) {
                icon = 'upload';
            }
            else {
                icon='plane';
            }
            if( props.pilot.heightColour ) {
                icon = icon + ` h${props.pilot.heightColour}`;
            }
        }
        break;
    case 'F':  icon='trophy'; break;

    case 'H':  icon='home'; break;
    case '/':  icon='trash'; break;
    case 'D':  icon='ban-circle'; break;
    case 'R':  icon='question'; break;

    default:   icon='road'; break;
    }

    if( !("min" in props.pilot) ) {
        return (
            <span className="pilotstatus">
                <Icon type="spinner" spin={true}/>
            </span>
        );
    }

    // If it is a finish and it is scored
    if( props.pilot.datafromscoring == 'Y' && props.pilot.dbstatus != 'S' ) {
        icon = 'check';
    }

    return (
        <span className="pilotstatus">
            <Icon type={icon} spin={false}/>
        </span>
    );
}


//
// Render the pilot
function Pilot(props) {

    const className = (props.selected)?"small-pic pilot pilothovercapture selected":"small-pic pilot pilothovercapture";

    // Render the normal pilot icon
    return (
        <li className={className} >
            <a href="#" title={props.pilot.compno + ': ' + props.pilot.name } onClick={()=>{props.select()}}>
                <PilotImage image={props.pilot.image} country={props.pilot.country}/>
                <div>
                    <PilotHeightBar pilot={props.pilot} />

                    <div className='caption'>
                        {props.pilot.compno}
                        <PilotStatusIcon pilot={props.pilot}/>
                    </div>
                    <div>
                        <div className="data">
                            {props.pilot.displayAs}
                        </div>
                        <div className="units">
                            {props.pilot.units}
                        </div>
                    </div>
                </div>
            </a>
        </li>
    );

}

//
// Render the list of pilots
export function PilotList({vc,pilots,selectedPilot,setSelectedCompno}) {
export function PilotList({vc,pilots,selectedPilot,setSelectedCompno,options}) {

    // These are the rendering options
    const [ order, setOrder ] = useState( 'auto' );
    const [ visible, setVisible ] = useState( true );

    // ensure they sort keys are correct for each pilot, we don't actually
    // want to change the loaded pilots file, just the order they are presented
    // this can be done with a clone and reoder
    let mutatedPilotList = _clone(pilots);
    updateSortKeys( mutatedPilotList, order );

    // Generate the pilot list, sorted by the correct key
    const pilotList = _sortby(mutatedPilotList,['sortKey']).reverse()
          .map( (pilot) =>
              <Pilot key={pilot.compno} pilot={pilot} selected={selectedPilot?selectedPilot.compno===pilot.compno:null}
                     select={()=>{(selectedPilot&&selectedPilot.compno==pilot.compno)?setSelectedCompno(null):setSelectedCompno(pilot.compno);}}/>
          );

    // Output the whole of the pilots list component
    return (
        <>
            <Sorting setSort={(o)=>{setOrder(nextSortOrder(o,order))}} sortDescription={getSortDescription(order)}
                     visible={visible} toggleVisible={()=>{setVisible(!visible)}}/>

            <Collapse in={visible}>
                <ul className="pilots">
                    {pilotList}
                </ul>
            </Collapse>

            <Details pilot={selectedPilot}/>
        </>
    );
}

function delayToText( t ) {
    if( ! t || t > 7200 ) return '';
    let secs = Math.floor(t)%60;
    let mins = Math.floor(t/60);
    let hours = Math.floor(t/3600);

    if( secs ) {
        secs = `${(secs < 10 && (mins>0||hours>0))?'0':''}${secs}s`;
    } else {
        secs = undefined;
    }
    if( mins ) {
        mins = `${(mins < 10 && hours > 0)?'0':''}${mins}m`;
        if( mins > 30 ) {
            secs = undefined;
        }
    } else {
        mins = undefined;
    }
    if( hours ) {
        hours = `${hours}h`;
        secs = undefined;
    } else {
        hours = undefined;
    }
    return [hours,mins,secs].join(' ');
}
