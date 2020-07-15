## Installing

THIS IS THE WRONG BRANCH! 

It was used for the early commits and is now retired...

#### Requirements

- Mysql server with a database
- Perl 5.24+ with modules for Storable, List::Util, Ham::APRS::IS, Ham::APRS::FAP, DBI, Data::Dumper, Math::Trig, Time::HiRes, Time::Piece, URI, LWP::UserAgent, Net::WebSocket::Server, PDL;
- Node and Yarn
- Apache with caching modules (you can deploy the front end somewhere like vercel as well)

#### Steps

- create a database and a user with the following rights
> grant insert,update,delete,execute,select on dsample19.* to reactuser@'xx.xx.xx.xx' identified by 'some-good-password';

- load the database sql & stored procedures
> source conf/sql/onglide_schema.sql;
> source conf/sql/sp_nextjs.sql

- run the installation script, this will require a mapbox API key, and the database to be loaded
> yarn setup

- If you want HGL to work download the DEM files you need from https://dds.cr.usgs.gov/srtm/version2_1/SRTM3/ extract them to the bin/dem directory

- configure your webserver (there is a sample file but you'll want certificates etc)

- build the application using yarn
> yarn next build

## Running

- start the OGN processor (bin/onglide_ogn.pl) this will fetch data into the database and send on websocket
> yarn ogn

- start the soaringspot processor
> yarn soaringspot

- start the application
> yarn next start

- start webserver

