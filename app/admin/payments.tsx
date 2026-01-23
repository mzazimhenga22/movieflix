import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { authPromise, firestore } from '../../constants/firebase';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';

type ReceiptType = 'plan' | 'marketplace' | 'promo_credits';
type ReceiptStatus = 'submitted' | 'confirmed' | 'rejected';

type PaymentReceipt = {
  receiptCode: string;
  type: ReceiptType;
  status: ReceiptStatus;
  userId?: string;
  tier?: string;
  amount?: number;
  currency?: string;
  orderDocId?: string;
  orderId?: string;
  submittedAt?: any;
  createdAt?: any;
};

const ADMIN_EMAIL = (process.env.EXPO_PUBLIC_PAYBILL_ADMIN_EMAIL ?? '').trim().toLowerCase();

export default function PaymentsAdminScreen(): React.ReactElement {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userById, setUserById] = useState<Record<string, { displayName?: string | null; email?: string | null }>>({});

  useEffect(() => {
    let alive = true;
    authPromise
      .then((auth) => {
        const email = String(auth.currentUser?.email ?? '').trim().toLowerCase();
        if (!alive) return;
        setAuthReady(true);
        setIsAdmin(Boolean(email) && email === ADMIN_EMAIL);
      })
      .catch(() => {
        if (!alive) return;
        setAuthReady(true);
        setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoadError(null);

    const receiptsRef = collection(firestore, 'payment_receipts');
    // NOTE: Avoid requiring a composite index (where + orderBy on different fields).
    // We load recent receipts and filter client-side for "submitted".
    const q = query(receiptsRef, orderBy('submittedAt', 'desc'), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: PaymentReceipt[] = [];
        snap.forEach((docSnap) => {
          const d = (docSnap.data() as DocumentData) || {};
          const status = String(d.status ?? 'submitted') as ReceiptStatus;
          // Keep only pending items (some older writers may use pending_verification).
          const statusLower = String(status).toLowerCase().trim();
          if (statusLower !== 'submitted' && statusLower !== 'pending_verification') return;

          next.push({
            receiptCode: String(d.receiptCode ?? docSnap.id),
            type: String(d.type ?? 'plan') as ReceiptType,
            status: statusLower === 'pending_verification' ? ('submitted' as ReceiptStatus) : (status as ReceiptStatus),
            userId: d.userId ? String(d.userId) : undefined,
            tier: d.tier ? String(d.tier) : undefined,
            amount: typeof d.amount === 'number' ? d.amount : undefined,
            currency: d.currency ? String(d.currency) : undefined,
            orderDocId: d.orderDocId ? String(d.orderDocId) : undefined,
            orderId: d.orderId ? String(d.orderId) : undefined,
            submittedAt: d.submittedAt,
            createdAt: d.createdAt,
          });
        });
        setReceipts(next);
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        setLoading(false);
        setReceipts([]);
        setLoadError(err?.message ? String(err.message) : 'Failed to load receipts.');
      },
    );

    return () => unsub();
  }, [authReady, isAdmin]);

  const supabaseBase = useMemo(
    () => (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, ''),
    [],
  );

  const supabaseAnonKey = useMemo(
    () => (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    [],
  );

  const firestoreIndexUrl = useMemo(() => {
    const msg = String(loadError ?? '');
    if (!msg) return null;

    // Firestore often includes a direct "create index" console link in the error.
    const matches = msg.match(/https?:\/\/[^\s)\]]+/g) ?? [];
    const consoleLink =
      matches.find((u) => u.includes('console.firebase.google.com') && u.includes('indexes')) ??
      matches.find((u) => u.includes('console.firebase.google.com')) ??
      null;
    return consoleLink;
  }, [loadError]);

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((r) => {
      const user = r.userId ? userById[r.userId] : undefined;
      const hay = [
        r.receiptCode,
        r.type,
        r.status,
        r.userId,
        user?.displayName ?? undefined,
        user?.email ?? undefined,
        r.tier,
        r.orderId,
        r.orderDocId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [receipts, search, userById]);

  useEffect(() => {
    const userIds = Array.from(new Set(receipts.map((r) => r.userId).filter(Boolean) as string[]));
    const missing = userIds.filter((uid) => !userById[uid]);
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.slice(0, 50).map(async (uid) => {
          try {
            const snap = await getDoc(doc(firestore, 'users', uid));
            const d = snap.exists() ? (snap.data() as any) : null;
            return [uid, { displayName: d?.displayName ?? null, email: d?.email ?? null }] as const;
          } catch {
            return [uid, { displayName: null, email: null }] as const;
          }
        }),
      );
      if (cancelled) return;
      setUserById((prev) => {
        const next = { ...prev };
        for (const [uid, info] of entries) next[uid] = info;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [receipts, userById]);

  const parseEdgeResponse = useCallback(async (res: Response, fallback: string) => {
    const raw = await res.text();
    const data = (() => {
      try {
        return raw ? (JSON.parse(raw) as any) : ({} as any);
      } catch {
        return { raw };
      }
    })();
    if (!res.ok) throw new Error(data?.error || data?.message || `${fallback} (HTTP ${res.status})`);
    return data;
  }, []);

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    if (!supabaseBase) return;
    if (!supabaseAnonKey) return;

    void (async () => {
      try {
        const auth = await authPromise;
        const user = auth.currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();
        await fetch(`${supabaseBase}/functions/v1/paybill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'x-firebase-authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action: 'admin_bootstrap' }),
        });
      } catch {
        // ignore
      }
    })();
  }, [authReady, isAdmin, supabaseAnonKey, supabaseBase]);

  const confirmReceipt = useCallback(
    async (receipt: PaymentReceipt) => {
      if (!supabaseBase) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL.');
        return;
      }
      if (!supabaseAnonKey) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_ANON_KEY.');
        return;
      }
      if (!receipt?.receiptCode) return;

      const action =
        receipt.type === 'marketplace'
          ? 'marketplace_admin_confirm_receipt'
          : receipt.type === 'promo_credits'
            ? 'promo_credits_admin_confirm_receipt'
            : 'plan_admin_confirm_receipt';

      try {
        setConfirming(receipt.receiptCode);

        const auth = await authPromise;
        const user = auth.currentUser;
        if (!user) {
          Alert.alert('Sign in required', 'Please sign in as admin.');
          return;
        }
        const idToken = await user.getIdToken();

        const res = await fetch(`${supabaseBase}/functions/v1/paybill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'x-firebase-authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action, receiptCode: receipt.receiptCode }),
        });

        await parseEdgeResponse(res, 'Failed to confirm receipt');
      } catch (err: any) {
        Alert.alert('Confirm failed', err?.message || 'Unable to confirm receipt right now.');
      } finally {
        setConfirming(null);
      }
    },
    [supabaseAnonKey, supabaseBase],
  );

  const rejectPlanReceipt = useCallback(
    async (receipt: PaymentReceipt) => {
      if (!supabaseBase) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_URL.');
        return;
      }
      if (!supabaseAnonKey) {
        Alert.alert('Supabase not configured', 'Set EXPO_PUBLIC_SUPABASE_ANON_KEY.');
        return;
      }
      if (!receipt?.receiptCode) return;
      if (receipt.type !== 'plan') {
        Alert.alert('Not supported', 'Reject is currently supported for plan receipts only.');
        return;
      }

      try {
        setConfirming(receipt.receiptCode);

        const auth = await authPromise;
        const user = auth.currentUser;
        if (!user) {
          Alert.alert('Sign in required', 'Please sign in as admin.');
          return;
        }
        const idToken = await user.getIdToken();

        const res = await fetch(`${supabaseBase}/functions/v1/paybill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'x-firebase-authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action: 'plan_admin_reject_receipt', receiptCode: receipt.receiptCode }),
        });

        await parseEdgeResponse(res, 'Failed to reject receipt');
      } catch (err: any) {
        Alert.alert('Reject failed', err?.message || 'Unable to reject receipt right now.');
      } finally {
        setConfirming(null);
      }
    },
    [parseEdgeResponse, supabaseAnonKey, supabaseBase],
  );

  if (!authReady) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.centerText}>Loading…</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!isAdmin) {
    return (
      <ScreenWrapper>
        <LinearGradient colors={['#e50914', '#150a13', '#05060f']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={42} color="#fff" />
          <Text style={styles.centerTitle}>Admin only</Text>
          <Text style={styles.centerText}>You don’t have access to Payments approvals.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <LinearGradient colors={['#e50914', '#150a13', '#05060f']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.page}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payments</Text>
          <View style={styles.headerIcon} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.centerText}>Loading pending receipts…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={44} color="#fff" />
            <Text style={styles.centerTitle}>Couldn’t load receipts</Text>
            <Text style={styles.centerText}>{loadError}</Text>
            <Text style={styles.centerText}>
              If this mentions an index, create it in Firebase Console. If it says permission denied, update Firestore rules
              to allow the admin to read `payment_receipts`.
            </Text>

            {firestoreIndexUrl ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  void Linking.openURL(firestoreIndexUrl).catch(() => {
                    Alert.alert('Open failed', 'Unable to open the Firebase Console link on this device.');
                  });
                }}
              >
                <Text style={styles.primaryBtnText}>Open index setup</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredReceipts}
            keyExtractor={(it) => `${it.type}:${it.receiptCode}`}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="checkmark-circle-outline" size={44} color="#fff" />
                <Text style={styles.centerTitle}>No pending receipts</Text>
                <Text style={styles.centerText}>New submissions will appear here.</Text>
              </View>
            }
            ListHeaderComponent={
              <View style={{ paddingTop: 6 }}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by receipt, user id, name, email, tier, order…"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  autoCapitalize="none"
                  style={styles.searchInput}
                />
              </View>
            }
            renderItem={({ item }) => {
              const busy = confirming === item.receiptCode;
              const user = item.userId ? userById[item.userId] : undefined;
              const subtitleParts = [
                item.type === 'plan' ? `Tier: ${item.tier ?? '—'}` : null,
                item.amount != null ? `${item.amount} ${item.currency ?? 'KES'}` : null,
                item.orderId ? `Order: ${item.orderId}` : null,
                item.userId
                  ? `User: ${user?.displayName || user?.email || item.userId}`
                  : null,
              ].filter(Boolean);

              return (
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                        {item.receiptCode}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={2} ellipsizeMode="tail">
                        {subtitleParts.join(' • ') || 'Pending verification'}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.type}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.confirmBtn, busy && { opacity: 0.6 }]}
                    onPress={() => confirmReceipt(item)}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.confirmText}>Confirm</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {item.type === 'plan' ? (
                    <TouchableOpacity
                      style={[styles.rejectBtn, busy && { opacity: 0.6 }]}
                      onPress={() => {
                        Alert.alert(
                          'Reject receipt',
                          `Rejecting will revoke temporary access for this user.\n\nReceipt: ${item.receiptCode}`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Reject', style: 'destructive', onPress: () => rejectPlanReceipt(item) },
                          ],
                        );
                      }}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="close" size={18} color="#fff" />
                          <Text style={styles.confirmText}>Reject</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    marginTop: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  searchInput: {
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    fontWeight: '700',
  },
  card: {
    marginTop: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  cardSub: { marginTop: 4, color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,138,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,0,0.35)',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  confirmBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#e50914',
  },
  rejectBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 10 },
  centerTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 6 },
  centerText: { color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  primaryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#e50914',
  },
  primaryBtnText: { color: '#fff', fontWeight: '900' },
});
