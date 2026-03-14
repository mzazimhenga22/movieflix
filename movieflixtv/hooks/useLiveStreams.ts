import { listenToLiveStreams } from '@/lib/liveService';
import type { LiveStream } from '@/lib/liveTypes';
import { useEffect, useState } from 'react';

const useLiveStreams = (): [LiveStream[], boolean] => {
    const [state, setState] = useState<{ streams: LiveStream[]; loaded: boolean }>({
        streams: [],
        loaded: false,
    });

    useEffect(() => {
        const unsubscribe = listenToLiveStreams((streams) => {
            setState({ streams, loaded: true });
        });
        return () => unsubscribe();
    }, []);

    return [state.streams, state.loaded];
};

export default useLiveStreams;
