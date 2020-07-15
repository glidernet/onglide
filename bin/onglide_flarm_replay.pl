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

my $W = 1201; # I use 3-minute DEMs, so each DEM is 1201 x 1201

#
my $dem = '/home/melissa/dem';
print "replay!";

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

        # every 60 seconds we need to do keepalives etc
        if( ! ($now % 60) ) {
            foreach my $connection ( $serv->connections ) {
                $connection->send_utf8(sprintf("{'keepalive':1,'t':'%s','at':%d,'listeners':%d}",
                                               $nowStr, $now, $listeners{$connection->{channel}} ));
            }
        }

        # otherwise we process this seconds packets from aprs
	foreach my $is ( values %competitions ) {
	    receivePackets($is);
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
                $conn->send_utf8(sprintf("{'keepalive':1,'t':'%s','at':%d,'listeners':%d}",
                                         $nowStr, $now, $listeners{$conn->{channel}} ));

                # and some logging
                #               print "connection for $conn->{channel} now ready\n";
            },

            disconnect => sub {
                my ($conn,$reason) = @_;

                # if not fully formed then abandon
                return if( ! $conn->{c} );

                # remove us from the list of connections that the #is
                delete $conn->{c}->{connections}->{ $conn->{key} };
                $listeners{ $conn->{channel} }--;

                #               print "disconnect from $conn->{channel}\n";
            },
            );
    },

    # keep alives and status checks every minute
    tick_period => 1,
    );

# send something to APRS server as well
foreach my $aprs ( values %competitions ) {
    # and update the list of trackers
    updateTrackers($aprs);
}

$wsserver->start;


sub date {
    my @t = gmtime($_[0]);
    return sprintf( "%04d-%02d-%02d", ($t[5]+1900),($t[4]+1),$t[3]);
}


#
# Main packet processing procedure
#
my $ts;

sub receivePackets {
    my ($is) = @_;

    $ts = $is->{currentTime};
    my $readts = 0;
    my $fh = $is->{src};

    my $count = 0;

    while( ! eof( $$fh ) && ($ts+1) >= $readts ) {

	my $l = readline($$fh); 

        if( $l =~ /^\s*#/ ) {
            $is->{receivedkeepalive} = $ts;
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
                                    doGliderStuff( $is, $callsign, uc $flarmid, $readts = $packetdata{timestamp}, $s_id, $lt, $lg, $alt, $signal, $l );
                                }
				$is->{currentTime} = $readts;

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
    my $td = $ts - $time;
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
                $ws->send_utf8(sprintf("{'g':'%s','lat':%.4f,'lng':%.4f,'alt':%d,'t':'%s','at':%d,'agl':%d,'s':%4.1f}\n",
                                       $compno, $lt, $lg, $alt, timestr($time), $time, $agl, $signal));
            }
            foreach my $ws ( values %{$channels{ uc($is->{site}.'all') }->{connections}||{}} ) {
                $c++;
                $ws->send_utf8(sprintf("{'g':'%s','lat':%.4f,'lng':%.4f,'alt':%d,'t':'%s','at':%d,'agl':%d,'s':%4.1f}\n",
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
                    $ws->send_utf8(sprintf("{'g':'%s','flarmid':'%s','lat':%.5f,'lng':%.5f,'alt':%d,'t':'%s','at':%d,'compno':'%s','agl':'%d'}\n",
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
            my $trackers = $is->{trackers};
            if( $trackers->{$flarmid} && ! $trackers->{$flarmid}->{confirmed} ) {
                $trackers->{$flarmid}->{confirmed} = 1;
                print "\n-----> $flarmid associated with ".$trackers->{$flarmid}->{compno};
                $is->{sth_recordtracker}->execute( $flarmid,  $trackers->{$flarmid}->{compno}, $trackers->{$flarmid}->{class} );
                $is->{sth_recordtracker2}->execute( $trackers->{$flarmid}->{compno}, $flarmid, $time );
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

    my $path = `pwd`;
    print $path;
    $path =~ /\/d([a-zA-Z0-9_-]+)\/([0-9][0-9])$/;
    my $database = "d$1$2";
    my $site = $1;
    my $year = $2;

    # find the scoring files so we know if it's a real competition or not
    for my $file (glob "replay/*.ogn") {
        $file =~ /replay\/([0-9A-Z][0-9A-Z][0-9A-Z]).ogn$/;
        my $datecode = $1;

	print $file . ";". $datecode;

        my $db;
        my $is = $competitions{$database};
	print "is(426):".Dumper($is);

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
            $db = DBI->connect( "dbi:mysql:database=$database;host=dbhost;port=3306", "dbuser", "S3v3nC", { PrintError => 0 } ) || next;
        }

        # what datecode are we supposed to be replaying
        $db->do( 'update compstatus set datecode = ?, status="L"', undef, $datecode );

	# set up the database properly, this requires some resetting of data
	$db->do( 'create table prfromscoring select * from pilotresult' );
	$db->do( 'update pilotresult set status="G", finish="00:00:00", start="00:00:00", duration="00:00:00", scoredstatus="S", '.
		 'hspeed=0, speed=0, hdistance=0, distance=0, '.
		 'datafromscoring="N", daypoints=0, totalpoints=0, totalrank=0, dayrank=0, prevtotalrank=0, penalty=0,'.
		 'loReported=null,loLAT=NULL,loLONG=NULL, '.
		 'forcetp=NULL, forcetptime=NULL, igcavailable="N" '.
		 ' WHERE datecode = ?', undef, $datecode );

	# recalculate all the handicap lengths for all pilots
	$db->do( 'call determinepilothcaplengths()');

        # everything else we do on this DB handle we do in GMT
        $db->do( 'SET time_zone = "GMT"' );

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

            # open the file
            open my $fh, '<', $file or die "$!";

            my $fdate = <$fh>; chomp($fdate); print ">$fdate\n";
            my $tp = Time::Piece->strptime( $fdate, '%Y-%m-%d %H:%M:%S' ); print "File Header: ". $tp . ":" . $tp->epoch;

            # get ready to read from the file
            $is = {'x','1'};
            $is->{src} = \$fh;
            $is->{currentTime} = $tp->epoch;
            $is->{receivedkeepalive} = 0;
            $is->{lastddbRead} = 0;
            $is->{site} = $site;
            $is->{home_lt} = $home_lt;
            $is->{home_lg} = $home_lg;

            # reset the datecode
            $db->do( 'truncate table trackpoints' );
            $db->do( 'update pilotstatus set status = "G" where datecode=?', undef, $datecode );
        }

	print "is(490):".Dumper($is);

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

        #       print "$database: tracking ready\n";

        # and we want to keep monitoring this for traffic
        #       push @aprsfeeds, $is;
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

    $sth_sids = $is->{db}->prepare( 'select p.compno, trackerid, UPPER(REPLACE(concat(t.class,c.datecode),"[^A-Za-z0-9]","")) channel, '.
                                    ' p.class, c.datecode '.
                                    ' from pilots p left outer join tracker t on p.class=t.class and p.compno=t.compno, compstatus c '.
                                    'where p.class = c.class' );
    $sth_sids->execute();
    $is->{compnos} = $sth_sids->fetchall_hashref('compno');

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

    my $path;
    if   ($demfileN >= 0 && $demfileE >= 0){ $path = sprintf("$dem/N%.2dE%.3d.hgt", $demfileN,  $demfileE); }
    elsif($demfileN >= 0 && $demfileE <  0){ $path = sprintf("$dem/N%.2dW%.3d.hgt", $demfileN, -$demfileE); }
    elsif($demfileN  < 0 && $demfileE >= 0){ $path = sprintf("$dem/S%.2dE%.3d.hgt", -$demfileN, $demfileE); }
    else                                   { $path = sprintf("$dem/S%.2dW%.3d.hgt", -$demfileN, -$demfileE); }

    say STDERR "Reading DEM '$path'";
    if( ! -e $path )
    {
        warn "DEM '$path' not found. All of its elevations will read as 0";
        return 0;
    }

    # I read the DEM on disk into the piddle, then flip the endianness of the
    # data. I wouldn't have to copy anything if the data was little-endian to
    # start with; I'd just mmap into the piddle.
    open my $fd, '<', $path;
    my $odem;
    sysread( $fd, $odem, $W*$W*2, 0 );
    my $dem = zeros(short,$W,$W);
    ${$dem->get_dataref} = pack( "s*", unpack("s>*", $odem));
    $dem->upd_data;

    # I also convert to floating point. Turns out the PDL interpolation routines
    # don't work with integers
    return $dem->float;
    #    return $dem;
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
            if( exists $is->{compnos}->{$compno} && ! exists $is->{trackers}->{$id} ) {
                #               print ">> $id, $greg, $compno\n";
                my %temp = %{$is->{compnos}->{$compno}};
                $is->{compnos}->{$compno}->{trackerid} = $id;
                $is->{trackers}->{$id} = \%temp;
                $is->{trackers}->{$id}->{confirmed} = 0;
            }
        }
    }
}
