import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // Import useSafeAreaInsets

interface CustomBottomSheetProps {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  title: string;
  children: React.ReactNode;
  snapPoints?: (string|number)[];
}

export default function CustomBottomSheet({ bottomSheetRef, title, children, snapPoints: customSnapPoints }: CustomBottomSheetProps) {
  const snapPoints = useMemo(() => customSnapPoints || ['40%', '80%'], [customSnapPoints]);
  const insets = useSafeAreaInsets(); // Get safe area insets

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={styles.bottomSheet}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -12,
    },
    shadowOpacity: 0.58,
    shadowRadius: 16.00,
    elevation: 24,
  },
  handleIndicator: {
    backgroundColor: '#555',
  },
  content: {
    padding: 20,
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
});
