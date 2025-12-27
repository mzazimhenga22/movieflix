import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, StatusBar, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useAccent } from '../components/AccentContext';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { useUser } from '../../hooks/use-user';
import { useActiveProfile } from '../../hooks/use-active-profile';
import {
  createMarketplaceListing,
  getSellerPaymentDetails,
  upsertSellerPaymentDetails,
  type SellerPaymentMethod,
  ProductCategory,
  ProductType,
} from './api';

export default function SellScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { currentPlan } = useSubscription();
  const { user } = useUser();
  const activeProfile = useActiveProfile();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: 'merch',
  });
  const [mediaAsset, setMediaAsset] = useState<{ uri: string; name?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);

  const [payoutMethod, setPayoutMethod] = useState<SellerPaymentMethod>('momo');
  const [payoutForm, setPayoutForm] = useState({
    accountName: '',
    paypalEmail: '',
    bankName: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
    momoNetwork: 'Safaricom',
    momoNumber: '',
    country: '',
  });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);

  const payoutOptions: Array<{
    key: SellerPaymentMethod;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    comingSoon?: boolean;
  }> = [
    { key: 'momo', label: 'M-Pesa', icon: 'phone-portrait' },
    { key: 'paypal', label: 'PayPal', icon: 'logo-paypal', comingSoon: true },
    { key: 'bank', label: 'Bank', icon: 'card', comingSoon: true },
  ];

  const handleSelectPayoutMethod = (option: (typeof payoutOptions)[number]) => {
    if (option.comingSoon) {
      Alert.alert('Coming soon', `${option.label} payouts are coming soon. Right now we support secure M-Pesa withdrawals.`);
      return;
    }
    setPayoutMethod(option.key);
  };

  useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user?.uid) {
        setPayoutForm((prev) => ({ ...prev, paypalEmail: prev.paypalEmail || user?.email || '' }));
        return;
      }

      setPayoutLoading(true);
      try {
        const details = await getSellerPaymentDetails(user.uid);
        if (cancelled) return;
        if (details?.method) setPayoutMethod(details.method);
        setPayoutForm({
          accountName: details?.accountName || '',
          paypalEmail: details?.paypalEmail || user.email || '',
          bankName: details?.bankName || '',
          bankAccountNumber: details?.bankAccountNumber || '',
          bankRoutingNumber: details?.bankRoutingNumber || '',
          momoNetwork: details?.momoNetwork || 'Safaricom',
          momoNumber: details?.momoNumber || '',
          country: details?.country || '',
        });
      } catch (err) {
        console.warn('[marketplace] failed to load payout details', err);
      } finally {
        if (!cancelled) setPayoutLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email]);

  const savePayoutDetails = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to save payout details.');
      router.push('/profile');
      return;
    }

    const accountName = payoutForm.accountName.trim();
    const paypalEmail = payoutForm.paypalEmail.trim();
    const bankName = payoutForm.bankName.trim();
    const bankAccountNumber = payoutForm.bankAccountNumber.trim();
    const bankRoutingNumber = payoutForm.bankRoutingNumber.trim();
    const momoNetwork = payoutForm.momoNetwork.trim();
    const momoNumber = payoutForm.momoNumber.trim();
    const country = payoutForm.country.trim();

    if (payoutMethod === 'paypal' && !paypalEmail) {
      Alert.alert('Missing info', 'Please enter your PayPal email.');
      return;
    }
    if (payoutMethod === 'bank' && (!bankName || !bankAccountNumber)) {
      Alert.alert('Missing info', 'Please enter your bank name and account number.');
      return;
    }
    if (payoutMethod === 'momo' && (!momoNetwork || !momoNumber)) {
      Alert.alert('Missing info', 'Please enter your mobile money network and number.');
      return;
    }

    setPayoutSaving(true);
    try {
      await upsertSellerPaymentDetails(user.uid, {
        method: payoutMethod,
        accountName: accountName || null,
        paypalEmail: payoutMethod === 'paypal' ? paypalEmail : null,
        bankName: payoutMethod === 'bank' ? bankName : null,
        bankAccountNumber: payoutMethod === 'bank' ? bankAccountNumber : null,
        bankRoutingNumber: payoutMethod === 'bank' ? bankRoutingNumber || null : null,
        momoNetwork: payoutMethod === 'momo' ? momoNetwork : null,
        momoNumber: payoutMethod === 'momo' ? momoNumber : null,
        country: country || null,
      });
      Alert.alert('Saved', 'Your payout details were saved.');
    } catch (err: any) {
      console.error('[marketplace] save payout details failed', err);
      Alert.alert('Save failed', err?.message || 'Unable to save payout details right now.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const categoryLabels: Record<string, ProductCategory | string> = {
    merch: ProductCategory.MERCHANDISE,
    digital: ProductCategory.DIGITAL_GOODS,
    services: ProductCategory.FILM_SERVICES,
    promos: ProductCategory.ADVERTISING,
    events: ProductCategory.EVENTS,
    lifestyle: ProductCategory.LIFESTYLE,
  };

  const handlePickMedia = async () => {
    try {
      setPickerBusy(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Please enable photo library access to upload product media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        setMediaAsset({ uri: asset.uri, name: asset.fileName || asset.assetId });
      }
    } catch (err) {
      console.error('[marketplace] media picker failed', err);
      Alert.alert('Upload failed', 'Unable to access your media library right now.');
    } finally {
      setPickerBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.description.trim() || !formData.price.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!mediaAsset?.uri) {
      Alert.alert('Add product media', 'Please upload at least one product image.');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to list products in the marketplace.');
      router.push('/profile');
      return;
    }

    const priceValue = Math.round(Number(formData.price));
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid price in KSh.');
      return;
    }
    if (priceValue < 10) {
      Alert.alert('Invalid price', 'Price is too low.');
      return;
    }
    if (priceValue > 500000) {
      Alert.alert('Invalid price', 'Price is too high.');
      return;
    }

    setSubmitting(true);
    try {
      await createMarketplaceListing({
        name: formData.title.trim(),
        description: formData.description.trim(),
        price: priceValue,
        categoryKey: formData.category,
        categoryLabel: categoryLabels[formData.category] || formData.category,
        mediaUri: mediaAsset.uri,
        productType: ProductType.PHYSICAL,
        seller: {
          id: user.uid,
          name: activeProfile?.name || user.displayName || 'Creator',
          contact: user.email ?? null,
          avatar: activeProfile?.photoURL ?? user.photoURL ?? null,
          profileId: activeProfile?.id ?? null,
        },
      });

      Alert.alert('Success', 'Product listed successfully!');
      setFormData({ title: '', description: '', price: '', category: 'merch' });
      setMediaAsset(null);
      router.replace('/marketplace');
    } catch (err: any) {
      console.error('[marketplace] product listing failed', err);
      Alert.alert('Upload failed', err?.message || 'Unable to list product right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenWrapper>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
      <LinearGradient
        colors={['#e50914', '#150a13', '#05060f'] as const}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
        <View style={styles.container}>
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)'] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerCopy}>
                <View style={styles.titleRow}>
                  <View style={styles.accentDot} />
                  <Text style={styles.headerEyebrow}>Creator Hub</Text>
                </View>
                <Text style={styles.headerTitle}>Sell Product</Text>
                <Text style={styles.headerSubtitle}>Launch a new listing in minutes</Text>
              </View>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => router.push('/marketplace/promote')}
              >
                <Ionicons name="sparkles-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {currentPlan === 'free' && (
            <View style={styles.upgradeBanner}>
              <LinearGradient
                colors={['rgba(229,9,20,0.9)', 'rgba(185,7,16,0.9)'] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.upgradeBannerGradient}
              >
                <View style={styles.upgradeBannerContent}>
                  <Ionicons name="star" size={20} color="#fff" />
                  <View style={styles.upgradeBannerText}>
                    <Text style={styles.upgradeBannerTitle}>Upgrade to Plus</Text>
                    <Text style={styles.upgradeBannerSubtitle}>
                      Unlock unlimited profiles, premium features & more
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.upgradeBannerButton}
                    onPress={() => router.push('/premium?source=marketplace')}
                  >
                    <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.scrollViewContent}>
            <View style={styles.formContainer}>
              <Text style={styles.label}>Product Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter product title"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={formData.title}
                onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
              />

              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe your product"
                placeholderTextColor="rgba(255,255,255,0.5)"
                multiline
                numberOfLines={4}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
              />

              <Text style={styles.label}>Price (KSh) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 1500"
                placeholderTextColor="rgba(255,255,255,0.5)"
                keyboardType="numeric"
                value={formData.price}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, price: text.replace(/[^0-9]/g, '') }))}
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.pickerContainer}>
                {['merch', 'digital', 'services', 'promos', 'events', 'lifestyle'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryOption, formData.category === cat && styles.categoryOptionActive]}
                    onPress={() => setFormData(prev => ({ ...prev, category: cat }))}
                  >
                    <Text style={[styles.categoryText, formData.category === cat && styles.categoryTextActive]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Product Media *</Text>
              <View style={styles.mediaCard}>
                {mediaAsset ? (
                  <>
                    <Image source={{ uri: mediaAsset.uri }} style={styles.mediaPreview} />
                    <View style={styles.mediaActions}>
                      <Text style={styles.mediaFilename} numberOfLines={1}>
                        {mediaAsset.name || 'listing-media'}
                      </Text>
                      <View style={styles.mediaButtonsRow}>
                        <TouchableOpacity style={styles.mediaButton} onPress={handlePickMedia} disabled={pickerBusy}>
                          <Ionicons name="camera" size={16} color="#fff" />
                          <Text style={styles.mediaButtonText}>{pickerBusy ? 'Updating…' : 'Change'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.mediaButton, styles.mediaButtonGhost]} onPress={() => setMediaAsset(null)} disabled={pickerBusy}>
                          <Ionicons name="trash" size={16} color="#fff" />
                          <Text style={styles.mediaButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity style={styles.mediaPlaceholder} onPress={handlePickMedia} disabled={pickerBusy}>
                    {pickerBusy ? (
                      <ActivityIndicator color="#e50914" />
                    ) : (
                      <Ionicons name="cloud-upload" size={32} color="rgba(255,255,255,0.7)" />
                    )}
                    <Text style={styles.mediaPlaceholderText}>
                      {pickerBusy ? 'Preparing uploader…' : 'Tap to upload image'}
                    </Text>
                    <Text style={styles.mediaHint}>PNG or JPG, up to 10MB</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.submitButton, (submitting || pickerBusy) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting || pickerBusy}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>List Product</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>Payout details</Text>
                {payoutLoading && <ActivityIndicator color="#fff" />}
              </View>
              <Text style={styles.sectionSub}>Used to receive your earnings. Only you can edit these details.</Text>

              <Text style={styles.label}>Payment method</Text>
              <View style={styles.methodRow}>
                {payoutOptions.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.methodPill,
                      payoutMethod === option.key && !option.comingSoon && styles.methodPillActive,
                      option.comingSoon && styles.methodPillDisabled,
                    ]}
                    onPress={() => handleSelectPayoutMethod(option)}
                    disabled={payoutSaving}
                  >
                    <Ionicons name={option.icon} size={14} color="#fff" />
                    <View>
                      <Text style={styles.methodPillText}>{option.label}</Text>
                      {option.comingSoon && <Text style={styles.methodComingSoon}>Coming soon</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.methodNote}>We&apos;re starting with secure M-Pesa payouts. PayPal and bank transfers are rolling out soon.</Text>

              <Text style={styles.label}>Account name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., John Doe"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={payoutForm.accountName}
                onChangeText={(text) => setPayoutForm((p) => ({ ...p, accountName: text }))}
                editable={!payoutSaving}
              />

              {payoutMethod === 'paypal' && (
                <>
                  <Text style={styles.label}>PayPal email *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.paypalEmail}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, paypalEmail: text }))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!payoutSaving}
                  />
                </>
              )}

              {payoutMethod === 'bank' && (
                <>
                  <Text style={styles.label}>Bank name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Standard Bank"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.bankName}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, bankName: text }))}
                    editable={!payoutSaving}
                  />
                  <Text style={styles.label}>Account number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.bankAccountNumber}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, bankAccountNumber: text }))}
                    keyboardType="number-pad"
                    editable={!payoutSaving}
                  />
                  <Text style={styles.label}>Routing / SWIFT (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 021000021"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.bankRoutingNumber}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, bankRoutingNumber: text }))}
                    editable={!payoutSaving}
                  />
                </>
              )}

              {payoutMethod === 'momo' && (
                <>
                  <Text style={styles.label}>Network *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Safaricom"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.momoNetwork}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, momoNetwork: text }))}
                    editable={!payoutSaving}
                  />
                  <Text style={styles.label}>M-Pesa number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 07XX XXX XXX"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={payoutForm.momoNumber}
                    onChangeText={(text) => setPayoutForm((p) => ({ ...p, momoNumber: text }))}
                    keyboardType="phone-pad"
                    editable={!payoutSaving}
                  />
                </>
              )}

              <Text style={styles.label}>Country (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Zimbabwe"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={payoutForm.country}
                onChangeText={(text) => setPayoutForm((p) => ({ ...p, country: text }))}
                editable={!payoutSaving}
              />

              <TouchableOpacity
                style={[styles.submitButton, payoutSaving && styles.submitButtonDisabled]}
                onPress={savePayoutDetails}
                disabled={payoutSaving}
              >
                {payoutSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Save payout details</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -40,
    left: -60,
    opacity: 0.6,
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -80,
    right: -40,
    opacity: 0.55,
  },
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  headerWrap: {
    marginHorizontal: 16,
    marginTop: 48,
    marginBottom: 16,
    borderRadius: 22,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(8,10,20,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff8a00',
    shadowColor: '#ff8a00',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontSize: 13,
  },
  scrollViewContent: {
    paddingBottom: 180,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.72)',
    marginTop: 6,
    lineHeight: 18,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  methodPillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  methodPillDisabled: {
    opacity: 0.5,
  },
  methodPillText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  methodComingSoon: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  methodNote: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 8,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  categoryOptionActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  categoryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#fff',
  },
  mediaCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5,6,12,0.6)',
    padding: 12,
    marginTop: 12,
  },
  mediaPreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 12,
  },
  mediaActions: {
    gap: 8,
  },
  mediaFilename: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e50914',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 30,
  },
  mediaButtonGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mediaButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  mediaPlaceholder: {
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 8,
  },
  mediaPlaceholderText: {
    color: '#fff',
    fontWeight: '600',
  },
  mediaHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: '#e50914',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeBanner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeBannerGradient: {
    padding: 16,
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  upgradeBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeBannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeBannerButtonText: {
    color: '#e50914',
    fontWeight: '700',
    fontSize: 13,
  },
});
