const db = require('../../../lib/db')
const escape = require('sql-template-strings')
import { useRouter } from 'next/router'

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

    const datecode = contestday[0].datecode;

    const taskdetails = await db.query(escape`
         SELECT *, time_to_sec(tasks.duration) durationsecs
          FROM tasks
          WHERE tasks.datecode= ${datecode} and tasks.class= ${className} and tasks.flown='Y'
    `);

    const taskid = taskdetails[0].taskid;
    console.log(taskid);

    const tasklegs = await db.query(escape`
      SELECT taskleg.*, nname name
      FROM taskleg
      WHERE taskleg.taskid = ${taskid}
      ORDER BY legno
    `);

    const comprules = await db.query(escape`
     SELECT cr.*
          FROM global.comprules cr, classes
          WHERE cr.name = classes.type
            AND classes.class= ${className}
            AND cr.country = (select countrycode from competition) or cr.country = '*' 
         limit 1
    `);

    // How long should it be cached - 60 seconds is goo
    res.setHeader('Cache-Control','max-age=60');

    // And we succeeded - here is the json
    res.status(200)
	.json({legs: tasklegs, task: taskdetails[0], rules: comprules[0], contestday: contestday[0] })
}
