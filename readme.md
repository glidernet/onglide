## Installing

#### Requirements

- Mysql server with a database
- Perl 5.24+ with modules for Storable, List::Util, Ham::APRS::IS, Ham::APRS::FAP, DBI, Data::Dumper, Math::Trig, Time::HiRes, Time::Piece, URI, LWP::UserAgent, Net::WebSocket::Server, PDL;
- Yarn and Node
- Apache/Nginx with caching modules (you can deploy the front end somewhere like vercel as well)

#### Steps

- create a database and a user with the following rights
> grant insert,update,delete,execute,select on dsample19.* to reactuser@'xx.xx.xx.xx' identified by 'some-good-password';

- load the database sql
- load the stored procedures
- configure your soaring spot keys in the table soaringspotkey

- If you want HGL to work download the DEM files you need from https://dds.cr.usgs.gov/srtm/version2_1/SRTM3/ extract them to the bin/dem directory

- configure your webserver (there is a sample file but you'll want certificates etc)

- get a mapbox key (https://account.mapbox.com/auth/signup/) 50k requests is quite a few as the page is only reloaded when the user explicitly tells it to

- copy .env.local.sample to .env.local and configure the database settings and mapbox key
- build the application using yarn (yarn next build)

## Running

- start database
- start the OGN processor (bin/onglide_ogn.pl) this will fetch data into the database and send on websocket
- start the application (yarn next start)
- start webserver

