import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';

import { firestore } from '../constants/firebase';

export type PlanTier = 'free' | 'plus' | 'premium';

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  plus: 1,
  premium: 2,
};

export const normalizeReferralCode = (raw: unknown): string =>
  String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();

const generateReferralCode = (): string => {
  // 8 chars, no confusing characters removed (keep simple + predictable).
  return Math.random().toString(36).slice(2, 10).toUpperCase();
};

export const ensureUserReferralCode = async (uid: string): Promise<string | null> => {
  if (!uid) return null;
  const userRef = doc(firestore, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    const existing = normalizeReferralCode((snap.data() as any)?.referralCode);
    if (existing) return existing;
  } catch {
    // ignore
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const codeRef = doc(firestore, 'referralCodes', code);

    try {
      await runTransaction(firestore, async (tx: Transaction) => {
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists()) throw new Error('REFERRAL_CODE_COLLISION');

        tx.set(codeRef, { uid, createdAt: serverTimestamp() }, { merge: true });
        tx.set(userRef, { referralCode: code }, { merge: true });
      });
      return code;
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('COLLISION')) continue;
      // transient or permission error
      return null;
    }
  }

  return null;
};

export const applyReferralCodeOnSignup = async (args: {
  newUid: string;
  referralCode: string;
}): Promise<{ applied: boolean; referrerUid?: string; nextReferrerPlan?: PlanTier } | { applied: false }> => {
  const newUid = String(args.newUid || '');
  const code = normalizeReferralCode(args.referralCode);
  if (!newUid || !code) return { applied: false };

  const codeRef = doc(firestore, 'referralCodes', code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) return { applied: false };

  const referrerUid = String((codeSnap.data() as any)?.uid ?? '');
  if (!referrerUid || referrerUid === newUid) return { applied: false };

  const newUserRef = doc(firestore, 'users', newUid);
  const referrerRef = doc(firestore, 'users', referrerUid);

  let resolvedNextPlan: PlanTier | undefined;
  let didApply = false;

  await runTransaction(firestore, async (tx: Transaction) => {
    const newUserSnap = await tx.get(newUserRef);
    const newUserData = (newUserSnap.data() as any) ?? {};
    if (newUserData?.referredByUid) return;

    const referrerSnap = await tx.get(referrerRef);
    const refData = (referrerSnap.data() as any) ?? {};

    const currentCount = Math.max(0, Number(refData?.referralsCount ?? 0));
    const nextCount = currentCount + 1;

    const currentTierRaw = String(refData?.planTier ?? refData?.subscription?.tier ?? 'free').toLowerCase().trim();
    const currentTier: PlanTier =
      currentTierRaw === 'premium' || currentTierRaw === 'plus' || currentTierRaw === 'free'
        ? (currentTierRaw as PlanTier)
        : 'free';

    const targetTier: PlanTier | null = nextCount >= 10 ? 'premium' : nextCount >= 5 ? 'plus' : null;
    const shouldUpgrade =
      targetTier !== null && PLAN_RANK[targetTier] > PLAN_RANK[currentTier];

    tx.set(
      newUserRef,
      {
        referredByUid: referrerUid,
        referredByCode: code,
        referredAt: serverTimestamp(),
      },
      { merge: true },
    );

    didApply = true;

    tx.set(
      referrerRef,
      {
        referralsCount: nextCount,
        ...(shouldUpgrade
          ? {
              planTier: targetTier,
              subscription: {
                tier: targetTier,
                updatedAt: serverTimestamp(),
                source: 'referral',
              },
            }
          : null),
      },
      { merge: true },
    );

    if (shouldUpgrade && targetTier) resolvedNextPlan = targetTier;
  });

  if (!didApply) return { applied: false };
  return { applied: true, referrerUid, nextReferrerPlan: resolvedNextPlan };
};
