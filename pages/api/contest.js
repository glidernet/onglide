const db = require('../../lib/db')
const escape = require('sql-template-strings')
//import { useRouter } from 'next/router'

export default async function competitionHandler( req, res) {

    const competition = await db.query(escape`
         SELECT name, 
                DATE_FORMAT( start, "%M %D" ) start, DATE_FORMAT( end, "%M %D" ) end, 
                club,
                tzoffset,
                mainwebsite,
                lt, lg
           FROM competition`);

    const classes = await db.query(escape`
         SELECT class, classname, description 
           FROM classes`);

    // How long should it be cached - 60 seconds is goo
    res.setHeader('Cache-Control','max-age=6000');

    // And we succeeded - here is the json
    res.status(200)
	.json({competition: competition[0], classes: classes});
}
