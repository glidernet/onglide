const db = require('../../../lib/db')
const escape = require('sql-template-strings')
import { useRouter } from 'next/router'

import { calculateTaskLength } from '../../../lib/taskhelper.js';

export default async function taskHandler( req, res) {
    const {
	query: { className },
    } = req;

    if( !className ) {
	console.log( "no class" );
	res.status(404).json({error: "missing parameter(s)"});
	return;
    }

     const contestday = await db.query(escape`
         SELECT contestday.*, DATE_FORMAT( contestday.calendardate, "%a %D %M" ) displaydate
          FROM contestday, compstatus cs
          WHERE cs.datecode = contestday.datecode and cs.class = contestday.class and contestday.class= ${className}
          LIMIT 1
    `);

    if( ! contestday || ! contestday.length ) {
	console.log( "invalid class" );
	res.status(404).json({error: "invalid class"});
	return;
    }

    const datecode = contestday[0].datecode;

    const taskdetails = await db.query(escape`
         SELECT *, time_to_sec(tasks.duration) durationsecs
          FROM tasks
          WHERE tasks.datecode= ${datecode} and tasks.class= ${className} and tasks.flown='Y'
    `);

    if( ! taskdetails || ! taskdetails.length ) {
	console.log( "/api/task.js: no active task" );
	res.status(404).json({error: "no active task"});
	return;
    }
    
    const taskid = taskdetails[0].taskid;
    console.log(taskid);

    const tasklegs = await db.query(escape`
      SELECT taskleg.*, nname name
      FROM taskleg
      WHERE taskleg.taskid = ${taskid}
      ORDER BY legno
    `);

    // We correct task leg length as our calculations are more accurate
    taskdetails[0].distance = calculateTaskLength(tasklegs);
    delete taskdetails[0].hdistance;

    const classes = await db.query(escape`
     SELECT *
          FROM classes
          WHERE classes.class= ${className}
    `);

    // How long should it be cached - 60 seconds is good
    res.setHeader('Cache-Control','max-age=60');

    // And we succeeded - here is the json
    res.status(200)
	.json({legs: tasklegs, task: taskdetails[0], classes: classes[0], rules: '', contestday: contestday[0] })
}
