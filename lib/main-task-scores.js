/* Copyright(c)2007-2014, Melissa Jenkins.  All rights reserved */

// This provides utilities for updating the html on the page
// it is expected to be called every x seconds and will reflow
// the competitor icons into the correct place.

var descriptions = {
    "auto":"Handicapped speed, distance or height agl",
    "speed":"Current handicapped speed",
    "aspeed":"Current actual speed",
    "fspeed":"Fastest possible handicapped speed assuming finishing now",
    "height":"Current height above sea level",
    "aheight":"Current height above ground",
    "climb":"Recent average height change",
    "ld":"Handicapped L/D remaining",
    "ald":"Actual L/D remaining",
    "remaining":"Handicapped distance remaining",
    "distance":"Handicapped distance completed",
    "aremaining":"Actual distance remaining",
    "adistance":"Actual distance completed",
    "start":"Start time",
    "finish":"Finish time",
    "duration":"Task duration",
};

// Setup a results display object
function ResultsDisplay( mapObject, htmlselector ) {
    this.map = mapObject;
    this.html = $(htmlselector);
    this.animation = true;
    this.chosen = null;
    this.sort = 'auto';
    this.sortOrderData = [];
    this.changed = 1;
    this.refreshFinished = true;
    this.highest = 1;
    this.lowest = 0;

    var parent = this;

    // Find the list of pilots and remove the junk fromit
    this.pilotsList = this.html.find('#initiallist');
    this.pilotsList.contents().filter(function(){
        return this.nodeType == 3
    }).remove()

    // Make sure we can wrap all of them
    this.html.find('.pilot').addClass('wrapblock');
    var details = this.details = this.html.find('.details');

    // Setup the click
    var chosen = null
    $(window).on('resize', function() {
        if (chosen != null) {
            details.css('display','none');
            chosen.trigger('click');
        }
    });

    $('#sort_auto').on('click', function() { parent.setSortKey( 'auto' ); return false; }  );
    $('#sort_speed').on('click', function() { parent.setSortKey( ['speed','aspeed','fspeed'] ); return false; } );
    $('#sort_height').on('click', function() { parent.setSortKey( ['height','aheight'] ); return false; } );
    $('#sort_climb').on('click', function() { parent.setSortKey( 'climb' ); return false; } );
    $('#sort_ld').on('click', function() { parent.setSortKey( ['ld','ald'] ); return false; } );
    $('#sort_remaining').on('click', function() { parent.setSortKey( ['remaining','aremaining'] ); return false; } );
    $('#sort_distance').on('click', function() { parent.setSortKey( ['distance','adistance'] ); return false; } );
    $('#sort_times').on('click', function() { parent.setSortKey(['start','duration','finish']); return false; } );

    setTimeout( function() { parent.updateList(true) }, 10000 );
}

ResultsDisplay.prototype.advanceTp = function( direction ) {

    // If we are displaying one then we will advance the turnpoint
    var parent = this;
    if( parent.chosen && parent.chosen.data('id') && parent.details.css('display') != 'none' ) {
	var compno = parent.chosen.data('id') ;
	var tracker = this.map.og_trackers[compno];

	if( ! tracker ) {
	    return;
	}


	// Make sure they really want to
	// Advance the turnpoint
	$.ajax( { type: "GET", url: "control-advancetp-submit.json",
		  data: { compno: compno, tp: tracker.lasttp+direction },
		  timeout:8000,
		  cache: false,
		  dataType: "json",
		  success: function() { alert(' Turnpoint for '+compno+' advanced to turnpoint '+ (tracker.lasttp+direction)+ ', this can take up to 2 minutes to be displayed on the website' ); }});
	 
    }
}


ResultsDisplay.prototype.captureClicks = function() {
    var parent = this;

    // Click to toggle it on or off
    $('.wrapblock').on('click', function(e) {
        e.preventDefault();
	if( ! parent.refreshFinished ) {
	    parent.waitingToBeChosen = e;
	    return;
	}
	parent.waitingToBeChosen = null;
	var compno = $(this).data('id');

	// Hide track of old one
	if( parent.chosen ) { 
	    hideTrack( parent.map, parent.chosen.data('id') );
	}

        if( parent.chosen && parent.chosen.data('id') == compno && parent.details.css('display') != 'none' ) {
            parent.chosen = null;
            parent.details.css('display','none');
            parent.pilotsList.children().removeClass('obscured selected');
        }
        else {
            parent.chosen = $(this);
            parent.updateDetails(compno);
	    showTrack( parent.map, compno );

	    // Real vs fake click
	    if( e.pageX ) {
		zoomPilot( parent.map, compno );
	    }

            var top = $(this).offset().top;
            var blocks = $(this).nextAll('.wrapblock');
            if (blocks.length == 0) {
                parent.placeAfter($(this));
                return false;
            }
            blocks.each(function(i, j) {
                if($(this).offset().top != top) {
                    parent.placeAfter($(this).prev('.wrapblock'));
                    return false;
                } else if ((i + 1) == blocks.length) {
                    parent.placeAfter($(this));
                    return false;
                }
            });
        }
        e.preventDefault();
    });

    $('.wrapblock').hover(
	function(e) { // mouse in
	    var compno = $(this).data('id');
	    console.log( compno + " mouse in " );
	    showTrack( parent.map, compno );
	}, function(e) { // mouse out
	    var compno = $(this).data('id');
	    console.log( compno + " mouse out " );
	    hideTrack( parent.map, compno );
	} );	
}

ResultsDisplay.prototype.placeAfter = function($block) {
    this.details.css('display','inline-block');
    $block.after( this.details );
    this.pilotsList.children().addClass('obscured').removeClass('selected');
    this.chosen.addClass('selected').removeClass('obscured');
    this.details.addClass('selected').removeClass('obscured');

    // Hook the advance button - it may not exist and if it doesn't who cares as you aren't logged in
    var parent = this;
    if( ! this.capturedAdvance ) {
	this.capturedAdvance = true;
	if( $('#advancetpf').length ) {
	    $('#advancetpf').on('click',function() { parent.advanceTp(1); } );
	    $('#advancetpr').on('click',function() { parent.advanceTp(-1); } );
	}
    }
}


// Expose the compno, probably called by the map display
ResultsDisplay.prototype.displayPilot = function( compno ) {

    if( this.chosen == null || this.chosen.data('id') != compno ) {

        this.chosen = this.pilotsList.find('li[data-id="'+compno+'"]');
        if (this.chosen != null ) {

            // Make sure it is showing the right stuff
            this.updateDetails( compno );

            // And then move it to the correct place
            this.details.css('display','none');
            this.chosen.trigger('click');
        }
    }
}

ResultsDisplay.prototype.isChosenPilot = function( compno ) {
    if( this.chosen == null || this.chosen.data('id') != compno ) {
	return false;
    }
    return true;
}
    

ResultsDisplay.prototype.hidePilot = function( compno ) {
    if( this.chosen != null ) {
        this.chosen.trigger('click');
    }
}

// Reflow the display
ResultsDisplay.prototype.updateList = function( timer ) {
    var parent = this;

    // No tracking info yet so don't do anything
    if( ! this.map.og_trackers ) {
        return;
    }

    // No reflow while we are chosen...
    if( this.chosen != null ) {
        return;
    }

    // We need to remove details and re-add it to make sure quicksand doesn't obliterate it
    this.details.detach();

    // To do this we need to clone the existing and then update it
    var newList;
    var applyCapture = false;
    this.pilotsList = this.html.find('.pilots');
    if( this.pilotsList.children().length < 3 ) {
	console.log( "using list template" );
	newList = $('#initiallist').clone();
	$('#initiallist').remove();
	applyCapture = true;
    }
    else {
	newList = this.pilotsList.clone();
    }

    // Only do the complex stuff if it has changed
    if( this.changed == 1 && this.refreshFinished) {
	this.refreshFinished = false;
	this.changed = 0;

	console.log( "changed, reflow" );
	var arr = newList.children().get();
        arr.sort( function(a,b) {
            return parent.sortOrderData[$(b).data('id')] - parent.sortOrderData[$(a).data('id')];
        });

	// Check to make sure it has actually changed - otherwise quicksand gets a bit messy
	var existingList = this.pilotsList.children().get();
	for( var a = 0; a < arr.length && a < existingList.length; a++) {
	    if( $(arr[a]).data('id') !== $(existingList[a]).data('id')) {
		break;
	    }
	}
	if( arr.length == existingList.length && a == arr.length && existingList.length > 0 ) {
	    this.refreshFinished = true;
	    if( parent.waitingToBeChosen ) {
		parent.waitingToBeChosen.trigger('click');
	    }
	    console.log( "refresh skipped" );
	    return;
	}


        // Reflow and then redisplay
        this.pilotsList.quicksand( $(arr), function() {
	    if( parent.pilotsList.css('display') == 'none' ) {
		parent.pilotsList.css('display','block');
	    }
	    // Don't add the click capture until we have trackers for it
	    if( applyCapture && parent.map.og_trackers ) {
		parent.captureClicks();
	    }
	    parent.refreshFinished = true;
	    if( parent.waitingToBeChosen && parent.waitingToBeChosen.trigger ) {
		parent.waitingToBeChosen.trigger('click');
	    }
	} );
    }

    // Call us again
    if( timer ) { 
	setTimeout( function() { parent.updateList(timer); }, 10000 );
    }
}

ResultsDisplay.prototype.updateDetails = function(compno) {

    // Set the information on the results headings regardless
    // of if we are displaying the box
    this.updateSortKey( compno, this.pilotsList );

    // Get the info for the current comp number
    var tracker = this.map.og_trackers[compno];

    // Redisplay the details box, this function will
    // be called to notify us that the details have changed
    // so we may need to ignore calls
    if (this.chosen != null && compno == this.chosen.data('id')) {

        // Get the info for the current comp number
        var tracker = this.map.og_trackers[compno];

        // Hide all optionals will show below
        this.details.find('.optional').css('display','none');

        // And the static data
        for ( var key in tracker ) {
            var v = tracker[key];
	    if( typeof v !== 'object' ) {
		if( typeof v === 'number' ) {
                    v = Math.round(v*10)/10;
		    if( isNaN(v) ) {
			v = undefined;
		    }
		}

		if( v != '' && v != 0.0 && v != undefined  ) {
		    this.details.find('.d_'+key).html( v )
			.parent().css('display','inline');
		}
		else {
		    this.details.find('.d_'+key).text( v )
			.parent().css('display','none');
		}
	    }
        }


        // If it is a landout then we need to update the static map and the landout details
        // this is a special case
        if( tracker.lolat ) {
            this.details.find('.lomap img').src=
                "//maps.googleapis.com/maps/api/staticmap?markers=color:black%7C"+
                tracker.lolat + "," +
                tracker.lolong + "&amp;size=200x200&amp;scale=2&amp;zoom=13&amp;api&amp;sensor=false";
        }

        // Figure out what to show based on the db status
        var show;
        switch(tracker.dbstatus) {
        case '-':
        case 'G':  show = 'notstarted'; break;

        case 'S':  show = 'flying'; break;
        case 'F':  show = 'finished'; break;

        case 'H':  show = 'home'; break;
        case '/':
        case 'D':  show = 'didntfly'; break;

        default:   show = 'landout'; break;
        }

	

        // Show only the options that should be shown the rest are to be hidden
        var options = [ 'notstarted', 'flying', 'finished', 'didntfly', 'landout', 'home' ];
        var parent = this;
        options.forEach( function(key) {
            if( show != key ) {
		parent.details.find('.'+key).hide();
            }
        } );
        options.forEach( function(key) {
            if( show == key ) {
		parent.details.find('.'+key).show();
            }
        } );
    }

    var bcolour = 'grey';
    var icon;
    var thirds = (this.highest - this.lowest)/3;
    switch(tracker.dbstatus) {
    case '-':
    case 'G':  icon='cloud-upload'; break;
	
    case 'S': 
	if( ! tracker.fastpoints && ! tracker.points.length ) {
	    icon = 'question';
	}
	else {
	    if( tracker.averager > 1 ) {
		icon = 'upload';
	    }
	    else {
		icon='plane';
	    } 
	    if( tracker.altitude > thirds * 2 ) {
		icon = icon + ' hgreen';
		bcolour = 'green';
	    }
	    else if ( tracker.altitude > thirds ) { 
		icon = icon +' horange';
		bcolour = 'orange';
	    }
	    else { 
		icon = icon +' hred';
		bcolour = 'red';
	    }
	}
	break;
    case 'F':  icon='trophy'; break;
	
    case 'H':  icon='home'; break;
    case '/':  icon='trash'; break;
    case 'D':  icon='ban-circle'; break;
    case 'R':  icon='question'; break;
	
    default:   icon='road'; break;
    }

    // If it is a finish and it is scored
    if( tracker.datafromscoring == 'Y' && tracker.dbstatus == 'F' ) {
	icon = 'check';
    }

    // Adjust the bar on the pilot marker regardless of status
    var top = Math.min(Math.round(30/(this.highest - this.lowest) * (tracker.altitude - this.lowest)),30);
    if( ! tracker.altitude || ! tracker.max ) {
	top = 0;
    }
//    console.log( tracker.compno + "* height band: " + this.lowest + ">" + tracker.altitude + ">" + this.highest + " = " + top );
    $('#height'+tracker.compno).css('margin-top',30-top).css('height',top).css('border-color',bcolour);

    // And update the icon as well
    var textBox = this.pilotsList.find('#pilotstatus'+tracker.compno);
    textBox.html( '<i class="icon-'+icon+'"/>' );
}

ResultsDisplay.prototype.setIcon = function(compno,icon) {
}

ResultsDisplay.prototype.setHeightRange = function(min,max) {
    this.highest = max;
    this.lowest = min;
}

// Change the sort order for the whole list
ResultsDisplay.prototype.setSortKey = function(order) {

    // Toggle through the options
    if( typeof order  !== 'string' ) {
	var index = order.indexOf( this.sort );
	order = order[ (index+1) % order.length ];
    }

    // Display what the sort order is
    $('#sortdescription').text( descriptions[order] );
    
    this.sort = order;
    var trackerList = this.map.og_trackers;
    for ( var key in trackerList ) {
	this.updateSortKey( trackerList[key].compno, this.pilotsList );
    }
    this.updateList();
}

//
// Private
ResultsDisplay.prototype.updateSortKey = function(compno, list) {

    var display = this.map.og_trackers[compno];
    var textBox = list.find('#pilot'+compno);

    if( ! display ) {
        textBox[0].key = '';
        textBox.text('');
	textBox.parent().find('.units').text( suffix );
    }
    else {

        var oldKey = this.sortOrderData[compno];
        var newKey;
        var suffix = '';
	var displayAs = undefined;

        // data is in tracker.details.x
        switch( this.sort ) {
        case 'speed':
            displayAs = Math.round(newKey=display.hspeed); suffix = "kph";
            break;
        case 'aspeed':
            displayAs = Math.round(newKey=display.speed); suffix = "kph";
            break;
        case 'fspeed':
	    if( display.stationary && ! display.utcfinish ) {
		displayAs = '-';
	    } else {
		newKey = display.utcduration ? display.htaskdistance / (display.utcduration/3600) : 0;
		displayAs = Math.round(newKey*10)/10;
		suffix = "kph";
	    }
            break;
	case 'climb':
	    newKey = Math.round(display.averager*10)/10; suffix = (this.map.og_units ? "kt" : "m");
	    break;
        case 'remaining':
            newKey = Math.round(display.hremaining); suffix = "km";
            break;
        case 'aremaining':
            newKey = Math.round(display.remaining); suffix = "km";
            break;
        case 'distance':
            newKey = Math.round(display.hdistancedone); suffix = "km";
            break;
        case 'adistance':
            newKey = Math.round(display.distancedone); suffix = "km";
            break;
	case 'height':
	    newKey = Math.round(display.altitude); suffix = (this.map.og_units ? "ft" : "m");
	    break;
	case 'aheight':
	    newKey = (display.agl !== undefined ? Math.round(display.agl) : 0); suffix = (this.map.og_units ? "ft" : "m");
	    break;
	case 'start':
	    if( display.utcstart ) {
		displayAs = display.start.substr(0,5);
		suffix = display.start.substr(5,3);
	    }
	    newKey = display.utcstart;
	    break;
	case 'finish':
	    if( display.utcfinish ) {
		displayAs = display.finish.substr(0,5);
		suffix = display.finish.substr(5,3);
	    }
	    newKey = display.utcfinish;
	    break;
	case 'duration':
	    if( display.utcstart && display.utcduration ) {
		displayAs = display.duration.substr(0,5);
		suffix = display.duration.substr(5,3);
	    }
	    newKey = display.utcduration;
	    break;
	case 'ld':
	    if( display.hgrremaining > 0 ) { 
		displayAs = Math.round(display.hgrremaining); suffix = ":1";
		newKey = -displayAs;
	    }
	    else {
		displayAs = '-';
		newKey = -99999;
		suffix = '';
	    }
	    break;
	case 'ald':
	    if( display.grremaining > 0 ) { 
		displayAs = Math.round(display.grremaining); suffix = ":1";
		newKey = -displayAs;
	    }
	    else {
		displayAs = '-';
		newKey = -99999;
		suffix = '';
	    }
	    break;
        case 'done':
            newKey = Math.max(display.hdistancedone, display.hdistance); suffix = "km";
            break;
	case 'auto':
	    // If it is scored then distance or speed
	    if( display.datafromscoring == 'Y' || display.scoredstatus != 'S'  ) {
		if( display.scoredstatus == 'D' || display.dbstatus == 'D' ) {
		    newKey = -1; displayAs = '-';
		}
		else if( display.scoredstatus == 'F' ) {
		    newKey = 1000+Math.round(display.hspeed,1); displayAs = Math.round(display.hspeed,1); suffix = "kph";
		}
		else {
		    newKey = Math.round(display.hdistance,1); displayAs = newKey; suffix = "km";
		}
	    }
	    // Before they start show altitude, sort to the end of the list
	    else if( display.dbstatus == 'G' ) {
		newKey = display.altitude/10000; 
		displayAs = (display.agl !== undefined ? Math.round(display.agl) : 0);
		suffix = this.map.og_units ? "ft" : "m";
	    }
	    else if( display.dbstatus == 'D' ) {
		newKey = -1; displayAs = '-';
	    }

	    // After start but be
	    else {
		var speed = display.hspeed;
		var distance = display.hdistancedone;
		if( this.map.og_task.type == 'D' ) {
		    speed = display.speed;
		    distance = display.distancedone;
		}
		if( speed ) {
		    newKey = 1000+Math.round(speed,1); displayAs = Math.round(speed); suffix = "kph";
		}
		else if( distance ) {
		    newKey = Math.round(distance,1); displayAs = newKey; suffix = "km";
		}
		else {
		    newKey = display.altitude/10000; suffix = this.map.og_units ? "ft" : "m";
		    displayAs = (display.agl !== undefined ? Math.round(display.agl) : 0);
		}
	    }
        }
        if( ! newKey ) {
            newKey = '';
            suffix = '';
        }

        // Detect change, don't reflow if not needed
        if( newKey != oldKey ) {
            this.changed |= 1;
	}
	    
	if( displayAs !== undefined ) {
	    if( ! displayAs ) {
		displayAs = '-';
	    }
	}
	else {
	    if( newKey != '' ) {
		displayAs = newKey;
	    }
	    else {
		displayAs = '-';
	    }
	}

	this.sortOrderData[compno] = newKey;
	textBox.text( displayAs );
	textBox.parent().find('.units').text( suffix );
    }

    return this.changed;
}


