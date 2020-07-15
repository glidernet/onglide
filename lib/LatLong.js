/*
 * LatLong object - methods summary
 *
 *   p = new LatLong('512839N', '0002741W')
 *   p = new LatLong(53.123, -1.987)
 *
 *   dist = LatLong.distHaversine(p1, p2)
 *   dist = LatLong.distCosineLaw(p1, p2)
 *   dist = LatLong.distVincenty(p1, p2)
 *
 *   brng = LatLong.bearing(p1, p2)
 *   dist = p1.distAlongVector(orig, dirn)
 *   p = LatLong.midPoint(p1, p2)
 *   p2 = p1.destPoint(initBrng, dist)
 *   brng = p.finalBrng(initBrng, dist)
 *
 *   dist = LatLong.distRhumb(p1, p2)
 *   brng = LatLong.brngRhumb(p1, p2)
 *   p2 = p1.destPointRhumb(brng, dist)
 *
 *   rad = LatLong.llToRad('51º28'39"N')
 *   latDms = p.latitude()
 *   lonDms = p.longitude()
 *   dms = LatLong.radToDegMinSec(0.1284563)
 *   dms = LatLong.radToBrng(0.1284563)
 *
 * properties:
 *   p.lat - latitude in radians (0=equator, pi/2=N.pole)
 *   p.lon - longitude in radians (0=Greenwich, E=+ve)
 *
 * © 2002-2005 Chris Veness, www.movable-type.co.uk
 */


/*
 * LatLong constructor:
 *
 *   arguments are in degrees: signed decimal or d-m-s + NSEW as per LatLong.llToRad()
 */
export default function LatLong(degLat, degLong) {
  this.lat = LatLong.llToRad(degLat);
  this.lon = LatLong.llToRad(degLong);
}


/*
 * Calculate distance (in km) between two points specified by latitude/longitude with Haversine formula
 *
 * from: Haversine formula - R. W. Sinnott, "Virtues of the Haversine",
 *       Sky and Telescope, vol 68, no 2, 1984
 *       http://www.census.gov/cgi-bin/geo/gisfaq?Q5.1
 */
LatLong.distHaversine = function(p1, p2) {
  var R = 6371; // earth's mean radius in km
  var dLat  = p2.lat - p1.lat;
  var dLong = p2.lon - p1.lon;

  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(p1.lat) * Math.cos(p2.lat) * Math.sin(dLong/2) * Math.sin(dLong/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;

  return d;
}


/*
 * Calculate distance (in km) between two points specified by latitude/longitude using law of cosines.
 */
LatLong.distCosineLaw = function(p1, p2) {
  var R = 6371; // earth's mean radius in km
  var d = Math.acos(Math.sin(p1.lat)*Math.sin(p2.lat) +
                    Math.cos(p1.lat)*Math.cos(p2.lat)*Math.cos(p2.lon-p1.lon)) * R;
  return d;
}



/**
 * Vincenty inverse calculation.
 *
 * @private
 * @param   {LatLon} point - Latitude/longitude of destination point.
 * @returns {Object} Object including distance, initialBearing, finalBearing.
 * @throws  {Error}  If formula failed to converge.
 */
LatLong.distVincenty = function(p1,p2) {
    var phi1 = p1.lat, lambda1 = p1.lon;
    var phi2 = p2.lat, lambda2 = p2.lon;

    var a = 6378137.0, b = 6356752.314245, f = 1/298.257223563;

    var L = lambda2 - lambda1;
    var tanU1 = (1-f) * Math.tan(phi1), cosU1 = 1 / Math.sqrt((1 + tanU1*tanU1)), sinU1 = tanU1 * cosU1;
    var tanU2 = (1-f) * Math.tan(phi2), cosU2 = 1 / Math.sqrt((1 + tanU2*tanU2)), sinU2 = tanU2 * cosU2;

    var sinlambda, coslambda, sinSqsigma, sinsigma, cossigma, sigma, sinalpha, cosSqalpha, cos2sigmaM, C;

    var lambda = L, lambdaP, iterations = 0;
    do {
	sinlambda = Math.sin(lambda);
	coslambda = Math.cos(lambda);
	sinSqsigma = (cosU2*sinlambda) * (cosU2*sinlambda) + (cosU1*sinU2-sinU1*cosU2*coslambda) * (cosU1*sinU2-sinU1*cosU2*coslambda);
	sinsigma = Math.sqrt(sinSqsigma);
	if (sinsigma == 0) return 0;  // co-incident points
	cossigma = sinU1*sinU2 + cosU1*cosU2*coslambda;
	sigma = Math.atan2(sinsigma, cossigma);
	sinalpha = cosU1 * cosU2 * sinlambda / sinsigma;
	cosSqalpha = 1 - sinalpha*sinalpha;
	cos2sigmaM = cossigma - 2*sinU1*sinU2/cosSqalpha;
	if (isNaN(cos2sigmaM)) cos2sigmaM = 0;  // equatorial line: cosSqalpha=0 (§6)
	C = f/16*cosSqalpha*(4+f*(4-3*cosSqalpha));
	lambdaP = lambda;
	lambda = L + (1-C) * f * sinalpha * (sigma + C*sinsigma*(cos2sigmaM+C*cossigma*(-1+2*cos2sigmaM*cos2sigmaM)));
    } while (Math.abs(lambda-lambdaP) > 1e-12 && ++iterations<200);
    if (iterations>=200) {
	console.log( "distance between " +p1+ " and "+p2+" failed to converge" );
	return undefined;
    }

    var uSq = cosSqalpha * (a*a - b*b) / (b*b);
    var A = 1 + uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
    var B = uSq/1024 * (256+uSq*(-128+uSq*(74-47*uSq)));
    var deltasigma = B*sinsigma*(cos2sigmaM+B/4*(cossigma*(-1+2*cos2sigmaM*cos2sigmaM)-
				 B/6*cos2sigmaM*(-3+4*sinsigma*sinsigma)*(-3+4*cos2sigmaM*cos2sigmaM)));

    var s = b*A*(sigma-deltasigma);

    var alpha1 = Math.atan2(cosU2*sinlambda,  cosU1*sinU2-sinU1*cosU2*coslambda);
    var alpha2 = Math.atan2(cosU1*sinlambda, -sinU1*cosU2+cosU1*sinU2*coslambda);

    alpha1 = (alpha1 + 2*Math.PI) % (2*Math.PI); // normalise to 0..360
    alpha2 = (alpha2 + 2*Math.PI) % (2*Math.PI); // normalise to 0..360

    s = Number(s.toFixed(2))/1000; // round to 1mm precision
    return s;
};



/*
 * calculate (initial) bearing (in radians clockwise) between two points
 *
 * from: Ed Williams' Aviation Formulary, http://williams.best.vwh.net/avform.htm#Crs
 */
LatLong.bearing = function(p1, p2) {
  var y = Math.sin(p2.lon-p1.lon) * Math.cos(p2.lat);
  var x = Math.cos(p1.lat)*Math.sin(p2.lat) -
          Math.sin(p1.lat)*Math.cos(p2.lat)*Math.cos(p2.lon-p1.lon);
  return Math.atan2(y, x);
}


/*
 * calculate distance of point along a given vector defined by origin point
 * and direction in radians (uses planar not spherical geometry, so only valid
 * for small distances).
 */
LatLong.prototype.distAlongVector = function(orig, dirn) {
  var dist = LatLong.distHaversine(this, orig);  // distance from orig to point
  var brng = LatLong.bearing(this, orig);        // bearing between orig and point
  return dist * Math.cos(brng-dirn);
}


/*
 * calculate midpoint of great circle line between p1 & p2.
 *   see http://mathforum.org/library/drmath/view/51822.html for derivation
 */
LatLong.midPoint = function(p1, p2) {
  var dLon = p2.lon - p1.lon;

  var Bx = Math.cos(p2.lat) * Math.cos(dLon);
  var By = Math.cos(p2.lat) * Math.sin(dLon);

  lat3 = Math.atan2(Math.sin(p1.lat)+Math.sin(p2.lat),
                    Math.sqrt((Math.cos(p1.lat)+Bx)*(Math.cos(p1.lat)+Bx) + By*By ) );
  lon3 = p1.lon + Math.atan2(By, Math.cos(p1.lat) + Bx);

  if (isNaN(lat3) || isNaN(lon3)) return null;
  return new LatLong(lat3*180/Math.PI, lon3*180/Math.PI);
}

/* calculate intersection of two point/bearing combinations */
/* from http://edwilliams.org/avform.htm#Intersection */
/* will return a point if there is an intersection or null */
LatLong.intersection = function(p1,crs13,p2,crs23) {
    var crs12;
    var crs21;
    var dst12=2.0*Math.asin(Math.sqrt(Math.pow(Math.sin((p1.lat-p2.lat)/2.0),2))+
			    Math.cos(p1.lat)*Math.cos(p2.lat)*Math.pow(Math.sin((p1.lon-p2.lon)/2),2));
    if ( Math.sin(p2.lon-p1.lon)<0 ) {
	crs12=Math.acos((Math.sin(p2.lat)-Math.sin(p1.lat)*Math.cos(dst12))/(Math.sin(dst12)*Math.cos(p1.lat)));
	crs21=2.0*Math.PI-Math.acos((Math.sin(p1.lat)-Math.sin(p2.lat)*Math.cos(dst12))/(Math.sin(dst12)*Math.cos(p2.lat)));
    }
    else {
	crs12=2.0*Math.PI-Math.acos((Math.sin(p2.lat)-Math.sin(p1.lat)*Math.cos(dst12))/(Math.sin(dst12)*Math.cos(p1.lat)));
	crs21=Math.acos((Math.sin(p1.lat)-Math.sin(p2.lat)*Math.cos(dst12))/(Math.sin(dst12)*Math.cos(p2.lat)));
    }

    var ang1=((crs13-crs12+Math.PI) % (2.0*Math.PI))-Math.PI;
    var ang2=((crs21-crs23+Math.PI) % (2.0*Math.PI))-Math.PI;

    if( Math.sin(ang1)==0 && Math.sin(ang2)==0 ) {
	console.log( "infinity of intersections" );
	return null;
    }
    else if ( Math.sin(ang1)*Math.sin(ang2)<0 ) {
	console.log( "intersection ambiguous" );
	return null;
    }
    else {
	ang1=Math.abs(ang1)
	ang2=Math.abs(ang2)
	var p3 = new LatLong(0,0);
	var ang3=Math.acos(-Math.cos(ang1)*Math.cos(ang2)+Math.sin(ang1)*Math.sin(ang2)*Math.cos(dst12));
	var dst13=Math.atan2(Math.sin(dst12)*Math.sin(ang1)*Math.sin(ang2),Math.cos(ang2)+Math.cos(ang1)*Math.cos(ang3));
	p3.lat=Math.asin(Math.sin(p1.lat)*Math.cos(dst13)+Math.cos(p1.lat)*Math.sin(dst13)*Math.cos(crs13));
	var dlon=Math.atan2(Math.sin(crs13)*Math.sin(dst13)*Math.cos(p1.lat),Math.cos(dst13)-Math.sin(p1.lat)*Math.sin(p3.lat));
	p3.lon=((p1.lon-dlon+Math.PI)%(2.0*Math.PI))-Math.PI;
	console.log( "ang1:"+ang1+",ang2:"+ang2+",ang3:"+ang3+",dst13:"+dst13);
	return p3;
    }
}

/*
Intermediate points on a great circle

In previous sections we have found intermediate points on a great circle given either the crossing latitude or longitude. Here we find points (lat,lon) a given fraction of the distance (d) between them. Suppose the starting point is (lat1,lon1) and the final point (lat2,lon2) and we want the point a fraction f along the great circle route. f=0 is point 1. f=1 is point 2. The two points cannot be antipodal ( i.e. lat1+lat2=0 and abs(lon1-lon2)=pi) because then the route is undefined. The intermediate latitude and longitude is then given by:

*/
LatLong.intermediatePoint = function(p1,p2,d,f) {
    var A=Math.sin((1-f)*d)/Math.sin(d);
    var B=Math.sin(f*d)/Math.sin(d);
    var x = A*Math.cos(p1.lat)*Math.cos(p1.lon) +  B*Math.cos(p2.lat)*Math.cos(p2.lon);
    var y = A*Math.cos(p1.lat)*Math.sin(p1.lon) +  B*Math.cos(p2.lat)*Math.sin(p2.lon);
    var z = A*Math.sin(p1.lat)           +  B*Math.sin(p2.lat);
    var r = new LatLong(0,0);
    r.lat = Math.atan2(z,Math.sqrt(Math.pow(x,2)+Math.pow(y,2)));
    r.lon = Math.atan2(y,x);
    return r;
}
					       

/*
 * calculate destination point given start point, initial bearing and distance
 *   see http://williams.best.vwh.net/avform.htm#LL
 */
LatLong.prototype.destPoint = function(brng, dist) {
  var R = 6371; // earth's mean radius in km
  var p1 = this, p2 = new LatLong(0,0), d = parseFloat(dist)/R;  // d = angular distance covered on earth's surface
  brng = LatLong.degToRad(brng);

  p2.lat = Math.asin( Math.sin(p1.lat)*Math.cos(d) + Math.cos(p1.lat)*Math.sin(d)*Math.cos(brng) );
  p2.lon = p1.lon + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(p1.lat), Math.cos(d)-Math.sin(p1.lat)*Math.sin(p2.lat));

  if (isNaN(p2.lat) || isNaN(p2.lon)) return null;
  return p2;
}

/*
 * calculate destination point given start point, initial bearing and distance
 *   see http://williams.best.vwh.net/avform.htm#LL
 */
LatLong.prototype.destPointRad = function(brng, dist) {
  var R = 6371; // earth's mean radius in km
  var p1 = this, p2 = new LatLong(0,0), d = parseFloat(dist)/R;  // d = angular distance covered on earth's surface

  p2.lat = Math.asin( Math.sin(p1.lat)*Math.cos(d) + Math.cos(p1.lat)*Math.sin(d)*Math.cos(brng) );
  p2.lon = p1.lon + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(p1.lat), Math.cos(d)-Math.sin(p1.lat)*Math.sin(p2.lat));

  if (isNaN(p2.lat) || isNaN(p2.lon)) return null;
  return p2;
}


/*
 * calculate final bearing arriving at destination point given start point, initial bearing and distance
 */
LatLong.prototype.finalBrng = function(brng, dist) {
  var p1 = this, p2 = p1.destPoint(brng, dist);
  // get reverse bearing point 2 to point 1 & reverse it by adding 180º
  var h2 = (LatLong.bearing(p2, p1) + Math.PI) % (2*Math.PI);
  return h2;
}


/*
 * calculate distance, bearing, destination point on rhumb line
 *   see http://williams.best.vwh.net/avform.htm#Rhumb
 */
LatLong.distRhumb = function(p1, p2) {
  var R = 6371; // earth's mean radius in km
  var dLat = p2.lat-p1.lat, dLon = Math.abs(p2.lon-p1.lon);
  var dPhi = Math.log(Math.tan(p2.lat/2+Math.PI/4)/Math.tan(p1.lat/2+Math.PI/4));
  var q = dLat/dPhi;
  if (!isFinite(q)) q = Math.cos(p1.lat);
  // if dLon over 180° take shorter rhumb across 180° meridian:
  if (dLon > Math.PI) dLon = 2*Math.PI - dLon;
  var d = Math.sqrt(dLat*dLat + q*q*dLon*dLon); 
  return d * R;
}


LatLong.brngRhumb = function(p1, p2) {
  var dLon = p2.lon-p1.lon;
  var dPhi = Math.log(Math.tan(p2.lat/2+Math.PI/4)/Math.tan(p1.lat/2+Math.PI/4));
  if (Math.abs(dLon) > Math.PI) dLon = dLon>0 ? -(2*Math.PI-dLon) : (2*Math.PI+dLon);
  return Math.atan2(dLon, dPhi);
}


LatLong.prototype.destPointRhumb = function(brng, dist) {
  var R = 6371; // earth's mean radius in km
  var p1 = this, p2 = new LatLong(0,0);
  var d = parseFloat(dist)/R;  // d = angular distance covered on earth's surface
  brng = LatLong.degToRad(brng);

  p2.lat = p1.lat + d*Math.cos(brng);
  var dPhi = Math.log(Math.tan(p2.lat/2+Math.PI/4)/Math.tan(p1.lat/2+Math.PI/4));
  var q = (p2.lat-p1.lat)/dPhi;
  if (!isFinite(q)) q = Math.cos(p1.lat);
  var dLon = d*Math.sin(brng)/q;
  // check for some daft bugger going past the pole
  if (Math.abs(p2.lat) > Math.PI/2) p2.lat = p2.lat>0 ? Math.PI-p2.lat : -Math.PI-p2.lat;
  p2.lon = (p1.lon+dLon+Math.PI)%(2*Math.PI) - Math.PI;
 
  if (isNaN(p2.lat) || isNaN(p2.lon)) return null;
  return p2;
}


/*
 * convert lat/long in degrees to radians, for handling input values
 *
 *   this is very flexible on formats, allowing signed decimal degrees (numeric or text), or
 *   deg-min-sec suffixed by compass direction (NSEW). A variety of separators are accepted 
 *   (eg 3º 37' 09"W) or fixed-width format without separators (eg 0033709W). Seconds and minutes
 *   may be omitted. Minimal validation is done.
 */
LatLong.llToRad = function(brng) {
  if (!isNaN(brng)) return brng * Math.PI / 180;  // signed decimal degrees without NSEW

  brng = brng.replace(/[\s]*$/,'');               // strip trailing whitespace
  var dir = brng.slice(-1).toUpperCase();         // compass dir'n
  if (!/[NSEW]/.test(dir)) return NaN;            // check for correct compass direction
  brng = brng.slice(0,-1);                        // and lose it off the end
  var dms = brng.split(/[\s:,°º′\'″\"]/);         // check for separators indicating d/m/s
  switch (dms.length) {                           // convert to decimal degrees...
    case 3:                                       // interpret 3-part result as d/m/s
      var deg = dms[0]/1 + dms[1]/60 + dms[2]/3600; break;
    case 2:                                       // interpret 2-part result as d/m
      var deg = dms[0]/1 + dms[1]/60; break;
    case 1:                                       // non-separated format dddmmss
      if (/[NS]/.test(dir)) brng = '0' + brng;    // - normalise N/S to 3-digit degrees
      var deg = brng.slice(0,3)/1 + brng.slice(3,5)/60 + brng.slice(5)/3600; break;
    default: return NaN;
  }
  if (/[WS]/.test(dir)) deg = -deg;               // take west and south as -ve
  return deg * Math.PI / 180;                     // then convert to radians
}


/* 
 * convert degrees to radians - used for bearing, so 360º with no N/S/E/W suffix
 *   can accept d/m/s, d/m, or decimal degrees
 */
LatLong.degToRad = function(brng) {
  var dms = brng.split(/[\s:,º°\'\"′″]/)          // check for separators indicating d/m/s
  switch (dms.length) {                           // convert to decimal degrees...
    case 3:                                       // interpret 3-part result as d/m/s
      var deg = dms[0]/1 + dms[1]/60 + dms[2]/3600; break;
    case 2:                                       // interpret 2-part result as d/m
      var deg = dms[0]/1 + dms[1]/60; break;
    default: 
      var deg = parseFloat(brng); break;          // otherwise decimal degrees
  }
  return deg * Math.PI / 180;                     // then convert to radians
}


/*
 * convert latitude into +/-DDD.dddd
 */
LatLong.prototype.dlat = function() {
  return (this.lat * (180/3.141592654));
}


/*
 * convert longitude into degrees, minutes, seconds; eg 000º27'41"W
 */
LatLong.prototype.dlong = function() {
  return (this.lon * (180/3.141592654));
}

/*
 * convert latitude into degrees, minutes, seconds; eg 51º28'38"N
 */
LatLong.prototype.latitude = function() {
//  return LatLong._dmstandard(this.lat).slice(1) + (this.lat<0 ? 'S' : 'N');
  return LatLong._dmstandard(this.lat) + (this.lat<0 ? 'S' : 'N');
}


/*
 * convert longitude into degrees, minutes, seconds; eg 000º27'41"W
 */
LatLong.prototype.longitude = function() {
  return LatLong._dmstandard(this.lon) + (this.lon>0 ? 'E' : 'W');
}


/*
 * convert radians to (signed) degrees, minutes, seconds; eg -0.1rad = -000°05'44"
 */
LatLong.radToDegMinSec = function(rad) {
  return (rad<0?'-':'') + LatLong._dms(rad);
}

LatLong.radToDegMin = function(rad) {
  return (rad<0?'-':'') + LatLong._dm(rad);
}

LatLong.latToDMS = function(rad) {
  return LatLong._dms(rad) + (rad > 0 ? 'N' : 'S');
}

LatLong.latToDM = function(rad) {
  return LatLong._dm(rad) + (rad > 0 ? 'N' : 'S');
}

LatLong.longToDMS = function(rad) {
  return LatLong._dms(rad) + (rad > 0 ? 'E' : 'W');
}

LatLong.longToDM = function(rad) {
  return LatLong._dm(rad) + (rad > 0 ? 'E' : 'W');
}

LatLong.radToDegMinStandard = function(rad,letters) {
  return LatLong._dmstandard(rad) + (rad<0?letters[0]:letters[1]);
}

/*
 * convert radians to compass bearing - 0°-360° rather than +ve/-ve
 */
LatLong.radToBrng = function(rad) {
  return LatLong.radToDegMinSec((rad+2*Math.PI) % (2*Math.PI));
}

LatLong.radToDBrng = function(rad) {
   return (rad+2*Math.PI) % (2*Math.PI);
}


/*
 * convert radians to deg/min/sec, with no sign or compass dirn (internal use)
 */
LatLong._dms = function(rad) {
  var d = Math.abs(rad * 180 / Math.PI);
  d += 1/7200;  // add ½ second for rounding
  var deg = Math.floor(d);
  var min = Math.floor((d-deg)*60);
  var sec = Math.floor((d-deg-min/60)*3600);
  // add leading zeros if required
  if (deg<100) deg = '0' + deg; if (deg<10) deg = '0' + deg;
  if (min<10) min = '0' + min;
  if (sec<10) sec = '0' + sec;
  return deg + '\u00B0' + min + '\u2032' + sec + '\u2033';
}

LatLong._dm = function(rad) {
  var d = Math.abs(rad * 180 / Math.PI);
  //  d += 1/7200;  // add ½ second for rounding
  var deg = Math.floor(d);
  var min = Math.floor((d-deg)*60000)/1000;
  // add leading zeros if required
  if (deg<100) deg = '0' + deg; if (deg<10) deg = '0' + deg;
  if (min<10) min = '0' + min;
  return deg + '\u00B0' + min + '\u2032';
}

LatLong._dmstandard = function(rad) {
  var d = Math.abs(rad * 180 / Math.PI);
  //  d += 1/7200;  // add ½ second for rounding
  var deg = Math.floor(d);
  var min = Math.floor((d-deg)*60000)/1000;
  // add leading zeros if required
  if (deg<10) deg = '0' + deg;
  if (min<10) min = '0' + min;
  if (! (""+min).match( /[.]/)) min += ".000";
  if (! (""+min).match( /[.][0-9]{3}$/)) min += "0";
  if (! (""+min).match( /[.][0-9]{3}$/)) min += "0";
  return deg + ':' + min;
}


/*
 * override toPrecision method with one which displays trailing zeros in place
 *   of exponential notation
 *
 * (for Haversine, use 4 sf to reflect reasonable indication of accuracy)
 */
Number.prototype.toPrecision = function(fig) {
  var scale = Math.ceil(Math.log(this)*Math.LOG10E);
  var mult = Math.pow(10, fig-scale);
  return Math.round(this*mult)/mult;
}


/*
 * it's good form to include a toString method...
 */
LatLong.prototype.toString = function() {
  return this.latitude() + ', ' + this.longitude();
}

