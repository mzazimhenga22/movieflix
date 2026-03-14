import { NativeModules, Platform } from 'react-native';

const { TvFocusModule } = NativeModules;

interface TvFocusModuleInterface {
  enableFocusGuides(enabled: boolean): void;
  setFocusAcceleration(acceleration: number): void;
  playTickSound(): void;
  setFocusScale(scale: number): void;
  enableHapticFeedback(enabled: boolean): void;
}

const isAvailable = Platform.OS === 'android' && TvFocusModule != null;

export const TvFocus = {
  enableFocusGuides: (enabled: boolean): void => {
    if (isAvailable) {
      TvFocusModule.enableFocusGuides(enabled);
    }
  },
  
  setFocusAcceleration: (acceleration: number): void => {
    if (isAvailable) {
      TvFocusModule.setFocusAcceleration(acceleration);
    }
  },
  
  playTickSound: (): void => {
    if (isAvailable) {
      TvFocusModule.playTickSound();
    }
  },
  
  setFocusScale: (scale: number): void => {
    if (isAvailable) {
      TvFocusModule.setFocusScale(scale);
    }
  },
  
  enableHapticFeedback: (enabled: boolean): void => {
    if (isAvailable) {
      TvFocusModule.enableHapticFeedback(enabled);
    }
  },
};

export default TvFocusModule as TvFocusModuleInterface;
