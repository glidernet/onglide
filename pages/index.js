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


const baseUrl = 'https://sample.onglide.com';



function IncludeJavascript() {
    return (
        <>
            <link rel="stylesheet" href="/bootstrap/css/font-awesome.min.css"/>
	    <link href='//api.mapbox.com/mapbox-gl-js/v1.11.0/mapbox-gl.css' rel='stylesheet' />
        </>
    );
}


// Requires: classes, link, contestname, contestdates

function Menu(props) {

    const comp = props.comp;

    const classes = comp.classes.map( (c) => <Nav.Item key={'navitem'+c.class}>
						 <Nav.Link href='#'
							   key={'navlink'+c.class}
							   eventKey={c.class}
							   onClick={() => { Router.push('/?className='+c.class, undefined, {shallow:true});
									    props.setSelectedPilot(null);}}>
						     {c.classname}
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

function CombinePage() {

    const router = useRouter()
    console.log( router.query );
    let { className } = router.query;
    const { comp, isLoading, error } = useContest();
    const [ selectedPilot, setSelectedPilot ] = useState();
    if (isLoading) return <Spinner />;
    if (error) return <Error />;

    if( ! className ) {
	className = comp.classes[0].class;
    }

    return (
	<>
            <IncludeJavascript/>
            <Menu comp={comp} vc={className} setSelectedPilot={setSelectedPilot}/>
            <Container fluid>
                <Row>
                    <Col sm={7}>
			<TaskMap vc={className} selectedPilot={selectedPilot} datecode={'07C'}/>
		    </Col>
                    <Col>
                        <TaskDetails vc={className}/>
                        <PilotList vc={className} selectedPilot={selectedPilot} setSelectedPilot={(x)=>setSelectedPilot(x)}/>
                    </Col>
                </Row>
            </Container>
	</>
    );
}

export default CombinePage;
