//
//
// Helper functions for loading data from APIs
//
// These will be used throughout the components, but it's tidiest to keep the functions in one place
//

import useSWR from 'swr'
import next from 'next'


const fetcher = url => fetch(url).then(res => res.json());

//
// Get name and details of the contest
export function useContest () {
    const { data, error } = useSWR('/api/contest', fetcher)
    return {
        comp: data,
        isLoading: !error && !data,
        isError: !!error
    }
}

//
// Get the pilot list
export function usePilots (vc) {
    const { data, error } = useSWR( '/api/'+vc+'/scoreTask', fetcher, { refreshInterval: 20000 });
    return {
        pilots: data ? data.pilots : null,
        isLoading: !error && !data,
        isError: !!error
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
    const { data, error } = useSWR( () => vc ? '/api/'+vc+'/geoTask' : null, fetcher );
    return {
        taskGeoJSON: data,
        isTLoading: !error && !data,
        isTError: !!error
    }
}

//
// Get the recent trackpoints for the pilot
export function usePilotsGeoJSON (vc) {
    const { data, error } = useSWR( () => vc ? '/api/'+vc+'/geoTracks' : null, fetcher, { refreshInterval: 1000 } );
    return {
        pilotsGeoJSON: data,
        isPLoading: !error && !data,
        isPError: !!error
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
