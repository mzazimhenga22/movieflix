// declare the module and its props so TS knows about initialColor and onColorChangeComplete
declare module 'react-native-wheel-color-picker' {
    import { Component } from 'react';
    import { ViewProps } from 'react-native';
  
    export interface WheelColorPickerProps extends ViewProps {
      /**
       * Starting color, hex string like "#ff0000"
       */
      initialColor?: string;
  
      /**
       * Called while the user is dragging / changing color (optional)
       * Provide either onColorChange or onColorChangeComplete depending on the lib behavior.
       */
      onColorChange?: (color: string) => void;
  
      /**
       * Called when user completes change (hex string)
       */
      onColorChangeComplete?: (color: string) => void;
  
      // allow other common props
      thumbSize?: number;
      noSnap?: boolean;
      row?: boolean;
    }
  
    export default class WheelColorPicker extends Component<WheelColorPickerProps> {}
  }
  