import next from 'next'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import Head from 'next/head'

// What do we need to render the bootstrap part of the page
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'
import NavDropdown from 'react-bootstrap/NavDropdown'

import { useState, useRef } from 'react';

// Helpers for loading contest information etc
import { useContest, usePilots, useTask, Spinner, Error } from '../lib/loaders.js';
import { TaskDetails } from '../lib/taskdetails.js';
import { Nbsp, Icon } from '../lib/htmlhelper.js';
import { PilotList } from '../lib/pilotlist.js';

// Dynamically load the map as it's big and slow
const TaskMap  = dynamic(() => import( '../lib/taskmap.js' ),
                         { loading: () => <Spinner/>});

// And connect to websockets...
import { OgnFeed } from '../lib/ognfeed.js';

import Router from 'next/router'

const pilotsorting = require('../lib/pilot-sorting.js');
const db = require('../lib/db')

import _find from 'lodash.find';

function IncludeJavascript() {
    return (
        <>
            <link rel="stylesheet" href="/bootstrap/css/font-awesome.min.css"/>
            <link href='//api.mapbox.com/mapbox-gl-js/v1.11.0/mapbox-gl.css' rel='stylesheet' />
        </>
    );
}


// Requires: classes, link, contestname, contestdates

function Menu( props ) {

    const comp = props.comp;
    const classes = comp.classes.map( (c) => <Nav.Item key={'navitem'+c.class}>
                                                 <Nav.Link href='#'
                                                           key={'navlink'+c.class}
                                                           eventKey={c.class}
                                                           onClick={() => { Router.push('/?className='+c.class, undefined, {shallow:true});
                                                                            props.setSelectedPilot(null);}}>
                                                     {c.classname}{c.status == 'L'?<><Nbsp/><Icon type="plane"/></>:null}
                                                 </Nav.Link>
                                             </Nav.Item>);

    return (
        <>
            <Navbar bg="light" fixed="top">
                <Nav fill variant="tabs" defaultActiveKey={props.vc} style={{width:'100%'}}>
                    {classes}
                </Nav>
                <Navbar.Collapse id="responsive-navbar-nav">
                    <Navbar.Brand href={comp.competition.mainwebsite}>
                        <img width="15px" alt="-"/>
                        {comp.competition.name}<span style={{fontSize: '70%'}}>{comp.competition.start} to {comp.competition.end}</span>
                    </Navbar.Brand>
                </Navbar.Collapse>
            </Navbar>
            <br style={{clear:'both'}}/>
        </>
    );
}

//
// Main page rendering :)
function CombinePage( props ) {

    // First step is to extract the class from the query, we use
    // query because that stops page reload when switching between the
    // classes. If no class is set then assume the first one
    const router = useRouter()
    let { className } = router.query;
    if (!className) {
        console.log( "no class!" );
        console.log(router.query);
        className = props.defaultClass;
    }

    // For remote updating of the map
    const mapRef = useRef(null);

    // Next up load the contest and the pilots, we can use defaults for pilots
    // if the className matches
    const { comp, isLoading, error } = useContest();
    const { pilots, isLoading: isPLoading, error: isPerror, mutate } =
          usePilots(className);

    // And keep track of who is selected
    const [ selectedCompno, setSelectedCompno ] = useState();

    // And display in progress until they are loaded
    if (isLoading)
        return (<div className="loading">
                    <div className="loadinginner"/>
                </div>) ;

    if (error||!comp.competition)
        return (<div>
                    <div style={{position:'fixed', zIndex:'10', marginLeft:'10px' }}>
                        <h1>
                            Welcome to Onglide
                        </h1>
                        <p>
                            Please see <a href="https://github.com/glidernet/onglide/blob/main/readme.md">readme.md</a> for setup instructions.
                        </p>
                        <p>
                            If you have configured the competition and the soaring spot load has completed but you are still seeing this screen then it may be your browser
                            cache. <a href="https://kb.iu.edu/d/ahic">Indiana U</a> has instructions if you are unsure how to do this.
                        </p>
                    </div>
                    <div className="loading">
                        <div className="loadinginner"/>
                    </div>
                </div>) ;


    // Make sure we have the class object
    const selectedClass = _find( comp.classes,{'class': className} );


    // And the pilot object
    const selectedPilot = pilots ? pilots[selectedCompno] : undefined;

    return (
        <>
            <Head>
                <title>{comp.competition.name} - {className}</title>
                <IncludeJavascript/>
            </Head>
            <Menu comp={comp} vc={className} setSelectedPilot={setSelectedCompno}/>
            <Container fluid>
                <Row>
                    <Col sm={7}>
                        <TaskMap vc={className} datecode={selectedClass?selectedClass.datecode:'07C'} selectedPilot={selectedPilot}
                                 mapRef={mapRef} pilots={pilots}/>
                        <OgnFeed vc={className} datecode={selectedClass?selectedClass.datecode:'07C'} selectedPilot={selectedPilot}
                                 pilots={pilots} mutatePilots={mutate} mapRef={mapRef}/>
                    </Col>
                    <Col>
                        <TaskDetails vc={className}/>
                        {isPLoading &&<><Icon type="plane" spin={true}/> Loading pilots...</>
                        }
                        {pilots &&
                         <PilotList vc={className} pilots={pilots} selectedPilot={selectedPilot} setSelectedCompno={(x)=>setSelectedCompno(x)}/>
                        }
                    </Col>
                </Row>
            </Container>
        </>
    );
}

//
// Determine the default class
export async function getStaticProps(context) {

    const classes = await db.query('SELECT class FROM classes ORDER BY class');

    return {
        props: { defaultClass: classes && classes.length > 0 ? classes[0].class : '' }, // will be passed to the page component as props
    }
}

export default CombinePage;
