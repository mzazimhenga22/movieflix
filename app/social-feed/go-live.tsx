import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { User } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaDevices, RTCView } from 'react-native-webrtc';
import { useAccent } from '../../components/app-components/AccentContext';
import { onAuthChange } from '../messaging/controller';
import LiquidGlass from '../../components/app-components/LiquidGlass';

const { width, height: screenHeight } = Dimensions.get('window');

const GoLiveScreen = () => {
  const router = useRouter();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('Movie night with friends');
  const [coverUrl, setCoverUrl] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewStream, setPreviewStream] = useState<any>(null);
  const [cameraFront, setCameraFront] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  const startPreview = useCallback(async () => {
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: cameraFront ? 'user' : 'environment' },
      });
      setPreviewStream(stream);
      setPreviewMode(true);
    } catch (err) { Alert.alert('Camera Error', 'Unable to access camera'); }
  }, [cameraFront]);

  const switchCamera = useCallback(async () => {
    if (previewStream) previewStream.getTracks().forEach((track: any) => track.stop());
    setCameraFront(!cameraFront);
    setTimeout(() => startPreview(), 100);
  }, [previewStream, cameraFront, startPreview]);

  const stopPreview = useCallback(() => {
    if (previewStream) previewStream.getTracks().forEach((track: any) => track.stop());
    setPreviewStream(null);
    setPreviewMode(false);
  }, [previewStream]);

  const handleContinueToLive = useCallback(async () => {
    if (!user?.uid) { Alert.alert('Sign in required'); return; }
    if (previewStream) previewStream.getTracks().forEach((track: any) => track.stop());
    setPreviewStream(null);
    setPreviewMode(false);
    await new Promise((r) => setTimeout(r, 300));
    router.push({
      pathname: '/social-feed/live/host',
      params: { title: title.trim() || 'Live on MovieFlix', coverUrl: coverUrl.trim() || '', cameraFront: cameraFront ? '1' : '0' },
    } as any);
  }, [cameraFront, coverUrl, previewStream, router, title, user?.uid]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a0f1f', '#050509']} style={StyleSheet.absoluteFill} />
      
      <View style={[styles.safeArea, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Broadcast</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={[styles.previewWrapper, { height: screenHeight * 0.45 }]}>
            <LiquidGlass cornerRadius={32} tintOpacity={0.1} style={styles.previewGlass}>
                {previewMode && previewStream ? (
                    <RTCView streamURL={previewStream.toURL()} style={styles.preview} objectFit="cover" />
                ) : (
                    <View style={styles.previewPlaceholder}>
                        <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.2)" />
                        <Text style={styles.previewHint}>Tap to start preview</Text>
                    </View>
                )}
            </LiquidGlass>
        </View>

        <View style={styles.form}>
            <LiquidGlass cornerRadius={24} tintOpacity={0.05} style={styles.inputGlass}>
                <Text style={styles.label}>LIVE TITLE</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="What's happening?" placeholderTextColor="rgba(255,255,255,0.3)" style={styles.input} />
            </LiquidGlass>
            
            <LiquidGlass cornerRadius={24} tintOpacity={0.05} style={styles.inputGlass}>
                <Text style={styles.label}>THUMBNAIL URL</Text>
                <TextInput value={coverUrl} onChangeText={setCoverUrl} placeholder="Optional cover image" placeholderTextColor="rgba(255,255,255,0.3)" style={styles.input} />
            </LiquidGlass>
        </View>

        <View style={styles.footer}>
            {!previewMode ? (
                <TouchableOpacity style={styles.mainBtn} onPress={startPreview}>
                    <LiquidGlass cornerRadius={20} tintOpacity={0.2} tintColor={accent} glowColor={accent} glowIntensity={0.3} style={styles.mainBtnGlass}>
                        <Ionicons name="videocam" size={22} color="#fff" />
                        <Text style={styles.mainBtnText}>Enable Camera</Text>
                    </LiquidGlass>
                </TouchableOpacity>
            ) : (
                <View style={styles.controlRow}>
                    <TouchableOpacity style={styles.subBtn} onPress={switchCamera}>
                        <LiquidGlass cornerRadius={20} tintOpacity={0.1} style={styles.subBtnGlass}>
                            <Ionicons name="camera-reverse" size={24} color="#fff" />
                        </LiquidGlass>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.startBtn} onPress={handleContinueToLive}>
                        <LiquidGlass cornerRadius={20} tintOpacity={0.3} tintColor="#0ecb7a" glowColor="#0ecb7a" glowIntensity={0.4} style={styles.startBtnGlass}>
                            <Text style={styles.startBtnText}>GO LIVE</Text>
                        </LiquidGlass>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.subBtn} onPress={stopPreview}>
                        <LiquidGlass cornerRadius={20} tintOpacity={0.1} style={styles.subBtnGlass}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </LiquidGlass>
                    </TouchableOpacity>
                </View>
            )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  previewWrapper: { marginBottom: 30 },
  previewGlass: { flex: 1, overflow: 'hidden' },
  preview: { flex: 1 },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  previewHint: { color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
  form: { gap: 15 },
  inputGlass: { padding: 16 },
  label: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  input: { color: '#fff', fontSize: 16, fontWeight: '600', padding: 0 },
  footer: { marginTop: 'auto', paddingBottom: 20 },
  mainBtn: { height: 64 },
  mainBtnGlass: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  mainBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  subBtn: { width: 64, height: 64 },
  subBtnGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startBtn: { flex: 1, height: 64 },
  startBtnGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});

export default GoLiveScreen;
