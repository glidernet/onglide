//
// Private

import _foreach  from 'lodash.foreach'

export function updateSortKeys(trackers,sortKey,units) {

    function updatePilotSortKey(tracker,sortKey,units) {

        //        var oldKey = this.sortOrderData[compno];
        var newKey;
        var suffix = '';
        var displayAs = undefined;
		const unitConv = units ? 3.28084 : 1;
		const unitSuffix = (units ? "ft" : "m");

        // data is in tracker.details.x
        switch( sortKey ) {
        case 'speed':
            displayAs = Math.round(newKey=tracker.hspeed); suffix = "kph";
            break;
        case 'aspeed':
            displayAs = Math.round(newKey=tracker.speed); suffix = "kph";
            break;
        case 'fspeed':
            if( tracker.stationary && ! tracker.utcfinish ) {
                displayAs = '-';
            } else {
                newKey = tracker.utcduration ? tracker.htaskdistance / (tracker.utcduration/3600) : 0;
                displayAs = Math.round(newKey*10)/10;
                suffix = "kph";
            }
            break;
        case 'climb':
            newKey = tracker.average; suffix = units ? 'kt' : 'm/s'; displayAs = Math.round(newKey*(units? 19.43844 : 10))/10;
            break;
        case 'remaining':
            newKey = Math.round(tracker.hremaining); suffix = "km";
            break;
        case 'aremaining':
            newKey = Math.round(tracker.remaining); suffix = "km";
            break;
        case 'distance':
            newKey = Math.round(tracker.hdistancedone); suffix = "km";
            break;
        case 'adistance':
            newKey = Math.round(tracker.distancedone); suffix = "km";
            break;
        case 'height':
				newKey = Math.round(tracker.altitude); suffix = unitSuffix;
				displayAs = Math.round(newKey * unitConv);
            break;
        case 'aheight':
				newKey = Math.round(tracker.agl||0); suffix = unitSuffix;
				displayAs = Math.round(newKey * unitConv);
            break;
        case 'start':
            if( tracker.utcstart ) {
                displayAs = tracker.start.substr(0,5);
                suffix = tracker.start.substr(5,3);
            }
            newKey = tracker.utcstart;
            break;
        case 'finish':
            if( tracker.utcfinish ) {
                displayAs = tracker.finish.substr(0,5);
                suffix = tracker.finish.substr(5,3);
            }
            newKey = tracker.utcfinish;
            break;
		case 'duration':
			if( tracker.finish && tracker.finish != '00:00:00' && ! tracker.utcduration ) {
				displayAs = '-';
				suffix = '';
				newKey = '';
			}
			else if( tracker.utcstart ) {
				if( tracker.utcduration ) {
					displayAs = tracker.duration.substr(0,5);
					suffix = tracker.duration.substr(5,3);
					newKey = tracker.utcduration;
				}
				else {
					newKey = new Date(0);
					newKey.setSeconds( (tracker.utcfinish ? tracker.utcfinish : (new Date().getTime()/1000)) - tracker.utcstart);
					const iso = newKey.toISOString();
					newKey = newKey.getTime()/1000;
					displayAs = iso.substr(11,5);
					suffix = iso.substr(16,3);
				}
            }
            break;
        case 'ld':
            if( tracker.hgrremaining > 0 ) {
                displayAs = Math.round(tracker.hgrremaining); suffix = ":1";
                newKey = -displayAs;
            }
            else {
                displayAs = '-';
                newKey = -99999;
                suffix = '';
            }
            break;
        case 'ald':
            if( tracker.grremaining > 0 ) {
                displayAs = Math.round(tracker.grremaining); suffix = ":1";
                newKey = -displayAs;
            }
            else {
                displayAs = '-';
                newKey = -99999;
                suffix = '';
            }
            break;
        case 'done':
            newKey = tracker.hdistancedone; suffix = "km";
            break;
        case 'auto':
            // If it is scored then distance or speed
            if( tracker.datafromscoring == 'Y' || tracker.scoredstatus != 'S'  ) {
                if( tracker.scoredstatus == 'D' || tracker.dbstatus == 'D' ) {
                    newKey = -1; displayAs = '-';
                }
                else if( tracker.scoredstatus == 'F' ) {
                    newKey = 1000+Math.round(tracker.hspeed*10); displayAs = Math.round(tracker.hspeed*10)/10; suffix = "kph";
                }
                else {
                    newKey = Math.round(tracker.hdistancedone*10); displayAs = newKey; suffix = "km";
                }
            }
            // Before they start show altitude, sort to the end of the list
            else if( tracker.dbstatus == 'G' ) {
                newKey = tracker.altitude/10000;
                displayAs = Math.round((tracker.agl||0)* unitConv);
                suffix = unitSuffix;
            }
            else if( tracker.dbstatus == 'D' ) {
                newKey = -1; displayAs = '-';
            }
            // After start but be
            else {
                var speed = tracker.hspeed;
                var distance = tracker.hdistancedone;

                if( speed > 5 && !(tracker.agl < 200 && tracker.delay > 3600) ) {
                    newKey = 10000+Math.round(speed*10); displayAs = Math.round(speed); suffix = "kph";
                }
                else if( distance > 5 ) {
                    newKey = Math.round(distance*10); displayAs = Math.round(distance); suffix = "km";
                }
                else {
                    newKey = tracker.agl/10000; suffix = unitSuffix;
                    displayAs = Math.round((tracker.agl||0)*unitConv);
                }
            }
        }
        if( ! newKey ) {
            newKey = '';
            suffix = '';
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

        tracker.sortKey = newKey;
        tracker.displayAs = displayAs;
        tracker.units = suffix;
    }

    _foreach( trackers, (tracker) => {
        updatePilotSortKey( tracker, sortKey, units );
    });
}

// list of descriptions
const descriptions =    {
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

const sortOrders = {
    "auto": [ "auto" ],
    "speed" : ['speed','aspeed','fspeed'],
    "height": ['aheight','height'],
    "climb": ['climb'],
    "ld": ['ld','ald'],
    "remaining": ['remaining','aremaining'],
    "distance": ['distance','adistance'],
    "times":['start','duration','finish'],
}

export function getSortDescription(id) {
    return descriptions[id];
}

//
// This will figure out what the next sort order should be based on the current one
export function nextSortOrder(key,current) {

    // Toggle through the options
    const orders = sortOrders[key];
    const index = orders.indexOf( current );
    const order = orders[ (index+1) % orders.length ];

    // And return
    return order;
}
