//
// Private

import _foreach  from 'lodash.foreach'

export function updateSortKeys(trackers,sortKey) {

    console.log( 'sorting on '+sortKey );

    function updatePilotSortKey(tracker,sortKey,units) {

        //        var oldKey = this.sortOrderData[compno];
        var newKey;
        var suffix = '';
        var displayAs = undefined;

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
            newKey = Math.round(tracker.averager*10)/10; suffix = (units ? "kt" : "m");
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
            newKey = Math.round(tracker.altitude); suffix = (units ? "ft" : "m");
            break;
        case 'aheight':
            newKey = (tracker.agl !== undefined ? Math.round(tracker.agl) : 0); suffix = (units ? "ft" : "m");
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
            if( tracker.utcstart && tracker.utcduration ) {
                displayAs = tracker.duration.substr(0,5);
                suffix = tracker.duration.substr(5,3);
            }
            newKey = tracker.utcduration;
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
                    newKey = 1000+Math.round(tracker.hspeed,1); displayAs = Math.round(tracker.hspeed,1); suffix = "kph";
                }
                else {
                    newKey = Math.round(tracker.hdistancedone,1); displayAs = newKey; suffix = "km";
                }
            }
            // Before they start show altitude, sort to the end of the list
            else if( tracker.dbstatus == 'G' ) {
                newKey = tracker.altitude/10000;
                displayAs = (tracker.agl !== undefined ? Math.round(tracker.agl) : 0);
                suffix = units ? "ft" : "m";
            }
            else if( tracker.dbstatus == 'D' ) {
                newKey = -1; displayAs = '-';
            }

            // After start but be
            else {
                var speed = tracker.hspeed;
                var distance = tracker.hdistancedone;
/*                if( this.map.og_task.type == 'D' ) {
                    speed = tracker.speed;
                    distance = tracker.distancedone;
                    }*/
                if( speed ) {
                    newKey = 1000+Math.round(speed,1); displayAs = Math.round(speed); suffix = "kph";
                }
                else if( distance ) {
                    newKey = Math.round(distance,1); displayAs = newKey; suffix = "km";
                }
                else {
                    newKey = tracker.altitude/10000; suffix = units ? "ft" : "m";
                    displayAs = (tracker.agl !== undefined ? Math.round(tracker.agl) : 0);
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
        updatePilotSortKey( tracker, sortKey );
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
    "height": ['height','aheight'],
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
