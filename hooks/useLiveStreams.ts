import { useEffect, useState } from 'react';
import { listenToLiveStreams } from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';

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
