//
//
// Helper functions for loading data from APIs
//
// These will be used throughout the components, but it's tidiest to keep the functions in one place
//

import useSWR from 'swr'
import next from 'next'

const fetcher = url => fetch(url).then(res => res.json());

// How often to refresh the score or the track
const scoreRefreshInterval = process.env.NEXT_SCORE_REFRESH_INTERVAL ? process.env.NEXT_SCORE_REFRESH_INTERVAL : (120*1000);
const trackRefreshInterval = process.env.NEXT_TRACK_REFRESH_INTERVAL ? process.env.NEXT_TRACK_REFRESH_INTERVAL : (120*1000);

//
// Get name and details of the contest
export function useContest (initialData) {
    const { data, error } = useSWR('/api/contest', fetcher, { initialData: initialData })
    return {
        comp: data,
        isLoading: !error && !data,
        isError: !!error
    }
}

//
// Get the pilot list
export function usePilots (vc,initialData) {

    if( ! vc ) {
	vc = 'none';
    }

    // We will check for scores every 20 seconds, the indirection ensures that we don't
    // end up with checking every class every 20 seconds after changing tabs...
    const { data, error, mutate } = useSWR( ['/api/scoreTask',vc], () => fetcher('/api/'+vc+'/scoreTask'),
					    { refreshInterval: scoreRefreshInterval,
					      dedupingInterval: 60000,
					      revalidateOnMount: true,
					      initialData: initialData });
    return {
        pilots: data ? data.pilots : null,
        isLoading: !error && !data,
        isError: !!error,
	mutate: mutate,
    }
}

//
// Get the task details
export function useTask (vc) {
    const { data, error } = useSWR( () => vc ? '/api/'+vc+'/task' : null, fetcher );
    return {
        data: data,
        isLoading: !error && !data,
        isError: !!error
    }
}

//
// Get the GeoJSON representing the task, this includes sectors, tracklines and markers
export function useTaskGeoJSON (vc) {
    const { data, error } = useSWR( () => '/api/'+vc+'/geoTask', fetcher );
    return {
        taskGeoJSON: data,
        isTLoading: !error && !data,
        isTError: !!error
    }
}

//
// Get the recent trackpoints for the pilot
export function usePilotsGeoJSON (vc) {
    const { data, error, mutate } = useSWR( ['/api/geoTracks',vc], () => fetcher('/api/'+vc+'/geoTracks'),
				    { refreshInterval: trackRefreshInterval } );
    return {
        pilotsGeoJSON: data,
        isPLoading: !error && !data,
        isPError: !!error,
	pilotsGeoJSONmutate: mutate
    }
}

//
// Get the recent trackpoints for the pilot
export function usePilotFullGeoJSON (vc,compno) {
    const { data, error } = useSWR( ['/api/pilotGeoTrack',vc,compno], () => compno?fetcher('/api/'+vc+'/pilotGeoTrack?compno='+compno):null,
				    { refreshInterval: trackRefreshInterval*2 });
    return {
        pilotFullGeoJSON: data,
        isSPLoading: !error && !data,
        isSPError: !!error
    }
}

//
// Loading helpers
export function Spinner () {
    return <div>Loading</div>;
}

export function Error () {
    return <div>Oops!</div>
}
