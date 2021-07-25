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

- install yarn packages
> yarn install

- install pm2
> yarn global add pm2

- run the installation script, this will require a mapbox API key, and the database to be loaded
> yarn setup

- configure your webserver (there is a sample file but you'll want certificates etc)

- build the application using yarn
> yarn next build

## Running (pm2)

The easiest way is to use pm2
> pm2 start ecosystem.config.js
> pm2 start all
- start webserver

You can use this to see logs
> pm2 log
> pm2 log ogn

See status
> pm2 status

Or to monitor processes 
> pm2 monit

pm2 will automatically restart the processes if they fail

## Running (yarn)

- start the OGN processor (bin/onglide_ogn.pl) this will fetch data into the database and send on websocket
> yarn ogn

- start the soaringspot processor
> yarn soaringspot

- start the application
> yarn next start

- start webserver

## RST tracking

Instead of using SoaringSpot as the backend it's possible to use RST Online as well. 

- run the normal installation program
- select RST for scoring system (see steps above) and then ensure the URL provided takes you to the page on RST that lists the competition. Default is "Övriga tävlingar" but it should also work with the HDI Safe Skies pages as well by changing the URL
- ensure that the contest name matches the prefix of the name, text after the name is assumed to be the contest class

eg: "DM Herrljunga 2021 18-Meter" select "DM Herrljunga 2021" as the contest name, 18-Meter will become the contest class

- run


## Troubleshooting

Default configuration configures url /wsstatus that allows you to see what is happening with the OGN feed on the server end
PM2 also exposes some of these values and you can easily watch them using pm2 monit
