--
-- utility functions, these are quite legacy and pretty focused on the UK scoring
-- system.  However the international system is basically the same and the UK one with no
-- wind set is not actually windicapped
--
-- It would be good to move these out of SQL but does no real harm having them here except
-- restricting the database to mysql...
--
DELIMITER //

--
-- Helpers for calculating datecodes
--
DROP FUNCTION  IF EXISTS todcode  //
DROP FUNCTION  IF EXISTS fdcode  //

CREATE FUNCTION todcode ( _dt DATE ) RETURNS CHAR(4) DETERMINISTIC
	RETURN CONCAT( MOD(YEAR(_dt)-2000,10), CONV(MONTH(_dt),10,36), CONV(DAY(_dt),10,36)) //

CREATE FUNCTION fdcode ( _dt CHAR(4) ) RETURNS CHAR(11) DETERMINISTIC
	RETURN CONCAT( LEFT(_dt,1)+(YEAR(NOW()-MOD(YEAR(NOW()),10), '-', CONV(MID(_dt,2,1),36,10), '-', CONV(RIGHT(_dt,1),36,10)) //



--
-- Calculate the handicap/windycap for the specified task, required for everything about displaying the task to work
--
DROP PROCEDURE IF EXISTS wcapdistance_taskid //
CREATE PROCEDURE wcapdistance_taskid (  IN _taskid INTEGER ) DETERMINISTIC 
BEGIN
		DECLARE Wstrength, Wdir FLOAT;
		DECLARE legdist,bearing,wcapdistance FLOAT;
		DECLARE prevlt,prevlg FLOAT DEFAULT 0;
		DECLARE curlt,curlg FLOAT;
		DECLARE dLat, dLong, x, y FLOAT;
		DECLARE pythagkm, a, c FLOAT;
		DECLARE _type CHAR(1);
		DECLARE _legno INT DEFAULT 0;
		DECLARE _datecode CHAR(3);
		DECLARE tasklength,htasklength  FLOAT DEFAULT 0;
		DECLARE WdirRAD,theta,radbear,_hi FLOAT;
		DECLARE _chop INT;
		DECLARE minhandicap DOUBLE(4,1) DEFAULT 100;
		DECLARE hmaxtasklength, wleglength FLOAT DEFAULT 0;
		DECLARE _cwdf FLOAT;
		DECLARE W FLOAT;
		DECLARE iclass CHAR(15);
		DECLARE _nonefound INTEGER DEFAULT 0;

		-- Get the wind, if 0 then only handicap adjustments happen so no problem for international
		SELECT winddir, windspeed INTO
			   Wdir, Wstrength
			   FROM compstatus cs, tasks t
			   WHERE cs.class = t.class AND
			         t.taskid = _taskid;

		-- get the turnpoints, CSV list
		SELECT tasks.datecode, tasks.class, tasks.type
			INTO _datecode, iclass, _type
			FROM tasks
			WHERE tasks.taskid = _taskid;

  		-- get parameters
		SELECT contestWindDivisionFactor
			INTO _cwdf
			FROM global.comprules, classes, competition
			WHERE classes.class=iclass
			  AND classes.type = comprules.name
			  AND comprules.country = competition.countrycode;
			
		-- max marking distance for the task... ;)
		SELECT MIN(handicap)
			INTO minhandicap
			FROM pilots
			WHERE class = iclass;

		-- SHORTCUT
		SET wdirrad= RADIANS(wdir);
	
		-- calculate wind according to new rules
		-- if the factor is not set or it is distance handicap then no windicapping
		IF _cwdf != 0 and _type <> 'D' THEN
			SET W = LEAST( Wstrength / _cwdf, 30 );
		ELSE
			SET W = 0;
		END IF;

				-- helpful logging
		insert into msg values( concat( iclass, ", wddirrad=",wdirrad,",W=",W,",minhandicap",minhandicap ));

		-- make sure we have a task and then process
		SET _nonefound = 0;
		WHILE _nonefound = 0 DO

			SET _nonefound = 1;
			SELECT RADIANS(nlat), RADIANS(nlng), 0
				INTO curlt, curlg, _nonefound
				FROM taskleg
				WHERE legno = _legno AND taskid = _taskid;

			insert into msg values( concat( iclass, "+", _legno, " lt:",curlt, " lg:",curlg ));

			-- not first point, remove old entries for this task
			IF prevlt != 0 THEN

				-- calculate the bearing & distance (haversine)
				SET dLat = curlt - prevlt,
					dLong = curlg - prevlg,
					a = SIN(dLat/2) * SIN(dLat/2) +
					    COS(prevlt) * COS(curlt) * SIN(dLong/2) * SIN(dLong/2),
					c = 2 * ATAN2(SQRT(a),SQRT(1-a));

				SET pythagkm = 6371 * c;
				-- leg bearing

				SET y = SIN(curlg-prevlg) * COS(curlt);
				SET x = COS(prevlt)*SIN(curlt) - SIN(prevlt)*COS(curlt)*COS(curlg-prevlg);

				SET bearing = MOD(DEGREES(ATAN2(y,x)) + 360, 360) ;

				-- theta & stuff
				SET radbear = RADIANS(bearing);
				IF (radbear-WdirRAD)>PI() THEN
					SET theta = (2*PI())-radbear+WdirRAD;
				ELSE
					SET theta = radbear-WdirRAD;
				END IF;


				-- calcute the bearing & Hi
				SET _hi = 100*(SQRT(1-((W/46)*(W/46)*SIN(theta)*SIN(theta)))-(1+(W/46)*COS(theta)));

				insert into msg values( concat( _legno, ":theta=",theta,",radbear=",radbear,",hi=",_hi,",dist=",pythagkm,",wdirrad",WdirRAD ));

				-- update task stats
				SET tasklength = tasklength + pythagkm;

				-- calculate a windicap only leg length - used for display of progress
				SET wleglength = (100.0*pythagkm)/GREATEST((100+_hi),25);

				-- for each leg we need to calculate the max marking distance
				SET hmaxtasklength = hmaxtasklength + (100.0*pythagkm)/GREATEST((minhandicap+_hi),25);
				SET htasklength = htasklength + wleglength;

				-- and insert into the table
				UPDATE taskleg
					   set length = ROUND(pythagkm,1),
					   	   bearing = bearing,
						   Hi = _hi
					WHERE taskid = _taskid and legno=_legno;

			ELSE

				-- insert a leg 0 with nothing so we know all the legs and don't
				-- have to do naff joins in the XMLSQL
				UPDATE taskleg
					   set length = 0,
					   	   bearing = 0,
						   Hi = 0,
					WHERE taskid = _taskid and legno = _legno;
	
			END IF;

			-- previous point for the next pass
			SET prevlt = curlt, prevlg = curlg;
			SET _legno = _legno + 1;

		END WHILE;

		-- and update the task distance
		UPDATE tasks
			SET distance = ROUND(tasklength,1),
				hdistance = ROUND(htasklength,1),
				maxmarkingdistance = ROUND(hmaxtasklength,1)
			WHERE taskid = _taskid;

END;

//


--
-- 
-- This procedure calculates the points for the class.  Note BGA rules but this is basically same as international
-- there is a good chance this is unnecessary in nextjs version as we aren't merging scores in the DB but on the
-- front end, but it was needed when the DB contained start/finish times
--
DROP PROCEDURE IF EXISTS daypoints //
CREATE PROCEDURE daypoints ( IN _class CHAR(15) ) DETERMINISTIC 
daypoints: BEGIN

	DECLARE _miny, _maxy INT DEFAULT 0;
	DECLARE _ypercentageW, _ypercentageU FLOAT DEFAULT 0;
	DECLARE _Da, _Ta INT DEFAULT 0;
	DECLARE _tasktype CHAR(1);
	
	DECLARE Vh,Dw,Dtask,Dmax FLOAT DEFAULT 0;
	DECLARE NpastY, Nfinish, Nlo, N, NI INT DEFAULT 0;

	DECLARE wduration, wdistance, wspeed, twothirdswspeed FLOAT DEFAULT 0;
	DECLARE wcompno CHAR(6) DEFAULT '';
	DECLARE junk FLOAT;
	DECLARE _datecode CHAR(3);
	DECLARE Ff,Fv,Fd,F,Ps,Pd,_y FLOAT;


	SELECT datecode
		INTO _datecode
		FROM compstatus
			WHERE compstatus.class = _class;

	-- get parameters
	SELECT miny, maxy, ypercentageW, ypercentageU, Da, Ta
		INTO _miny, _maxy, _ypercentageW, _ypercentageU, _Da, _Ta
		FROM global.comprules, classes, competition
		WHERE classes.class=_class
		  AND classes.type = comprules.name
		  AND comprules.country = competition.countrycode;


	-- calculate Y.... either ypercentageU or ypercentageW can be set not both!
	SELECT LEAST(GREATEST((distance*_ypercentageU)+(hdistance*_ypercentageW),_miny),_maxy),
		   maxmarkingdistance, type
		INTO _y, Dmax, _tasktype
		FROM tasks
		WHERE tasks.class=_class AND tasks.flown='Y'
		  AND tasks.datecode=_datecode;

    IF _tasktype = 'A' THEN
	    LEAVE daypoints;
    END IF;
	
	-- number past y, includes finishers and people who have flown
	SELECT count(*) INTO NpastY
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND ((scoredstatus = 'F' or scoredstatus = 'S') OR
			 	 (scoredstatus = 'H' AND	hdistance > _y));


	-- number of finishers and number of landouts
	SELECT count(*)	INTO Nfinish
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND (scoredstatus = 'F' or scoredstatus = 'S');

	SELECT count(*)	INTO Nlo
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND scoredstatus = 'H';

	-- number not withdrawn
	SELECT count(*)	INTO N
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND scoredstatus != '/';

	-- number not withdrawn and who flew
	SELECT count(*)	INTO NI
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND scoredstatus != '/' and scoredstatus != 'D'
			AND NOT (scoredstatus = 'H' and
				       (loLAT is null and start = '00:00:00'));


	insert into msg values ( CONCAT( "---- ", _class, " ----" ));
	insert into msg values ( CONCAT( "_y:", _y, ", NpastY:", NpastY, ", Nfinish:", Nfinish, ", Nlo:", Nlo, ", NI:",NI,", DMax:", DMax ) );

	-- Figure out who the winner is, and get their details
	SELECT CASE
			  WHEN turnpoints >= 0 THEN hdistance
			  WHEN speed > 0 THEN hspeed+10000
			END winner,
			pr.compno, hspeed, hdistance, TIME_TO_SEC(duration)/3600
		INTO junk, wcompno, wspeed, wdistance, wduration
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			ORDER BY winner DESC
			LIMIT 1;

	-- check for devaluation
	SET Ff = LEAST( (1.25 * NpastY) / N, 1.000 );
	SET	F = 1000.0 * Ff;

	insert into msg values ( CONCAT( "Ff:", Ff, ", F:", F, ", N:", N, ", Nlo:", Nlo, ", Ny:", NpastY, ", Nfinish:", Nfinish ));

	IF wdistance > 0 AND wdistance >= _y AND (Ff * ((5 * wdistance)-_Da)) < F THEN
		SET F = Ff * ((5 * wdistance)-_Da);
	END IF;

	IF wduration > 0 AND (Ff * ((400 * wduration)-_Ta)) < F THEN
		SET F = FF * ((400 * wduration)-_Ta);
	END IF;

	insert into msg values ( CONCAT( "wcompno:", wcompno, ", wspeed:", wspeed, "->", (2*wspeed/3), ", wdistance:", wdistance, ", wduration:", wduration ));
	insert into msg values ( CONCAT( "Ff:", Ff, ", F:", F ));

	--
	-- Work out speed & distance points
	--

	-- how many were faster than 2/3rds of the winners speed?
	SELECT count(*)
		INTO twothirdswspeed
		FROM pilotresult pr, pilots p
		  WHERE pr.class = _class AND pr.datecode = _datecode and pr.compno = p.compno  and p.participating = 'Y'
			AND (hspeed > (2*wspeed/3));

	SET Fv = 0.6666667 * F * (twothirdswspeed / NI);
	SET	Fd = F - Fv;

	insert into msg values ( CONCAT( "datecode:", _datecode, ", 2/3rds:", twothirdswspeed, ", Fv:", Fv, ", Fd:", Fd ));


	-- Now we need to update the scoreds for each pilot
	UPDATE pilotresult
		SET daypoints = GREATEST(3 * Fv * ((hspeed / wspeed ) - 0.6667), 0 ) + Fd
		  WHERE class = _class AND datecode = _datecode
			AND scoredstatus = 'F';

	UPDATE pilotresult
		SET daypoints = Fd * (hdistance/Dmax)
		  WHERE class = _class AND datecode = _datecode
			AND scoredstatus = 'H';


	UPDATE pilotresult
		SET daypoints = 0
		  WHERE class = _class AND datecode = _datecode
			AND scoredstatus != 'F' AND scoredstatus != 'H';

	update pilotresult pr, pilots p set pr.totalrank = 0, pr.dayrank = 0
	 where pr.datecode=_datecode and pr.class=_class and p.compno = pr.compno
	    and participating = 'N';

	-- this relies on ranks not being set for H/C
	-- calculate the day rank
	set @day = 0;
	update pilotresult pr set pr.dayrank = (@day:=@day+1)
	 where pr.datecode=_datecode and pr.class=_class and
	       (select participating from pilots p where p.compno = pr.compno) ='Y'
      order by pr.daypoints desc;

	-- Check for ties and correct
	update pilotresult pr,
		   (select daypoints, min(dayrank) dayrank from pilotresult p2, pilots p where p.compno = p2.compno and p.participating = 'Y' and
		           p2.datecode=_datecode and p2.class=_class group by 1) x
		SET pr.dayrank = x.dayrank where pr.daypoints=x.daypoints and datecode=_datecode and class=_class;

	-- calculate the overall rank, including todays results
	 update pilotresult p left join
	      (select compno, sum(daypoints) dpt from pilotresult where datecode < _datecode group by compno) p2
		     on p.compno = p2.compno
	    set p.totalpoints = COALESCE(p2.dpt,0)+p.daypoints where class=_class and datecode=_datecode;

	set @total = 0;
	update pilotresult pr set pr.totalrank = (@total:=@total+1)
	 where pr.datecode=_datecode and pr.class=_class and
	       (select participating from pilots p where p.compno = pr.compno) ='Y'
      order by pr.totalpoints desc;

	-- check for ties and correct
	update pilotresult pr,
		   (select totalpoints, min(totalrank) totalrank from pilotresult p2, pilots p where p.compno = p2.compno and p.participating = 'Y'
		      and p2.datecode=_datecode and p2.class=_class group by 1) x
		SET pr.totalrank = x.totalrank where pr.totalpoints=x.totalpoints and datecode=_datecode and class=_class;

END;

//


DELIMITER ;
