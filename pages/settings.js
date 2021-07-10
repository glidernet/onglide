import next from 'next'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import Router from 'next/router'

// What do we need to render the bootstrap part of the page
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'
import NavDropdown from 'react-bootstrap/NavDropdown'
import ButtonGroup from 'react-bootstrap/ButtonGroup'
import ToggleButton from 'react-bootstrap/ToggleButton'

import { Nbsp, Icon } from '../lib/htmlhelper.js';

const db = require('../lib/db')
import { useContest, Spinner } from '../lib/loaders.js';

import _find from 'lodash.find';

function IncludeJavascript() {
    return (
        <>
            <link rel="stylesheet" href="/bootstrap/css/font-awesome.min.css"/>
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
                                                           onClick={() => { Router.push('/?className='+c.class, undefined, {shallow:true});}}>
                                                     {c.classname}{c.status == 'L'?<><Nbsp/><Icon type="plane"/></>:null}
                                                 </Nav.Link>
                                             </Nav.Item>);

	// Try and extract a short form of the name, only letters and spaces stop at first number
	const shortName = comp.competition.name.match( new RegExp(/^([\p{L}\s]*)/,'u'))?.[1]?.trim() || comp.competition.name;
    return (
        <>
            <Navbar bg="light" fixed="top">
                <Nav fill variant="tabs" defaultActiveKey='settings' style={{width:'100%'}}>
                    {classes}
					<Nav.Item key="sspot" style={{paddingTop:0,paddingBottom:0}}>
						<Nav.Link href={comp.competition.mainwebsite}  className="d-md-none">
							{shortName}<Nbsp/><Icon type='external-link'/>
						</Nav.Link>
						<Nav.Link href={comp.competition.mainwebsite}  className="d-none d-md-block"  style={{paddingTop:0,paddingBottom:0}}>
							{comp.competition.name}<div style={{fontSize: '70%'}}>{comp.competition.start} to {comp.competition.end}<Icon type='external-link'/> </div>
						</Nav.Link>
					</Nav.Item>
					<Nav.Item key="settings">
						<Nav.Link href='#' key='navlinksettings' eventKey='settings'
								  onClick={() => { Router.push('/settings', undefined, {shallow:true});}}>
							<Icon type='cog'/>
						</Nav.Link>
					</Nav.Item>
				</Nav>
            </Navbar>
            <br style={{clear:'both'}}/>
        </>
    );
}

//
// Main page rendering :)
function SettingsPage( { options, setOptions, tz } ) {

    // Next up load the contest and the pilots, we can use defaults for pilots
    // if the className matches
    const { comp, isLoading, error } = useContest();

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

    return (
        <>
            <Head>
                <title>{comp.competition.name} - Settings</title>
                <IncludeJavascript/>
            </Head>
            <Menu comp={comp}/>
            <Container fluid>
                <Row>
					<Col sm={7}>
                        <h1>
                            Welcome to Onglide
                        </h1>

						<Row>
							<Col>
								These settings are just for this session!
							</Col>
						</Row>
						<hr/>

						<Row>
							<Col sm={3}>
								Display Units
							</Col>
							<Col>
								<ButtonGroup toggle type="radio" name="units">
									{['metric','imperial'].map((radio, idx) => (
										<ToggleButton
											key={idx}
											variant="secondary"
											type="radio"
											value={idx}
											checked={(idx === options.units)}
											onChange={(e) => setOptions( {...options, units: idx })}
										>
											{radio}
										</ToggleButton>
									))}
								</ButtonGroup>
							</Col>
						</Row>
						<br/>
						<Row>
							<Col sm={3}>
								Rain Radar
							</Col>
							<Col>
								<ButtonGroup toggle type="radio" name='rain'>
									{ ['off','actual','forecast +10m','forecast +20m'].map((radio, idx) => (
										<ToggleButton
											key={idx}
											variant="secondary"
											type="radio"
											value={radio}
											checked={(idx === (options.rainRadarAdvance+1))}
											onChange={(e) => setOptions( {...options, rainRadarAdvance: idx-1, rainRadar: idx > 0 })}
										>
											{radio}
										</ToggleButton>
									))}
								</ButtonGroup>
							</Col>
						</Row>

					</Col>
                </Row>
            </Container>
        </>
    );
}

//
// Determine the default class
export async function getStaticProps(context) {

	const location = (await db.query( 'SELECT lt, lg, tzoffset, tz FROM competition LIMIT 1' ))?.[0];
    return {
        props: { lat: location?.lt, lng: location?.lg, tzoffset: location?.tzoffset, tz: location?.tz }, // will be passed to the page component as props
    }
}

export default SettingsPage;
