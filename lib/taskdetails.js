//
// The turnpoint list
//

import { Nbsp, Icon } from './htmlhelper.js';

import { useState } from 'react';
import { useTask, Spinner, Error } from '../lib/loaders.js';

import Collapse from 'react-bootstrap/Collapse';

//
export function TaskDetails({vc}) {
    const { data, isLoading, error } = useTask(vc);
    const [ open, setOpen ] = useState( false );

    if (isLoading) return <Spinner />
    if (error) return <Error />

    const fClass = data.contestday.class;
    let taskDescription = '';
    switch(data.task.type) {
    case 'S':
        taskDescription = <>Speed Task {data.task.task}: {data.task.distance}km</>;
        break;
    case 'D':
        taskDescription = <>Distance Handicap Task {data.task.task}: {data.task.hdistance}km</>;
        break;
    case 'A':
        taskDescription = <>Assigned Area Task {data.task.task}: {data.task.duration.substring(1,5)}km</>;
        break;
    }

    if(data.contestday.status == 'Z') {
        taskDescription = 'Scrubbed';
    }

    return (
        <>
            <h4>{data.classes.classname} {data.contestday.displaydate}</h4>
            <h5>{taskDescription}
                <a href="#" title="zoom to whole task"> {/* TBD */}
                    <Icon type="zoom-out"/>
                </a>

                <span className="pull-right">
                    <a href="#" onClick={() => setOpen(!open)}
                       title={open?"Hide Task Details":"Show Task Details"}
                       aria-controls="task-collapse"
                       aria-expanded={open}>

                        <Icon type="tasks"/>
                        <Icon type="caret-down"/>
                    </a>
                </span>
            </h5>

            <Collapse in={open}>
                <div id="task-collapse">
                    <Tasklegs legs={data.legs} fClass={fClass} task={data.task.task}/>
                </div>
            </Collapse>
        </>
    );
}


// Internal: details on the leg
function Tasklegs(props) {
    return (
        <table className="table table-condensed" style={{marginBottom:'0px'}}>
            <tbody>
                {props.legs.map( (leg) =>
                    <tr key={leg.legno}>
                        <td>
                            <a href="#"> {/* TBD zoom! */}
                                <Icon type="zoom-in"/>
                            </a>
                            {leg.ntrigraph}
                        </td>
                        <td>{leg.name}</td>
                        {leg.legno !== 0 &&
                         <td>{leg.bearing}&#176;°</td>}
                        {leg.legno !== 0 &&
                         <td>{leg.length} km</td>}
                    </tr>
                )}
            </tbody>
        </table>
    );

}
