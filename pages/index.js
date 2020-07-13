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
import { TaskMap } from '../lib/taskmap.js';
import { TaskDetails } from '../lib/taskdetails.js';
import { Nbsp, Icon } from '../lib/htmlhelper.js';
import { PilotList } from '../lib/pilotlist.js';

import Router from 'next/router'

const pilotsorting = require('../lib/pilot-sorting.js');

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
			<img width="15px"/>
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
	className = props.defaultClass;
    }

    // Next up load the contest and the pilots, we can use defaults for pilots
    // if the className matches
    const { comp, isLoading, error } = useContest(props.contest);
    const { pilots, isLoading: isPLoading, error: isPerror, mutate } =
	  usePilots(className, _find(props.contest.classes,{'class': className}).pilots );

    // And keep track of who is selected
    const [ selectedCompno, setSelectedCompno ] = useState();

    // And display in progress until they are loaded
    if (isLoading) return <Spinner />;
    if (error) return <Error />;

    // Make sure we have the class object
    const selectedClass = _find( comp.classes,{'class': className} );


    // And the pilot object
    const selectedPilot = pilots ? pilots[selectedCompno] : undefined;

    return (
	<>
            <IncludeJavascript/>
            <Menu comp={comp} vc={className} setSelectedPilot={setSelectedCompno}/>
            <Container fluid>
                <Row>
                    <Col sm={7}>
			<TaskMap vc={className} selectedPilot={selectedPilot} datecode={selectedClass?selectedClass.datecode:'07C'} mutatePilots={mutate} pilots={pilots}/>
		    </Col>
                    <Col>
                        <TaskDetails vc={className}/>
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

    // We will preload these values on the server, this saves us from waiting
    // form them to calculate and load at the client end and presents the first
    // page quicker. Note, we may not need the pilots data if the URL has 
    let contest = (await fetch('http://'+process.env.API_HOSTNAME+'/api/contest').then(res => res.json()));

    // Umm map+async = head hurts whereas this works and took me 1 minute to write
    for( let i = 0; i < contest.classes.length; i++ ) {
	let c = contest.classes[i];
	c.pilots = await ((await fetch('http://'+process.env.API_HOSTNAME+'/api/'+c.class+'/pilots')).json());
    }
    
    return {
	props: { defaultClass: contest.classes[0].class, contest: contest  }, // will be passed to the page component as props
    }
}

export default CombinePage;
