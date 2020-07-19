## Installing

It isn't difficult to deploy and run this on your own server. However if you would prefer a hosted version please email
your soaring spot keys to melissa-ogn@onglide.com and I can set it up for you.

#### Requirements

- Mysql server with a database
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

