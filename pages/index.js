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
            <script src="https://sample.onglide.com/globalfile/dijkstras.js"/>
            <script src="https://sample.onglide.com/globalfile/main-task-scores.js"/>
            <script src="https://sample.onglide.com/globalfile/LatLong.js"/>
            <script src="https://sample.onglide.com/globalfile/local-storage.js"/>
            <script src="https://sample.onglide.com/globalfile/mgrs.min.js"/>
            <script src="https://flarmrange.onglide.com/files/tinycolor.js"/>
            <script src="https://sample.onglide.com/globalfile/maptiles2.js"/>
            <script src="https://sample.onglide.com/globalfile/blog.js"/>
            <link rel="stylesheet" href="http://sample.onglide.com/globalfile/bootstrap/css/font-awesome.min.css"/>
	    <link href='https://api.mapbox.com/mapbox-gl-js/v1.11.0/mapbox-gl.css' rel='stylesheet' />
        </>
    );
}


// Requires: classes, link, contestname, contestdates

function Menu(props) {

    const comp = props.comp;

    const classes = comp.classes.map( (c) => <Nav.Item key={'navitem'+c.class}>
						 <Nav.Link href='#' key={'navlink'+c.class} onClick={() => Router.push('/?className='+c.class, undefined, {shallow:true})}>
						     {c.classname}
						 </Nav.Link>
					     </Nav.Item>);

    console.log('----');
    console.log(classes);
    
    return (
	<>
	<Navbar bg="light" fixed="top">
	    <Navbar.Toggle aria-controls="responsive-navbar-nav" />
	    <Navbar.Collapse id="responsive-navbar-nav">
                <Navbar.Brand href={comp.competition.mainsite}>
		    {comp.competition.name}<span style={{fontSize: '70%'}}>{comp.competition.start} to {comp.competition.end}</span>
		</Navbar.Brand>
		<NavDropdown.Divider />
		<Nav fill variant="tabs" defaultActiveKey={props.current}>
		    {classes}
		</Nav>
		<NavDropdown.Divider />
	    </Navbar.Collapse>
	</Navbar>
	    <br style={{clear:'both'}}/>
	   </> 
    );
}



function CombinePage() {

    const router = useRouter()
    console.log( router.query );
    const { className } = router.query;
    const { comp, isLoading, error } = useContest();
    console.log("x0x0x0x0x");
    
    if (isLoading) return <Spinner />
    if (error) return <Error />

    return (
	<>
            <IncludeJavascript/>
            <Menu comp={comp} vc={className}/>
            <Container fluid>
                <Row>
                    <Col sm={7}>
			<TaskMap vc={className}/>
		    </Col>
                    <Col>
                        <TaskDetails vc={className}/>
                        <PilotList vc={className}/>
                    </Col>
                </Row>
            </Container>
	</>
    );
}

export default CombinePage;
