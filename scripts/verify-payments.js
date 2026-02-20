const admin = require('firebase-admin');
const serviceAccount = require('../movieflixreactnative-firebase-adminsdk-fbsvc-a114aa19f0.json');

if (!serviceAccount) {
    console.error('Please place your service-account.json in the parent directory or update the path.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listPendingReceipts() {
    console.log('Fetching pending receipts...');
    const snapshot = await db.collection('payment_receipts')
        .where('status', 'in', ['submitted', 'pending_verification'])
        .limit(20)
        .get();

    if (snapshot.empty) {
        console.log('No pending receipts found.');
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`[${doc.id}] Code: ${data.receiptCode}, User: ${data.userId}, Status: ${data.status}`);
    });
}

async function forceConfirm(receiptId) {
    if (!receiptId) return;
    console.log(`Force confirming receipt ${receiptId}...`);

    try {
        const receiptRef = db.collection('payment_receipts').doc(receiptId);
        const docSnap = await receiptRef.get();

        if (!docSnap.exists) {
            console.error('Receipt not found');
            return;
        }

        const data = docSnap.data();
        if (!data.userId) {
            console.error('Receipt has no userId');
            return;
        }

        const batch = db.batch();

        // Update receipt
        batch.update(receiptRef, {
            status: 'confirmed',
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            method: 'script_force_fix'
        });

        // 30 days from now
        const now = new Date();
        now.setDate(now.getDate() + 30);

        // Update user
        const userRef = db.collection('users').doc(data.userId);
        batch.update(userRef, {
            planTier: data.tier || 'premium',
            'subscription.status': 'confirmed',
            'subscription.temporaryAccess': admin.firestore.FieldValue.delete(),
            'subscription.tier': data.tier || 'premium',
            'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
            'subscription.expiresAt': now,
            'subscription.source': 'script_force_fix'
        });

        await batch.commit();
        console.log('Successfully confirmed receipt and updated user subscription.');
    } catch (error) {
        console.error('Error confirming receipt:', error);
    }
}

async function forceReject(receiptId) {
    if (!receiptId) return;
    console.log(`Force REJECTING receipt ${receiptId}...`);

    try {
        const receiptRef = db.collection('payment_receipts').doc(receiptId);
        const docSnap = await receiptRef.get();

        if (!docSnap.exists) {
            console.error('Receipt not found');
            return;
        }

        const data = docSnap.data();
        if (!data.userId) {
            console.error('Receipt has no userId');
            return;
        }

        const batch = db.batch();

        // 1. Update receipt
        batch.update(receiptRef, {
            status: 'rejected',
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            method: 'script_force_reject'
        });

        // 2. Update user (Revoke access)
        const userRef = db.collection('users').doc(data.userId);
        batch.update(userRef, {
            planTier: 'free', // Revert to free on reject
            'subscription.status': 'rejected',
            'subscription.temporaryAccess': admin.firestore.FieldValue.delete(),
            'subscription.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
            'subscription.source': 'script_force_reject'
        });

        await batch.commit();
        console.log('Successfully REJECTED receipt and revoked user access.');
    } catch (error) {
        console.error('Error rejecting receipt:', error);
    }
}

// Simple CLI
const args = process.argv.slice(2);
const command = args[0];
const param = args[1];

if (command === 'list') {
    listPendingReceipts();
} else if (command === 'fix' && param) {
    forceConfirm(param);
} else if (command === 'reject' && param) {
    forceReject(param);
} else {
    console.log('Usage:');
    console.log('  node scripts/verify-payments.js list');
    console.log('  node scripts/verify-payments.js fix <RECEIPT_DOC_ID>');
    console.log('  node scripts/verify-payments.js reject <RECEIPT_DOC_ID>');
}
