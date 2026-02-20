import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EdgeInsets } from 'react-native-safe-area-context';

interface ActionButtonsProps {
  mediaType: 'image' | 'video';
  isEditingText: boolean;
  toggleMute: () => void;
  toggleTextEditor: () => void;
  toggleEmojiPicker: () => void;
  windowHeight: number;
  insets: EdgeInsets;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  mediaType,
  isEditingText,
  toggleMute,
  toggleTextEditor,
  toggleEmojiPicker,
  windowHeight,
  insets,
}) => {
  // For mute state, we'll need to pass it from MediaPreview or manage it here if MediaContent is not directly handling the button.
  // For now, let's assume MediaContent handles the actual mute state and this button just triggers a function.
  const [isMuted, setIsMuted] = React.useState(false); // Local state for icon, actual mute handled by MediaContent

  const handleToggleMute = () => {
    setIsMuted(current => !current);
    toggleMute(); // Call the prop function to inform parent
  };

  return (
    <View style={[styles.sideActions, { top: windowHeight * 0.18 + (Platform.OS === 'android' ? 12 : 0) }]}>
      {mediaType === 'video' && (
        <TouchableOpacity style={styles.sideActionBtn} onPress={handleToggleMute}>
          <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-medium-outline'} size={26} color="white" />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.sideActionBtn} onPress={toggleTextEditor}>
        <Ionicons name={isEditingText ? 'text' : 'text-outline'} size={26} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.sideActionBtn} onPress={toggleEmojiPicker}>
        <Ionicons name="happy-outline" size={26} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sideActions: {
    position: 'absolute',
    right: 16,
    zIndex: 999,
  },
  sideActionBtn: { alignItems: 'center', marginBottom: 18 },
});

export default ActionButtons;
