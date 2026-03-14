import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { authPromise } from '../../constants/firebase';
import { signInWithEmail } from '../messaging/controller';

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.page}>
          <View style={styles.formContainer}>
            <Text style={styles.title}>Login</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.5)"
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
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: loading ? 'rgba(255,255,255,0.1)' : 'rgba(229, 9, 20, 0.8)' }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Authenticating...' : 'Login'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/signup')} style={styles.signupLinkContainer}>
              <Text style={styles.link}>{`Don't have an account? `}<Text style={styles.signupText}>Sign up</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  page: {
    flex: 1,
    // Removed black background, let ScreenWrapper shine through
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
    paddingTop: 40,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 40,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  input: {
    width: '100%',
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  button: {
    width: '100%',
    height: 60,
    marginTop: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  signupLinkContainer: {
    marginTop: 32,
  },
  link: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
  },
  signupText: {
    color: '#e50914',
    fontWeight: '800',
  },
});

export default LoginScreen;
