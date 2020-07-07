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

    // this is the pilot results
    const pilots = await db.query(escape`
	select pilots.class, pilots.compno, 
		       pr.status dbstatus, datafromscoring,scoredstatus,
		       UNIX_TIMESTAMP(CONCAT(fdcode(cs.datecode),' ',start))-(SELECT tzoffset FROM competition) utcstart, start, finish,
		       lolat,lolong,pilots.class,
	               concat(firstname,' ',lastname) name, glidertype, handicap, image, daypoints, dayrank, country,

          CASE
			WHEN participating = 'N' THEN "H/C"
                        WHEN dayrank = 0 THEN ''
	    		WHEN dayrank%100 BETWEEN 11 AND 13 THEN concat(dayrank, "th place" )
	    		WHEN dayrank%10 = 1 THEN concat(dayrank,"st place")
	    		WHEN dayrank%10 = 2 THEN concat(dayrank,"nd place")
	    WHEN dayrank%10 = 3 THEN concat(dayrank,"rd place")
	    ELSE concat(dayrank,"th place")
          END dayrankordinal,

	  CASE
	    WHEN turnpoints = -1 THEN "Before Start, 0 tps"
	    WHEN turnpoints = 0 THEN "After Start, 0 tps"
	    ELSE concat('After ',(select name from global.turnpoints, taskleg, tasks
	                                      WHERE trigraph = ntrigraph and
	                                        tasks.flown = 'Y' and tasks.taskid = taskleg.taskid and
	                                        legno = turnpoints and tasks.datecode=pr.datecode and
	                                        taskleg.class=pr.class),
	                ', ', turnpoints, ' tps' )
          END lasttp,
	  prevtotalrank, totalrank,
	  ROUND(hdistance,1) hdistance
		
			FROM pilots, pilotresult pr, compstatus cs
			WHERE pilots.compno = pr.compno
                          and cs.datecode = pr.datecode
                          and cs.class = pilots.class
			  and pilots.class = ${className}
     `);



    // How long should it be cached - 60 seconds is goo
    res.setHeader('Cache-Control','max-age=60');

    // And we succeeded - here is the json
    res.status(200)
	.json({pilots: pilots});
}
