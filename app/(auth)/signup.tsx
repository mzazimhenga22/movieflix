import { router, useLocalSearchParams } from 'expo-router';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { authPromise, firestore } from '../../constants/firebase';
import { applyReferralCodeOnSignup, ensureUserReferralCode, normalizeReferralCode } from '../../lib/referrals';
import { signUpWithEmail } from '../messaging/controller';

const SignupScreen = () => {
  const { params } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    const fromLink = (params as any)?.ref;
    const normalized = normalizeReferralCode(fromLink);
    if (normalized) setReferralCode(normalized);
  }, [params]);

  const handleSignup = async () => {
    if (busy) return;
    if (!name || !email || !password || !confirmPassword) {
      return Alert.alert('Error', 'Please fill in all fields');
    }

    if (password !== confirmPassword) {
      return Alert.alert('Error', "Passwords don't match");
    }

    try {
      setBusy(true);
      const e = String(email || '').trim().toLowerCase();
      const user = await signUpWithEmail(e, password);
      if (user) {
        const auth = await authPromise;
        // ✅ Update user's display name in Firebase Auth
        await updateProfile(auth.currentUser!, { displayName: name });

        // ✅ Create user document in Firestore
        await setDoc(
          doc(firestore, 'users', user.uid),
          {
            displayName: name,
            email: e,
            planTier: 'free',
            createdAt: Date.now(),
          },
          { merge: true },
        );

        await ensureUserReferralCode(user.uid);

        const entered = normalizeReferralCode(referralCode);
        if (entered) {
          await applyReferralCodeOnSignup({ newUid: user.uid, referralCode: entered });
        }

        router.replace('/select-profile');
      } else {
        Alert.alert('Error', 'There was an issue signing up. Please try again.');
      }
    } catch (error: any) {
      console.error('Signup Error:', error);
      const code = String(error?.code || '');
      const message = (() => {
        if (code === 'auth/email-already-in-use') return 'That email is already in use. Try logging in instead.';
        if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
        if (code === 'auth/weak-password') return 'Password is too weak. Use at least 6 characters.';
        return error?.message || 'Something went wrong during signup.';
      })();
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.container}>
            <View style={styles.formContainer}>
              <Text style={styles.title}>Create Account</Text>

              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                textContentType="name"
              />

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
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

              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <TextInput
                style={styles.input}
                placeholder="Referral Code (optional)"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={referralCode}
                onChangeText={(v: string) => setReferralCode(normalizeReferralCode(v))}
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.button, { backgroundColor: busy ? 'rgba(255,255,255,0.1)' : 'rgba(229, 9, 20, 0.8)' }]}
                onPress={handleSignup}
                disabled={busy}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>
                  {busy ? 'Creating Account...' : 'Sign up'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/login')} style={styles.loginLinkContainer}>
                <Text style={styles.link}>Already have an account? <Text style={styles.loginText}>Login</Text></Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    // Removed black background!
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
    paddingTop: 30,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 32,
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
  loginLinkContainer: {
    marginTop: 32,
  },
  link: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 15,
  },
  loginText: {
    color: '#e50914',
    fontWeight: '800',
  },
});

export default SignupScreen;
