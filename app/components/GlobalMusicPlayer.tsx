import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Media } from '../../types';
import MusicPlayerModal from './music/MusicPlayerModal';

type GlobalMusicPlayerContextValue = {
  currentTrack: Media | null;
  playerVisible: boolean;
  playerActive: boolean;
  accentColor: string;
  playTrack: (track: Media, accentColor?: string) => void;
  openPlayer: () => void;
  closePlayer: () => void;
  stopPlayer: () => void;
  setAccentColor: (color: string) => void;
};

const GlobalMusicPlayerContext = createContext<GlobalMusicPlayerContextValue | null>(null);

export const useGlobalMusicPlayer = () => {
  const ctx = useContext(GlobalMusicPlayerContext);
  if (!ctx) {
    throw new Error('useGlobalMusicPlayer must be used within GlobalMusicPlayerProvider');
  }
  return ctx;
};

type Props = {
  children: React.ReactNode;
};

export const GlobalMusicPlayerProvider: React.FC<Props> = ({ children }) => {
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerActive, setPlayerActive] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Media | null>(null);
  const [accentColor, setAccentColor] = useState('#1db954');

  const playTrack = useCallback((track: Media, nextAccent?: string) => {
    setCurrentTrack(track);
    setPlayerActive(true);
    setPlayerVisible(true);
    if (nextAccent) setAccentColor(nextAccent);
  }, []);

  const openPlayer = useCallback(() => {
    if (!currentTrack) return;
    setPlayerActive(true);
    setPlayerVisible(true);
  }, [currentTrack]);

  const closePlayer = useCallback(() => {
    setPlayerVisible(false);
  }, []);

  const stopPlayer = useCallback(() => {
    setPlayerVisible(false);
    setPlayerActive(false);
    setCurrentTrack(null);
  }, []);

  const value = useMemo(
    () => ({
      currentTrack,
      playerVisible,
      playerActive,
      accentColor,
      playTrack,
      openPlayer,
      closePlayer,
      stopPlayer,
      setAccentColor,
    }),
    [accentColor, closePlayer, currentTrack, openPlayer, playTrack, playerActive, playerVisible, stopPlayer],
  );

  return (
    <GlobalMusicPlayerContext.Provider value={value}>
      {children}
      <MusicPlayerModal
        visible={playerVisible}
        active={playerActive}
        minimized={playerActive && !playerVisible}
        track={currentTrack}
        accentColor={accentColor}
        onClose={closePlayer}
        onExpand={openPlayer}
        onStop={stopPlayer}
      />
    </GlobalMusicPlayerContext.Provider>
  );
};

export default GlobalMusicPlayerProvider;
