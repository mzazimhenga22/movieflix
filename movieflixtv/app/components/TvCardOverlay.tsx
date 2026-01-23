import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

type OverlayItem = {
  id: string;
  component: ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TvCardOverlayContextType = {
  setOverlay: (id: string, item: Omit<OverlayItem, 'id'> | null) => void;
};

const TvCardOverlayContext = createContext<TvCardOverlayContextType | null>(null);

export function useTvCardOverlay() {
  return useContext(TvCardOverlayContext);
}

export function TvCardOverlayProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, OverlayItem>>({});

  const setOverlay = useCallback((id: string, item: Omit<OverlayItem, 'id'> | null) => {
    setItems((prev) => {
      if (!item) {
        if (!prev[id]) return prev; // No change
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { ...item, id } };
    });
  }, []);

  return (
    <TvCardOverlayContext.Provider value={{ setOverlay }}>
      {children}
      <View style={styles.overlayContainer} pointerEvents="none">
        {Object.values(items).map((item) => (
          <View
            key={item.id}
            style={[
              styles.itemWrapper,
              {
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
              },
            ]}
          >
            {item.component}
          </View>
        ))}
      </View>
    </TvCardOverlayContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999, // Android elevation
  },
  itemWrapper: {
    position: 'absolute',
  },
});
