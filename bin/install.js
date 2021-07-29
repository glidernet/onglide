#!/usr/bin/env node

//
// This function sets up the database etc correctly for you
//
// It will read the existing .env.local file if it exists
//

const prompts = require('prompts');
const escape = require('sql-template-strings')
const mysql = require('serverless-mysql')();


// Load the current file
const result = require('dotenv').config({ path: '.env.local' })

// Defaults incase we can't read the dotenv file
let nE = { 'MYSQL_HOST': 'localhost', 'MYSQL_DATABASE': 'onglide', 'MYSQL_USER': 'onglide' };

if (result.error) {
    console.log( "New install: no configuration found, or script not being run in the root directory" );
}
else {
    nE = result.parsed;
}

const questions = [
    {
        // Database configuration
        type: 'text',
        name: 'dbhost',
        message: 'IP address',
        initial: nE.MYSQL_HOST
    },
    {
        type: 'text',
        name: 'database',
        message: 'Database name',
        initial: nE.MYSQL_DATABASE
    },
    {
        type: 'text',
        name: 'dbuser',
        message: 'Username',
        required: true,
        initial: nE.MYSQL_USER
    },
    {
        type: 'text',
        name: 'dbpw',
        message: 'Password',
        required: true,
        hidden: true,
        initial: nE.MYSQL_PASSWORD,
        validate: (v) => { return (!v || v.length < 8) ? `please use a decent password` : true }
    },
];

function onCancel() {
    console.log( "*** cancelled" );
    process.exit();
}

async function main() {

    //
    // First make sure we can do database stuff
    console.log( "\nDatabase Configuration:" );
    const response = await prompts(questions, {onCancel});

    // Make sure we can connect
    mysql.config({
        host: response.dbhost,
        database: response.database,
        user: response.dbuser,
        password: response.dbpw
    });

    mysql.connect();
    let tables = undefined;
    try {
        tables = await mysql.query( 'show tables' );
    } catch (error) {
        console.log( error );
        return { error }
    }

    console.log( "\n* Connected to database\n" );

    // We need to load the schema
    if( ! tables || tables.length < 5 ) {
        console.log( "Database connection is good, you now need to load the schema and stored procedures" );
        console.log( "these are in the conf/sql directory" );
        process.exit();
    }

    if( !(await mysql.query( 'select fdcode("07C")' ))[0] ) {
        console.log( "Database connection is good, you now need to load the stored procedures" );
        console.log( "these are in the file conf/sql directory (on database... source sp_next.sql)" );
        process.exit();
    }


    // Get the soaring spot keys, we need this to prompt for the keys
    let sskeyresult = (await mysql.query( 'select * from scoringsource' ));
    let sskey = sskeyresult[0];
    if( sskey === undefined ) {
		sskey = { type:'soaringspotkey', url:"", client_id: "", secret: "", actuals: 1 };
    }

	const sstypemap = { 'soaringspotkey': 0, 'soaringspotscrape': 1, 'rst': 2 };

	const stquestions = [
        {
            type: 'select',
            name: 'type',
            message: 'Scoring Backend',
            choices: [
                { title: 'SoaringSpot API', value: sstypemap['soaringspotkey'] },
                { title: 'SoaringSpot Scraping', value: sstypemap['soaringspotscrape'] },
                { title: 'RST Online (Sweden)', value: sstypemap['rst'] },
            ],
            initial: (sstypemap[sskey.type]),
        }
    ];

    console.log( "Scoring config:" );
    const stresponse = await prompts(stquestions, {onCancel});

	let ssquestions;
	if( stresponse.type == sstypemap['soaringspotkey'] ) {
		// SoaringSpot is client & key
		ssquestions = [
			{
				// Database configuration
				type: 'text',
				name: 'ssclient',
				message: 'API Client Key',
				initial: sskey.client_id,
			},
			{
				type: 'text',
				name: 'sssecret',
				message: 'API Secret',
				initial: sskey.secret
			},
			{
				type: 'select',
				name: 'actuals',
				message: 'Speed output in Scoring Script',
				choices: [
					{ title: 'UK Special', value: '-1' },
					{ title: 'Handicapped', value: '0' },
					{ title: 'Actuals', value: '1' },
				],
				initial: (sskey.actuals+1),
			}
		];
	}
	else if( stresponse.type == sstypemap['soaringspotscrape'] ) {

		// SoaringSpot is client & key
		ssquestions = [
			{
				type: 'text',
				name: 'ssurl',
				message: '(UK English URL)',
				initial: sskey.url,
				validate: (v) => { return (!v || !v.match(/en_gb/) || v.match(/\/$/) ) ? `please enter URL and make sure it is the UK english version of it, with no trailing /` : true },
			}
				
		];
	}
	else {
		if( !(sskey.url?.length > 0) ) {
			sskey.url = 'http://www.rst-online.se/RSTmain.php?main=excup&cmd=list&excup=list&sub=EX';
		}

		// RST only requires the URL
		ssquestions = [
			{
				type: 'text',
				name: 'ssurl',
				message: 'RST URL',
				initial: sskey.url
			},
			{
				type: 'text',
				name: 'sscontest_name',
				message: 'Contest Name',
				initial: sskey.contest_name
			}
		];
	}
		
    const ssresponse = await prompts(ssquestions, {onCancel});

    console.log( "\nWebsite config:" );
    const wsquestions = [
        {
            type: 'text',
            name: 'url',
            message: 'Website URL',
            initial: nE.NEXT_PUBLIC_SITEURL
        },
        {
            type: 'text',
            name: 'apihost',
            message: 'API Host',
            initial: (undefined,v) => nE.API_HOSTNAME ? nE.API_HOSTNAME : v.url,
        },
		{
			type: 'number',
			name: 'portoffset',
			message: 'Port offset (multiple instances on a machine)',
			initial: sskey.portoffset||0
		},
        {
            type: 'text',
            name: 'wshost',
            message: 'Websocket Host',
            initial: (undefined,v) => nE.NEXT_PUBLIC_WEBSOCKET_HOST ? nE.NEXT_PUBLIC_WEBSOCKET_HOST : v.url,
        },
    ];

    const wsresponse = await prompts(wsquestions, {onCancel});

    console.log( "\nMapbox API key (www.mapbox.com):" );
    const mquestions = [
        {
            type: 'text',
            name: 'key',
            message: 'Mapbox API key',
            initial: nE.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
        },
    ];

    const mresponse = await prompts(mquestions, {onCancel});

    console.log( "\nUpdating .env.local" );

    const fs = require('fs');
    const envFile =
          `MYSQL_HOST=${response.dbhost}
MYSQL_DATABASE=${response.database}
MYSQL_USER=${response.dbuser}
MYSQL_PASSWORD=${response.dbpw}
API_HOSTNAME=${wsresponse.apihost}
NEXT_PUBLIC_WEBSOCKET_HOST=${wsresponse.wshost}
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=${mresponse.key}
NEXT_PUBLIC_SITEURL=${wsresponse.url}
NEXT_SCORE_REFRESH_INTERVAL=60000
`;

	if( wsresponse.portoffset != 0 ) {
		envFile += `WEBSOCKET_PORT=${8000+wsresponse.portoffset}
STATUS_SERVER_PORT=${8100+wsresponse.portoffset}
`;
	}

    console.log( envFile );

    fs.renameSync( '.env.local', '.env.backup' );
    fs.writeFileSync( '.env.local', envFile, (err) => {
        console.log( "Unable to write file (.env.local)" );
        console.log( err );
        process.exit();
    } );

    console.log( "Updating Soaring Spot Keys" );
    // Update the database with the soaring spot key
    await mysql.transaction()
        .query( 'DELETE FROM scoringsource' )
        .query( escape`INSERT INTO scoringsource VALUES ( ${Object.keys(sstypemap)[stresponse.type]}, ${ssresponse.ssurl||''},
                                   ${ssresponse.ssclient||''}, ${ssresponse.sssecret||''}, ${ssresponse.sscontest_name||''}, 1, ${ssresponse.actuals}, ${wsresponse.portoffset}, ${wsresponse.url} )`)
        .commit();

    console.log( "done" );
    process.exit();
}

main()
    .then("done");


function loadSchema(mysql) {
    console.log( "... loading schema" );
}
