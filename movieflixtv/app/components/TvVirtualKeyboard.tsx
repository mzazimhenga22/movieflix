import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TvFocusable } from './TvSpatialNavigation';

type KeyDef = {
  id: string;
  label: string;
  value: string;
  flex?: number;
};

export type TvKeyboardMode = 'default' | 'email';

type Props = {
  onKeyPress: (value: string) => void;
  mode?: TvKeyboardMode;
  disabled?: boolean;
};

type GradientTextProps = {
  children: string;
  colors: readonly [string, string];
};

function GradientText({ children, colors }: GradientTextProps) {
  return (
    <MaskedView maskElement={<Text style={[styles.keyText, styles.keyTextMask]}>{children}</Text>}>
      <LinearGradient colors={colors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[styles.keyText, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const buildRows = (mode: TvKeyboardMode): KeyDef[][] => {
  // QWERTY layout like phone keyboard
  const base: KeyDef[][] = [
    '1234567890'.split('').map((c) => ({ id: c, label: c, value: c })),
    'QWERTYUIOP'.split('').map((c) => ({ id: c, label: c, value: c })),
    'ASDFGHJKL'.split('').map((c) => ({ id: c, label: c, value: c })),
    'ZXCVBNM'.split('').map((c) => ({ id: c, label: c, value: c })),
  ];

  // Add symbols to the Z row
  const symbols: KeyDef[] =
    mode === 'email'
      ? [
        { id: '@', label: '@', value: '@' },
        { id: '.', label: '.', value: '.' },
        { id: '_', label: '_', value: '_' },
      ]
      : [
        { id: '.', label: '.', value: '.' },
        { id: ',', label: ',', value: ',' },
        { id: "'", label: "'", value: "'" },
      ];

  base[3] = [...base[3], ...symbols];

  base.push([
    { id: 'space', label: 'Space', value: ' ', flex: 4 },
    { id: 'del', label: 'Delete', value: 'DEL', flex: 2 },
    { id: 'clear', label: 'Clear', value: 'CLEAR', flex: 2 },
  ]);

  return base;
};

export default function TvVirtualKeyboard({ onKeyPress, mode = 'default', disabled }: Props) {
  const rows = useMemo(() => buildRows(mode), [mode]);
  const textGradientFocused: [string, string] = ['#ff4d5a', '#e50914'];
  const textGradientDefault: [string, string] = ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.70)'];

  return (
    <View style={styles.wrap}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row} focusable={false}>
          {row.map((key) => (
            <TvFocusable
              key={key.id}
              disabled={disabled}
              isTVSelectable={true}
              tvParallaxProperties={{ enabled: false }}
              accessibilityLabel={key.label}
              onPress={() => onKeyPress(key.value)}
              style={({ focused }: any) => [
                styles.key,
                key.flex ? { flex: key.flex } : null,
                focused ? styles.keyFocused : null,
                disabled ? styles.keyDisabled : null,
              ]}
            >
              {({ focused }: any) => (
                <GradientText colors={focused ? textGradientFocused : textGradientDefault}>{key.label}</GradientText>
              )}
            </TvFocusable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  key: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  keyFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(229,9,20,0.32)',
  },
  keyDisabled: {
    opacity: 0.55,
  },
  keyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  keyTextMask: {
    backgroundColor: 'transparent',
    color: '#000',
  },
});
