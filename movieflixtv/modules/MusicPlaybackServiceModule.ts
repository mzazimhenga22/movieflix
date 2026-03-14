import { NativeModules, Platform } from 'react-native';

const { MusicPlaybackServiceModule } = NativeModules;

interface MusicPlaybackServiceModuleInterface {
  startService(): void;
  stopService(): void;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seekTo(positionMs: number): void;
  setQueue(queueJson: string): void;
  setCurrentIndex(index: number): void;
  getCurrentPosition(): Promise<number>;
  getDuration(): Promise<number>;
  isPlaying(): Promise<boolean>;
}

const isAvailable = Platform.OS === 'android' && MusicPlaybackServiceModule != null;

export const MusicService = {
  startService: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.startService();
    }
  },
  
  stopService: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.stopService();
    }
  },
  
  play: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.play();
    }
  },
  
  pause: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.pause();
    }
  },
  
  next: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.next();
    }
  },
  
  previous: (): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.previous();
    }
  },
  
  seekTo: (positionMs: number): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.seekTo(positionMs);
    }
  },
  
  setQueue: (queue: any[]): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.setQueue(JSON.stringify(queue));
    }
  },
  
  setCurrentIndex: (index: number): void => {
    if (isAvailable) {
      MusicPlaybackServiceModule.setCurrentIndex(index);
    }
  },
  
  getCurrentPosition: async (): Promise<number> => {
    if (isAvailable) {
      return await MusicPlaybackServiceModule.getCurrentPosition();
    }
    return 0;
  },
  
  getDuration: async (): Promise<number> => {
    if (isAvailable) {
      return await MusicPlaybackServiceModule.getDuration();
    }
    return 0;
  },
  
  isPlaying: async (): Promise<boolean> => {
    if (isAvailable) {
      return await MusicPlaybackServiceModule.isPlaying();
    }
    return false;
  },
};

export default MusicPlaybackServiceModule as MusicPlaybackServiceModuleInterface;
