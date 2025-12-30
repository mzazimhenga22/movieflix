import React from 'react';
import * as Reanimated from 'react-native-reanimated';

type WorkletCallback = (...args: any[]) => any;

if (typeof (Reanimated as any).useWorkletCallback !== 'function') {
  (Reanimated as any).useWorkletCallback = function useWorkletCallback<T extends WorkletCallback>(
    worklet: T,
    deps: React.DependencyList = [],
  ) {
    return React.useCallback((...args: Parameters<T>) => {
      'worklet';
      return worklet(...args);
    }, deps);
  };
}

export {};
