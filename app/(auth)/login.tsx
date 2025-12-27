import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { signInWithEmail } from '../messaging/controller';
import { authPromise } from '../../constants/firebase';
import ScreenWrapper from '../../components/ScreenWrapper';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // mark auth as ready once the initialization settles (success or failure).
    authPromise
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true));
  }, []);

  const handleLogin = async () => {
    if (!authReady) {
      Alert.alert('Please wait', 'Authentication is still initializing.');
      return;
    }

    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const user = await signInWithEmail(email.trim(), password);
      if (user) {
        router.replace('/select-profile');
      } else {
        Alert.alert('Error', 'Invalid email or password. Please try again.');
      }
    } catch (err: any) {
      console.error('login error', err);
      Alert.alert('Error', err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.page}>
        <View style={styles.card}>
          <Text style={styles.title}>Login</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            importantForAutofill="yes"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />

          <TouchableOpacity
            style={[styles.button, (!authReady || loading) && { opacity: 0.6 }]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={!authReady || loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Login'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/signup')}>
            <Text style={styles.link}>{`Don't have an account? Sign up`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 22,
    borderRadius: 14,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#e50914',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  link: {
    color: '#e50914',
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default LoginScreen;
