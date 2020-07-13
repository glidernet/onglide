#!/usr/bin/perl -w
# Copyright 2014-2020 (c) Melissa Jenkins, BSD licence
use strict;
use threads;
use threads::shared;
use Thread::Semaphore;
use Storable;

use List::Util;

use Ham::APRS::IS;
use Ham::APRS::FAP qw(parseaprs);
use DBI;
use Data::Dumper;
use Math::Trig qw(:great_circle deg2rad rad2deg);
use Time::HiRes;
use Time::Piece;

use URI;
use LWP::UserAgent;
use Net::WebSocket::Server;

use PDL;
use feature ':5.24';

my $W = 1201; # use 3-minute DEMs, so each DEM is 1201 x 1201
my $dempath = "./dem/";

# 
my $server = 'aprs.glidernet.org:14580';
print "connecting to server $server\n";

#
#############
#
# setup
#
#############
#
# Flush after each write
my $old_handle = select (STDOUT); # "select" STDOUT and save
# previously selected handle
$| = 1; # perform flush after each write to STDOUT
select ($old_handle); # restore previously selected handle


# map of connection id to 
my %listeners;
my @aprsfeeds;
my %channels;

my %competitions; # dbname -> IS

my %last; # keyed on site+flarmid
my %launching; # keyed on class

fetchCompetitions();

my $wsserver = Net::WebSocket::Server->new(
    listen => 8080,

    # every X seconds we will print some status to the websocket as well as send a keep alive
    # on the aprs channel
    # after that we need to update the list of trackers from the database
    on_tick => sub {
	my ($serv) = @_;
	
	# send it to each connected client, make sure we send the right 
	my $now = time();
	my $nowStr = timestr($now);
	foreach my $connection ( $serv->connections ) {
                $connection->send_utf8(sprintf('{"keepalive":1,"t":"%s","at":%d,"listeners":%d}',
					       $nowStr, $now, $listeners{$connection->{channel}} ));
	}

	# check every 10 minutes - on_tick is called every 60 seconds
	if( $now % 600 < 60 ) {
	    fetchCompetitions();
	}

	# send something to APRS server as well
#	foreach my $aprs ( @aprsfeeds ) {
	foreach my $aprs ( values %competitions ) {
	    checkAPRS( $aprs );
	    # and update the list of trackers
	    updateTrackers($aprs);
	}
    },

    # Accept a new websocket connection    
    on_connect => sub {
	my ($serv, $conn) = @_;
	$conn->on(
	    handshake => sub {
		my ($conn, $handshake) = @_;

		# figure out what competition it is for
		my $competition = $handshake->req->{fields}->{'x-forwarded-host'};
		if( $competition =~ /^([A-Z0-9_-]+).onglide.com$/i ) {
		    $competition = $1;
		}
		else {
		    print "unexpected host name: $competition\n";
		    $conn->disconnect();
		    return;
		}

		# and what channel it wants
		my $channel = $handshake->req->{resource_name};
		if( $channel =~ m%^/([A-Z0-9_-]+)([/?]|$)%i ) {
		    $channel = $1;
		}
		else {
		    print "$competition: invalid channel $channel\n";
		    $conn->disconnect();
		    return;
		}
		
		$conn->{channel} = uc $channel;
		$conn->{competition} = lc $competition;

		# make sure the channel exists
		my $c = $channels{ $conn->{channel} };
		if( ! $c ) {
		    print Dumper(%channels);
		    print "$competition: unknown channel $channel (".$handshake->req->{resource_name}.") from ".$handshake->req->{fields}->{'x-forwarded-for'}."\n";
		    $conn->disconnect(404,'unknown competition class');
		    return;
		}

		# use the connection key or generate a random number, and associate this with the correct
		# stream for the channel requested
		$conn->{key} = $handshake->req->{fields}->{'sec-websocket-key'}||rand(3000000);
		$conn->{c} = $c;

		# and we are connected
		print "\rconnection for $competition, $channel from ".$handshake->req->{fields}->{'x-forwarded-for'}."\n";
	    },
	    ready => sub {
		my ($conn) = @_;

		# figure out what channel we are listening to
		my $c = $channels{ $conn->{channel} };
		return if ( ! $c );
		
		# link it into the list we are processing
		$c->{connections}->{ $conn->{key} } = $conn;
		$conn->{is} = $c->{is};
		$listeners{ $conn->{channel} }++;

		# send a keepalive so that it's obvious the stream has started
		my $now = time();
		my $nowStr = timestr($now);
                $conn->send_utf8(sprintf('{"keepalive":1,"t":"%s","at":%d,"listeners":%d}',
						   $nowStr, $now, $listeners{$conn->{channel}} ));

		# and some logging
#		print "connection for $conn->{channel} now ready\n";
	    },

	    disconnect => sub {
		my ($conn,$reason) = @_;

		# if not fully formed then abandon
		return if( ! $conn->{c} );

		# remove us from the list of connections that the #is
		delete $conn->{c}->{connections}->{ $conn->{key} };
		$listeners{ $conn->{channel} }--;

#		print "disconnect from $conn->{channel}\n";
	    },
	    );
    },

    # keep alives and status checks every minute
    tick_period => 30,
    );

# send something to APRS server as well
foreach my $aprs ( values %competitions ) {
    checkAPRS( $aprs );
    # and update the list of trackers
    updateTrackers($aprs);
}

$wsserver->start;
    

sub date {
    my @t = gmtime($_[0]);
    return sprintf( "%04d-%02d-%02d", ($t[5]+1900),($t[4]+1),$t[3]);
}

#
# This checkes to make sure we have a valid connection to the APRS server, and re-establishes if
# we don't

sub checkAPRS {
    my ($is) = @_;
    my $didaconnect = 0;

    my $now = time();
    if( $is->connected() && ($is->{receivedkeepalive} + 60) < $now ) {
	print $is->{site}. " no packets in more than 60 seconds\n";
	$wsserver->unwatch_readable( $is->sock );
	$is->disconnect();
	$is->{receivedkeepalive} = $now;
    }

    # if we are not connected try a single connection attempt
    if( !$is->connected() ) {
	print $is->{site} . " not connected, connecting \n";
        $is->connect() || print $is->{site} . " failed to connect to APRS ".$is->{error}." \n";
	$didaconnect = 1;
    }

    if( $is->connected() ) {
	print "..";
	$is->sendline( sprintf( "# %s.onglide.co.uk 212.13.204.217", $is->{site} ));

	# start watching

	if( $wsserver && $didaconnect ) {
	    print $is->{site}." connected\n";
	    $wsserver->watch_readable( $is->sock => sub { receivePacket( $is ) } );
	}
    }
    else {
	print $is->{site} . " not connected...".$is->{error}."\n";
    }
}
    
#
# Main packet processing procedure
#
sub receivePacket {
    my ($is) = @_;

    my $l = $is->getline(1);
    if (!defined $l) {
	print $is->{site}.": failed getline\n";
	$wsserver->unwatch_readable( $is->sock );
	$is->disconnect();
	checkAPRS($is);
	return;
    }

    # some logging
#    print {$$is->{fh}} $l."\n";


    if( $l =~ /^\s*#/ ) {
	$is->{receivedkeepalive} = time();
	return;
    }
    
    if( $l eq '' ) {
	return;
    }

    my %packetdata ;
    my $retval = parseaprs($l, \%packetdata);

    if ($retval == 1) {

        # if we know where the glider is then we will use that
        if( $packetdata{type} eq 'location' &&
            $packetdata{latitude} && $packetdata{longitude} ) {

            my $callsign = $packetdata{srccallsign};
            my $lt = $packetdata{latitude};
            my $lg = $packetdata{longitude};

            # we need to do the calculation for each station that matches
            foreach my $value (@{$packetdata{digipeaters}}) {
                while (my ($k1,$v1) = each(%{$value})) {

                    next if( $k1 ne 'call' );
                    next if( $v1 eq 'GLIDERN1' || $v1 eq 'GLIDERN2' || $v1 eq 'TCPIP' || $v1 eq 'qAS');

                    if( $v1 ne 'qAC' ) {

                        my $s_id = $v1;

                        # use the real id not the one that has been updated
                        my $flarmid = $callsign;
                        if( ($packetdata{comment}||'') =~ /^id[0-9A-F]{2}([0-9A-F]{6}) /) {
                            $flarmid = $1;
                        }

                        if( ($packetdata{comment}||'') =~ /([0-9.]+)dB ([0-9])e/ )  {
                            my $alt = int($packetdata{altitude});
                            my $direction = 1 << int(($packetdata{course}||0) / 11.25);
                            my $crc = $2+0;
			    my $signal = $1+0;

                            if( $crc >= 5 ) {
                            }
                            else {
                                doGliderStuff( $is, $callsign, uc $flarmid, $packetdata{timestamp}, $s_id, $lt, $lg, $alt, $signal, $l );
                            }

                        }
                    }
                }
            }
        }
        elsif(0) {
            print "\n--- new packet ---\n$l\n";
            while (my ($key, $value) = each(%packetdata)) {
                print "$key: $value\n";
            }
        }
    } else {
        print "\n: --- bad packet --> \"$l\"\n";
        warn "Parsing failed: $packetdata{resultmsg} ($packetdata{resultcode})\n";
    }
}
    

##
## collect points, emit to competition db every 30 seconds
sub doGliderStuff {
    my ( $is, $callsign, $flarmid, $time, $sid, $lt, $lg, $alt, $signal, $raw ) = @_;
    print $raw if( $sid eq 'UKDUN2' );

    my $islate = 0;

    # make sure our time order is basically right, done outside of filter so it applies
    # to launches as well
    if( ($time - ($last{$is->{site}.$flarmid}||0)) > 0 ) {
        $last{$is->{site}.$flarmid} = $time;
    }
    else {
	$islate=1;
    }

    # time delay for logging
    my $td = Time::HiRes::time() - $time;
    my $agl = 0;

    # determine how far they are away
    my $printedalready = 0;
    my $distance = haversine( $lt, $lg, $is->{home_lt}, $is->{home_lg} );

    my $compno = '';
    if( exists($is->{trackers}->{$flarmid}) && $is->{trackers}->{$flarmid}->{confirmed} ) {	
        my $tracker = $is->{trackers}->{$flarmid};
	
	if( ! $tracker->{compno} ) {
	    print Dumper( $tracker );
	}

        $compno = uc $tracker->{compno};
        my $timedifference = $time - ($tracker->{lasttime}||$time);

	$agl = List::Util::max($alt-elevation( $lt, $lg ),0);
        printf( "\r%s (%3d): %8s: %.3f,%.3f (%4dm/%4dm) %11s %4.1f db: %10s", timestr($time), $td, $compno,$lt, $lg, $alt, $agl, $sid, $signal, $is->{site} );
	$printedalready = 1;
	
        # if we have a glider over 100m QFE
        my $class = $tracker->{class};
        if( $class ne '' && ! $launching{$tracker->{channel}} && $agl > 200 && ($alt - ($tracker->{lastalt}||$alt)) < 100 ) {
            print "\nLaunch detected: $compno, class: $tracker->{class}\n";

	    $is->{sth_launching}->execute( $class );
	    $is->{sth_launching2}->execute( $class, $class );
	    $is->{sth_launching3}->execute( $class, $class );
	    $launching{$tracker->{channel}} = 1;
        }


	if( ! $islate ) {
	    my $c = 0;
	    foreach my $ws ( values %{$channels{ uc($is->{site}.$tracker->{channel}) }->{connections}||{}} ) {
		$c++;
                $ws->send_utf8(sprintf('{"g":"%s","lat":%.4f,"lng":%.4f,"alt":%d,"t":"%s","at":%d,"agl":%d,"s":%4.1f}',
				       $compno, $lt, $lg, $alt, timestr($time), $time, $agl, $signal));
	    }
	    foreach my $ws ( values %{$channels{ uc($is->{site}.'all') }->{connections}||{}} ) {
		$c++;
                $ws->send_utf8(sprintf('{"g":"%s","lat":%.4f,"lng":%.4f,"alt":%d,"t":"%s","at":%d,"agl":%d,"s":%4.1f}',
				       $compno, $lt, $lg, $alt, timestr($time), $time, $agl, $signal));
	    }

	    printf( " (sent %d)", $c );
	}
	else {
	    printf( " (late)" );
	}

	# Don't save if it hasn't changed location - well do but only every 120 seconds
	if( ($tracker->{lastpos}||'') eq int($lt*10000).','.int($lg*10000) && $time - $tracker->{lasttime} < 120 ) {
	}
	# don't save if we aren't yet launching and we are basically on the ground at the airfield
	elsif ( ! $launching{$tracker->{channel}} && $distance < 3 && $agl < 10 ) {
	}
	else {
	    printf( "(saved)" );
	    $is->{sth_insert}->execute( $class, $compno, $tracker->{datecode}, $time, $lt, $lg, $alt, $agl );
	}
        $tracker->{lastpos} = int($lt*10000).','.int($lg*10000);
        $tracker->{lasttime} = $time;
	$tracker->{lastalt} = $alt;
    }

    ## capture launches close to the airfield
    if( $distance < 15.5 ) {
	$agl ||= List::Util::max($alt-elevation( $lt, $lg ),0);

	if( $agl < 2300 ) {

	    if( ! $printedalready ) {
		printf( "\r%s (%3d): %8s: %.3f,%.3f (%4dm/%4dm) %11s %4.1f db: %11s", timestr($time), $td, $compno||$flarmid,$lt, $lg, $alt, $agl, $sid, $signal, $is->{site});
		$printedalready = 1;
	    }
	    
	    if( ! $islate ) {
		foreach my $ws ( values %{$channels{ uc($is->{site}.'launches') }->{connections}} ) {
                    $ws->send_utf8(sprintf('{"g":"%s","flarmid":"%s","lat":%.5f,"lng":%.5f,"alt":%d,"t":"%s","at":%d,"compno":"%s","agl":"%d"}\n',
				   $flarmid, $callsign, $lt, $lg, $alt, timestr($time), $time, $compno, $agl) );
		}
	    }
	    else {
		printf( " (late)" );
	    }

	    printf( " (launch)" );
	    
	    # assume it's valid if it is launched from the local airfield
	    # we want to make sure it is close enough to the ground to be sensible so we don't
	    # false positive on fly overs
	    my $ddb = $is->{ddb};
	    if( $ddb->{$flarmid} && ! $is->{trackers}->{$flarmid} ) {

		my $possiblecompno = $ddb->{$flarmid};
		my $possibleglider = $is->{compnos}->{$possiblecompno};
		if( $possibleglider ) {
		    if(! $possibleglider->{dontlearn} ) {
			$is->{trackers}->{$flarmid} = $possibleglider;
			print "\n-----> $flarmid associated with ".$possiblecompno;
			$is->{sth_recordtracker}->execute( $flarmid,  $possiblecompno, $possibleglider->{class} );
			$is->{sth_recordtracker2}->execute( $possiblecompno, $flarmid, $time );
		    }
		    else {
			print "\n! not learning $flarmid as $possiblecompno as duplicate compno in multiple classes";
		    }
		}
	    }
	}
    }

    if( ! $printedalready ) {
	printf( "\r%s (%3d) %8s%-20s%60s", timestr($time), $td, $sid, $islate ? '(late)' : ' ', '');
    }
    else {
	printf( "%30s\n", '' );
    }
}

# get a list of all the competitions and what should be tracked
sub fetchCompetitions {

    # y3k issue!
    my $now = time();
    my @t = gmtime($now);
    my $year = $t[5]-100;

    open( FH, '../.env.local' ) || die "unable to open ../.env.local to read db configuration";

    my ($database,$host,$user,$pw,$site);

    while( my $l = <FH> ) {
	if( $l =~ m/^MYSQL_([A-Z_]+)=(.*)$/ ) {
	    my ($key,$value) = ($1,$2);
	    $database = $value if( $key eq 'DATABASE' ) ;
	    $host = $value if( $key eq 'HOST' );
	    $user = $value if( $key eq 'USER' );
	    $pw = $value if( $key eq 'PASSWORD' );
	}
	if( $l =~ m/^WEBSITENAME=(.*)$/ ) {
	    $site = $1;
	}
	if( $l =~ m/^DEM_PATH=(.*)$/ ) {
	    $dempath = $1;
	}
    }
    close(FH);

    if( !$site || !$database || !$host || !$user || !$pw ) {
	die "missing config, need MYSQL_(DATABASE|HOST|USER|PASSWORD) + WEBSITENAME in ../.env.local";
    }

    print "configured $host:$database, website: $site, dems: $dempath\n";

    # this works as a loop but the configuration above does not.  If you want to change this it's possible but
    # as the next.js app doesn't support it there may not be much point
    {
	my $db;
	my $is = $competitions{$database};
	
	if( $is ) {
	    $db = $is->{db};
	}

	# make sure the db is still connected
	if( $db && ! $db->ping() ) {
	    print "$database: db handle disconnected unexpectedly\n";
	    $db = undef;
	}

	# if we don't have a connection then we should reconnect
	if( ! $db ) {
	    $db = DBI->connect( "dbi:mysql:database=$database;host=$host", $user, $pw, { PrintError => 1 } ) || next;
	}

	# check if the competition has ended using local times	
	$db->do( 'SET time_zone = (select tz from competition)' );
	my ($dcode) = $db->selectrow_array( 'select todcode(now())' );

	my ($competitionactive) = 
	    $db->selectrow_array( 'select end from competition where end >= now() and start <= now() union select count(*) end from contestday where datecode=todcode(now())' );

	if( ! $competitionactive ) {	    
	    if( $is ) {
		print "$database: competition has ended\n";

		# if we have a websocket server already (which we should then stop watching the socket)
		if( $wsserver ) {
		    $wsserver->unwatch_readable( $is->sock );
		}

		# remove all the channel entries, after disconnecting the clients
		foreach my $refcname ( @{$is->{schannels}} ) {
		    foreach my $ws ( values %{$channels{ uc($is->{site}.$refcname->[0]) }->{connections}} ) {
			$ws->disconnect(0,"live finished");
		    }
		    # and remove from the list of available channels
		    delete $channels{ uc $site.$refcname->[0]  };
		}

		# disconnect the database
		$is->{db}->disconnect();
		delete $is->{db};

		# disconnect the aprs feed
		delete $competitions{$database};
	    }
	    else {
		$db->disconnect();
	    }
	    next;
	}
	


	printf( "$database: is:%d,isdcode:%s,dcode:%s\n", $is ? 1 : 0, $is ? $is->{dcode}||'notset' : 'undefined', $dcode ); 
	# check to see if we should advance the datacode or not
	if( $is ) {
	    if( $is->{dcode} && $dcode ne $is->{dcode} ) {
		printf( "$database: advancing date ($dcode ne ".$is->{dcode}.")\n" );
		$db->do( 'call advanceday()' );
	    }
	    $is->{dcode} = $dcode;
	}

	# everything else we do on this DB handle we do in GMT
	$db->do( 'SET time_zone = "+00:00"' );

	if( ! $is ) {
	    
	    # this could be either in the competition table for newer competitions
	    # or the turnpoints table for older
	    my ($home_lt,$home_lg) = 
		$db->selectrow_array( 'select lt, lg from competition' );
	    
	    if( ! $home_lt || $home_lt eq '' ) {
		($home_lt,$home_lg) = 
		    $db->selectrow_array( 'select tp.lt, tp.lg from competition left outer join global.turnpoints tp on hometp = trigraph and competition.countrycode=country' );
	    }
	    
	    if( ! $home_lt || $home_lt eq '' ) {
		print "Home turnpoint has not been configured in db $database, or competition hasn't defined location\n";
		return;
	    }

	    my $home_alt = elevation( $home_lt, $home_lg );
	    print "$database: detecting launching near $home_lt, $home_lg($home_alt)\n";

	    # setup the APRS object and then add our metadata to it
	    $is = new Ham::APRS::IS( $server, 'OG', 'appid' => "$site.onglide.com 0.2.0", 'filter'=>"r/$home_lt/$home_lg/250.0");
	    $is->{receivedkeepalive} = 0;
	    $is->{lastddbRead} = 0;
	    $is->{site} = $site;
	    $is->{home_lt} = $home_lt;
	    $is->{home_lg} = $home_lg;
	    
	    # so we know what date it is supposed to be
	    ( $is->{dcode} ) = $db->selectrow_array( 'select datecode from compstatus limit 1' );
	}
	

	# setup all the database queries
	if( $db && $db != ($is->{db}||-1) ) {
	    $is->{sth_insert} = $db->prepare( "insert ignore into trackpoints (class,compno,datecode,t,lat,lng,altitude,agl) VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )" );
	    $is->{sth_launching} = $db->prepare( "update compstatus set status='L', starttime = '00:00:00', startheight = 0 where class=? and (status='B' or status='P')" );
	    $is->{sth_launching2} = $db->prepare( "UPDATE contestday SET status = 'Y' WHERE class = ? and datecode = (select datecode from compstatus where class = ?)" );
	    $is->{sth_launching3} = $db->prepare( "UPDATE pilotresult set status='G' where class = ? and status = '-' and datecode = (select datecode from compstatus where class = ?)" );
	
	    $is->{sth_recordtracker} = $db->prepare( 'update tracker set trackerid = ? where compno = ? and class = ? and trackerid="unknown" limit 1' );
	    $is->{sth_recordtracker2} = $db->prepare( 'INSERT INTO trackerhistory (compno,changed,flarmid,launchtime,method) VALUES ( ?, now(), ?, ?, "ognddb" )');

	    $is->{db} = $db;
	    $is->{database} = $database;
	}
	

	# open the log file
	open my $fh, ">>", '/log/aprs/'.$site.'_'.shiftDate($now);
	$is->{fh} = \$fh;
	
	# populate the channel hash with the details needed for this
	my $schannels = $db->selectall_arrayref( 'select UPPER(REPLACE(concat(c.class,c.datecode),"[^A-Za-z0-9]","")) channel from compstatus c' );
	push @{$schannels}, [ 'launches' ];

	foreach my $refcname ( @{$schannels} ) {

	    if( ! defined( $channels{ uc $site.$refcname->[0] } )) {
		$channels{ uc $site.$refcname->[0]  } = {
		    is => $is,
		    connections => {},
		    site => $site,
		};
	    }
	    
	}
	$is->{schannels} = $schannels;

	# figure out which classes are launching
	$schannels = $db->selectall_arrayref( 'select UPPER(REPLACE(concat(c.class,c.datecode),"[^A-Za-z0-9]","")) channel from compstatus c where status in ("L","S","R","H",":")' );
	foreach my $refcname ( @{$schannels} ) {
	    $launching{ $refcname->[0]  } = 1;
	}

	# fetch the list of trackers
	updateTrackers( $is );

#	print "$database: tracking ready\n";

	# and we want to keep monitoring this for traffic
	#	push @aprsfeeds, $is;
	$competitions{$database} = $is;
    }
}


# refetch the list of trackers from the database
sub updateTrackers {
    my ($is) = @_;

    # reload all the trackers from the database, this will flush all the previous points
    my $sth_sids = $is->{db}->prepare( 'select compno, trackerid, UPPER(REPLACE(concat(t.class,c.datecode),"[^A-Za-z0-9]","")) channel, '.
				       ' t.class, 0+1 as confirmed, c.datecode from tracker t, compstatus c '.
				       'where t.class = c.class having trackerid is not null and trackerid <> "unknown" ' );
    $sth_sids->execute();
    $is->{trackers} = $sth_sids->fetchall_hashref('trackerid');

    $sth_sids = $is->{db}->prepare( 'select p.compno, trackerid, UPPER(REPLACE(concat(t.class,c.datecode),"[^A-Za-z0-9]","")) channel, 0 dontlearn, '.
				    ' p.class, c.datecode '.
				    ' from pilots p left outer join tracker t on p.class=t.class and p.compno=t.compno left outer join compstatus c on c.class=p.class '.
				    'where p.class = c.class' );
    $sth_sids->execute();
    $is->{compnos} = $sth_sids->fetchall_hashref('compno');

    # ignore any duplicates
    my $dups = $is->{db}->selectall_arrayref( 'select compno,count(*) from pilots group by compno' );
    foreach my $dup ( @{$dups} ) {
	$is->{compnos}->{$dup}->{dontlearn} = 1;
    }

    # look for any we may not know
    readDDB($is);

    # and some logging so we can confirm it is working properly
#    print "-loaded ".scalar(keys %{$trackers})." trackers for ".scalar(keys %{$compnos})." pilots -\n";
}

sub timestr {
    my @t = gmtime($_[0]);
    return sprintf( "%02d:%02d:%02dZ", $t[2], $t[1], $t[0] );
}

sub shiftDate {
    my @t = gmtime($_[0]);
    return sprintf( "%02d:%02d:%02dZ", $t[2], $t[1], $t[0] );
}

sub haversine {
    my ($lat1,$lon1,$lat2,$lon2) = @_;
    my $R = 6371.0;
    my $L1 = deg2rad($lat1);
    my $L2 = deg2rad($lat2);
    my $DL = $L2-$L1; #deg2rad($lat2-$lat1);
    my $DG = deg2rad($lon2)-deg2rad($lon1);

    my $a = (sin($DL/2) * sin($DL/2)) +
        (cos($L1) * cos($L2) *
         sin($DG/2) * sin($DG/2));
    my $c = 2 * atan2(sqrt($a), sqrt(1-$a));

    return $R * $c;
}


sub elevation
{
    my ($lat,$lon) = @_;

    state %DEMs;
    my $demfileE = floor $lon;
    my $demfileN = floor $lat;

    $DEMs{$demfileE}{$demfileN} //= readDEM($demfileE, $demfileN);
    my $dem = $DEMs{$demfileE}{$demfileN};
    return 0 if( !ref($dem) );

    # use PDL::Graphics::Gnuplot;
    # gplot( with => 'image', $dem );
    # sleep(20);

    # the DEMs start in the NW corner
    my $ilon =      ($lon - $demfileE)  * $W;
    my $ilat = (1 - ($lat - $demfileN)) * $W;
#    return int( $dem->interpND( pdl[$ilon, $ilat] )+0.5);
    my $e = int( $dem->interpND( pdl[$ilon, $ilat] )+0.5);
    return $e > -100 ? $e : 0;

    return int( $dem->interpND( pdl[$ilon, $ilat] )+0.5);
#    return $dem->indexND(pdl[$ilon, $ilat]);
}

sub readDEM
{
    my ($demfileE, $demfileN) = @_;

    # if it is configured not to have dem
    if( $dempath =~ /none/i ) {
	return 0;
    }
    
    my $path;
    if   ($demfileN >= 0 && $demfileE >= 0){ $path = sprintf("%s/N%.2dE%.3d.hgt", $dempath, $demfileN,  $demfileE); }
    elsif($demfileN >= 0 && $demfileE <  0){ $path = sprintf("%s/N%.2dW%.3d.hgt", $dempath, $demfileN, -$demfileE); }
    elsif($demfileN  < 0 && $demfileE >= 0){ $path = sprintf("%s/S%.2dE%.3d.hgt", $dempath, -$demfileN, $demfileE); }
    else                                   { $path = sprintf("%s/S%.2dW%.3d.hgt", $dempath, -$demfileN, -$demfileE); }

    say STDERR "Reading DEM '$path'";
    if( ! -e $path )
    {
	warn "DEM '$path' not found. No height AGL will be available";
	warn " ** you can download dem from https://dds.cr.usgs.gov/srtm/version2_1/SRTM3/ **";
	return 0;
    }

    # Read the DEM on disk into the piddle, then flip the endianness of the
    # data. 
    open my $fd, '<', $path;
    my $odem;
    sysread( $fd, $odem, $W*$W*2, 0 );
    my $dem = zeros(short,$W,$W);
    ${$dem->get_dataref} = pack( "s*", unpack("s>*", $odem));
    $dem->upd_data;

    # Also convert to floating point. Turns out the PDL interpolation routines
    # don't work with integers
    return $dem->float;
}


sub readDDB  {
    my ($is) = @_;
        
    if( (time() - ($is->{lastddbRead}||0) < 3600) && scalar keys %{$is->{trackers}} > 0 ) {
	return;
    }
    
    $is->{lastddbRead} = time();
    
    my $uri = URI->new('http://ddb.glidernet.org/download/');

    my $response = LWP::UserAgent->new->get( $uri );
    if( ! $response->is_success ) {
	print "can't fetch ddb Error: ". $response->status_line. "\n";
	return;
    }

    foreach my $device ( split( "\n", $response->content ) ) {
	if( $device =~ m/^'.','([A-F0-9]{6})','.*','(.*)','(.*)','(.*)','(.*)'/i ) {
	    my $id = $1;
	    my $greg = $2;
	    my $compno = $3;
	    
	    # if it is one we want then save it away
	    if( exists $is->{compnos}->{$compno} ) {
		$is->{ddb}->{$id} = $3;
	    }
	}
    }
}
		
		    

 


