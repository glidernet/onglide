import startCompetitionDatabaseUpdateProcess from '../../lib/competition/soaringspot';

export default async function ss( req, res) {

    startCompetitionDatabaseUpdateProcess();

    // And we succeeded - here is the json
    res.status(200)
	.json({ok:'ok'});
}
