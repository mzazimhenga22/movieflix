import { createClient } from '@supabase/supabase-js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  limit,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import app from '../../../constants/firebase';

/* ----------------------------- SUPABASE SETUP ----------------------------- */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const MARKETPLACE_BUCKET = 'marketplace';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const db = getFirestore(app);

/* -------------------------- FILE UPLOAD HELPERS --------------------------- */

const uriToBlob = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error('Failed to convert file to blob'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

export const uploadFileToSupabase = async (
  fileUri: string,
  pathInBucket: string
): Promise<string> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing');
  }

  const fileExt = fileUri.split('.').pop() || 'jpg';
  const fileName = pathInBucket.split('/').pop() ?? `upload.${fileExt}`;

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: `image/${fileExt}`,
  } as any);

  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${MARKETPLACE_BUCKET}/${pathInBucket}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upload failed: ${err}`);
  }

  const { data } = supabase.storage
    .from(MARKETPLACE_BUCKET)
    .getPublicUrl(pathInBucket);

  return data.publicUrl;
};


/* ------------------------------- TYPES ----------------------------------- */

export enum ProductCategory {
  MERCHANDISE = 'Merchandise',
  COLLECTIBLES = 'Collectibles',
  FILM_SERVICES = 'Film & Creator Services',
  DIGITAL_GOODS = 'Digital Goods',
  CREATIVE_ASSETS = 'Creative Assets',
  ADVERTISING = 'Advertising Slots',
  LIFESTYLE = 'Lifestyle & General Products',
  EVENTS = 'Event & Experience Sales',
}

export enum ProductType {
  PHYSICAL = 'Physical',
  DIGITAL = 'Digital',
  SERVICE = 'Service',
  EVENT = 'Event',
}

export type PromotionPlacement = 'search' | 'story' | 'feed';

export type PromotionMetrics = {
  totalImpressions?: number;
  totalClicks?: number;
  byPlacement?: Partial<Record<PromotionPlacement, { impressions?: number; clicks?: number }>>;
  lastImpressionAt?: any;
  lastClickAt?: any;
};

export interface Product {
  id?: string;
  name: string;
  description: string;
  price: number;
  currency?: 'KES';
  imageUrl: string;
  mediaUrls?: string[];
  sellerId: string;
  sellerName: string;
  sellerContact?: string;
  sellerAvatar?: string | null;
  sellerProfileId?: string | null;
  category: string;
  categoryKey?: string;
  productType: ProductType;

  // Events & experiences
  eventKind?: 'theater_room' | 'party_room' | 'in_person';
  eventStartsAt?: string | null;
  eventVenue?: string | null;
  eventRoomCode?: string | null;

  promoted?: boolean;
  promotionBid?: number;
  promotionEndsAt?: any;
  promotionPlacement?: PromotionPlacement;
  promotionDurationUnit?: 'hours' | 'days';
  promotionDurationValue?: number;
  promotionCost?: number;
  promotionWeight?: number;
  promotionMetrics?: PromotionMetrics;
  createdAt: any;
}

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date ? d.getTime() : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};

export const isProductPromoted = (
  product: Product,
  placement?: PromotionPlacement
): boolean => {
  if (!product?.promoted) return false;
  if (placement && product.promotionPlacement && product.promotionPlacement !== placement) return false;
  const endsAtMs = toMillis((product as any).promotionEndsAt);
  if (typeof endsAtMs === 'number' && endsAtMs <= Date.now()) return false;
  return true;
};

export const trackPromotionImpression = async (args: {
  productId: string;
  placement: PromotionPlacement;
}): Promise<void> => {
  const productId = String(args.productId || '').trim();
  const placement = args.placement;
  if (!productId) return;
  await updateDoc(doc(db, 'marketplace_products', productId), {
    'promotionMetrics.totalImpressions': increment(1),
    [`promotionMetrics.byPlacement.${placement}.impressions`]: increment(1),
    'promotionMetrics.lastImpressionAt': serverTimestamp(),
  } as any);
};

export const trackPromotionClick = async (args: {
  productId: string;
  placement: PromotionPlacement;
}): Promise<void> => {
  const productId = String(args.productId || '').trim();
  const placement = args.placement;
  if (!productId) return;
  await updateDoc(doc(db, 'marketplace_products', productId), {
    'promotionMetrics.totalClicks': increment(1),
    [`promotionMetrics.byPlacement.${placement}.clicks`]: increment(1),
    'promotionMetrics.lastClickAt': serverTimestamp(),
  } as any);
};

export type SellerPaymentMethod = 'bank' | 'paypal' | 'momo';

export type SellerPaymentDetails = {
  sellerId: string;
  method: SellerPaymentMethod;
  accountName?: string | null;
  paypalEmail?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankRoutingNumber?: string | null;
  momoNetwork?: string | null;
  momoNumber?: string | null;
  country?: string | null;
  updatedAt?: any;
  createdAt?: any;
};

export type MarketplaceSeller = {
  id: string;
  name: string;
  contact?: string | null;
  avatar?: string | null;
  profileId?: string | null;
};

export type CreateMarketplaceListingInput = {
  name: string;
  description: string;
  price: number;
  categoryKey: string;
  categoryLabel?: string;
  productType?: ProductType;
  eventKind?: Product['eventKind'];
  eventStartsAt?: Product['eventStartsAt'];
  eventVenue?: Product['eventVenue'];
  eventRoomCode?: Product['eventRoomCode'];
  mediaUri?: string | null;
  fallbackImageUrl?: string | null;
  seller: MarketplaceSeller;
  sellerAvatar?: string | null;
  sellerContact?: string | null;
  sellerProfileId?: string | null;
};

export type MarketplaceCurrency = 'KES';

export type MarketplaceCartQuoteItem = {
  productId: string;
  quantity: number;
};

export type MarketplaceQuotedLine = {
  product: Product & { id: string };
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type MarketplaceCartQuote = {
  currency: MarketplaceCurrency;
  lines: MarketplaceQuotedLine[];
  subtotal: number;
  platformFee: number;
  total: number;
};

export type MarketplaceOrderStatus = 'pending_payment' | 'pending_verification' | 'paid' | 'cancelled';

export type MarketplaceOrderPayment =
  | {
      method: 'mpesa';
      checkoutRequestId: string;
      merchantRequestId?: string | null;
      phone: string;
      amount: number;
      status: 'initiated' | 'confirmed' | 'failed';
      confirmedAt?: any;
       resultCode?: string | number | null;
       resultDesc?: string | null;
      raw?: any;
    }
  | {
      method: 'mpesa_paybill';
      provider: string;
      paybill: string;
      account: string;
      receiptCode: string;
      amount: number;
      currency?: MarketplaceCurrency;
      status: 'pending_verification' | 'confirmed' | 'failed';
      submittedAt?: any;
      confirmedAt?: any;
      updatedAt?: any;
    }
  | {
      method: 'manual';
      note?: string | null;
    };

export type MarketplaceOrderWalletSummary = {
  currency: MarketplaceCurrency;
  total: number;
  platformFee: number;
  buyerDepositTxId: string;
  buyerDebitTxId: string;
  sellerTxIds: string[];
  platformFeeTxId?: string | null;
  sellerAllocations: { sellerId: string; sellerName?: string | null; amount: number }[];
  processedAt?: any;
};

export type MarketplaceOrderItem = {
  productId: string;
  name: string;
  imageUrl: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type MarketplaceOrder = {
  id?: string;
  orderId: string;
  buyerId: string;
  buyerProfileId?: string | null;
  currency: MarketplaceCurrency;
  items: MarketplaceOrderItem[];
  sellerIds?: string[];
  subtotal: number;
  platformFee: number;
  total: number;
  status: MarketplaceOrderStatus;
  payment?: MarketplaceOrderPayment | null;
  wallet?: MarketplaceOrderWalletSummary | null;
  createdAt: any;
  updatedAt: any;
};

export type MarketplaceTicketStatus = 'active' | 'redeemed' | 'refunded';

export type MarketplaceTicket = {
  id?: string;
  ticketId: string;
  orderDocId: string;
  orderId: string;
  buyerId: string;
  buyerProfileId?: string | null;
  sellerId: string;
  productId: string;
  productName: string;
  eventKind?: Product['eventKind'];
  eventStartsAt?: Product['eventStartsAt'];
  eventVenue?: Product['eventVenue'];
  eventRoomCode?: Product['eventRoomCode'];
  status: MarketplaceTicketStatus;
  createdAt: any;
  redeemedAt?: any;
  redeemedBy?: string | null;
};

/* --------------------------- PROMO CREDITS --------------------------- */

export type PromoCreditsAccount = {
  userId: string;
  availableCredits: number;
  lifetimeIn: number;
  lifetimeOut: number;
  createdAt?: any;
  updatedAt?: any;
};

const PROMO_CREDITS_ACCOUNTS_COLLECTION = 'promo_credits_accounts';

export const getPromoCreditsAccount = async (userId: string): Promise<PromoCreditsAccount> => {
  const uid = String(userId ?? '').trim();
  if (!uid) throw new Error('userId is required');
  const snap = await getDoc(doc(db, PROMO_CREDITS_ACCOUNTS_COLLECTION, uid));
  const base: PromoCreditsAccount = {
    userId: uid,
    availableCredits: 0,
    lifetimeIn: 0,
    lifetimeOut: 0,
  };
  return snap.exists() ? ({ ...base, ...(snap.data() as any) } as PromoCreditsAccount) : base;
};

/* ---------------------------- HELPERS ---------------------------- */

const inferExtension = (uri: string) => {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1] ?? 'jpg';
};

const buildStoragePath = (sellerId: string, uri: string) => {
  const ext = inferExtension(uri);
  return `products/${sellerId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;
};

const MARKETPLACE_ALLOWED_CATEGORY_KEYS = new Set([
  'merch',
  'digital',
  'services',
  'promos',
  'events',
  'lifestyle',
]);

const normalizeText = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, '').trim();

const normalizePriceKsh = (value: number) => {
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value);
};

const assertValidListingInput = (input: CreateMarketplaceListingInput) => {
  const name = normalizeText(input.name);
  const description = normalizeText(input.description);

  if (!name) throw new Error('Product title is required');
  if (name.length > 80) throw new Error('Product title is too long (max 80 characters)');
  if (!description) throw new Error('Product description is required');
  if (description.length > 2000) throw new Error('Product description is too long (max 2000 characters)');

  const categoryKey = String(input.categoryKey ?? '').trim();
  if (!MARKETPLACE_ALLOWED_CATEGORY_KEYS.has(categoryKey)) throw new Error('Invalid category');

  const price = normalizePriceKsh(Number(input.price));
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price');
  if (price < 10) throw new Error('Price is too low');
  if (price > 500_000) throw new Error('Price is too high');

  if (!input.seller?.id) throw new Error('Missing seller information');

  return {
    ...input,
    name,
    description,
    price,
    categoryKey,
  };
};

/* ------------------------- CREATE LISTING -------------------------- */

export const createMarketplaceListing = async (
  input: CreateMarketplaceListingInput
) => {
  const validated = assertValidListingInput(input);

  if (!validated.mediaUri && !validated.fallbackImageUrl) {
    throw new Error('A product image is required');
  }

  let imageUrl = validated.fallbackImageUrl ?? '';

  if (validated.mediaUri) {
    const path = buildStoragePath(validated.seller.id, validated.mediaUri);
    imageUrl = await uploadFileToSupabase(validated.mediaUri, path);
  }

  const payload: Omit<Product, 'id'> = {
    name: validated.name,
    description: validated.description,
    price: validated.price,
    currency: 'KES',
    imageUrl,
    mediaUrls: [imageUrl],
    sellerId: validated.seller.id,
    sellerName: validated.seller.name,
    sellerContact: validated.seller.contact ?? validated.sellerContact ?? undefined,
    sellerAvatar: validated.seller.avatar ?? validated.sellerAvatar ?? null,
    sellerProfileId: validated.seller.profileId ?? null,
    category: validated.categoryLabel || validated.categoryKey,
    categoryKey: validated.categoryKey,
    productType: validated.productType ?? ProductType.PHYSICAL,

    eventKind: validated.eventKind,
    eventStartsAt: validated.eventStartsAt ?? null,
    eventVenue: validated.eventVenue ?? null,
    eventRoomCode: validated.eventRoomCode ?? null,

    promoted: false,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'marketplace_products'), payload);
  return docRef.id;
};

/* ------------------------- FETCH / UPDATE -------------------------- */

export const getProducts = async (): Promise<Product[]> => {
  const snapshot = await getDocs(collection(db, 'marketplace_products'));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
};

export const getProductsBySellerId = async (sellerId: string): Promise<Product[]> => {
  const normalized = String(sellerId ?? '').trim();
  if (!normalized) return [];

  const q = query(collection(db, 'marketplace_products'), where('sellerId', '==', normalized));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
};

export const getProductById = async (id: string): Promise<Product | null> => {
  const snap = await getDoc(doc(db, 'marketplace_products', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Product) : null;
};

export const updateProduct = async (
  id: string,
  updates: Partial<Product>
): Promise<void> => {
  await updateDoc(doc(db, 'marketplace_products', id), updates);
};

/* ----------------------------- CART QUOTE ----------------------------- */

const COMMISSION_RATE = 0.05;

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(value)));

export const quoteMarketplaceCart = async (args: {
  items: MarketplaceCartQuoteItem[];
  buyerId?: string | null;
}): Promise<MarketplaceCartQuote> => {
  const buyerId = args.buyerId ?? null;
  const rawItems = Array.isArray(args.items) ? args.items : [];

  if (rawItems.length === 0) throw new Error('Cart is empty');
  if (rawItems.length > 25) throw new Error('Cart has too many items');

  const seen = new Set<string>();
  const normalized = rawItems
    .map((i) => ({
      productId: String(i?.productId ?? '').trim(),
      quantity: clampInt(Number((i as any)?.quantity ?? 0), 1, 10),
    }))
    .filter((i) => i.productId && !seen.has(i.productId) && (seen.add(i.productId), true));

  const lines: MarketplaceQuotedLine[] = [];
  for (const item of normalized) {
    const product = await getProductById(item.productId);
    if (!product?.id) throw new Error('One or more items are no longer available');

    if (buyerId && product.sellerId && product.sellerId === buyerId) {
      throw new Error('You cannot purchase your own listing');
    }

    const unitPrice = normalizePriceKsh(Number(product.price));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('Invalid product price');

    lines.push({
      product: product as Product & { id: string },
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const platformFee = Math.round(subtotal * COMMISSION_RATE);
  const total = subtotal + platformFee;

  if (total > 1_000_000) throw new Error('Cart total is too high');

  return {
    currency: 'KES',
    lines,
    subtotal,
    platformFee,
    total,
  };
};

/* ------------------------------- ORDERS ------------------------------- */

const ORDERS_COLLECTION = 'marketplace_orders';

export const createMarketplaceOrder = async (args: {
  buyerId: string;
  buyerProfileId?: string | null;
  quote: MarketplaceCartQuote;
  orderId?: string;
}): Promise<{ docId: string; orderId: string }> => {
  const buyerId = String(args.buyerId ?? '').trim();
  if (!buyerId) throw new Error('buyerId is required');

  const orderId =
    (String(args.orderId ?? '').trim() || `MFMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`).slice(
      0,
      48
    );

  const items: MarketplaceOrderItem[] = args.quote.lines.map((l) => ({
    productId: l.product.id!,
    name: l.product.name,
    imageUrl: l.product.imageUrl,
    sellerId: l.product.sellerId,
    sellerName: l.product.sellerName,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
  }));

  const sellerIds = Array.from(
    new Set(items.map((i) => String(i.sellerId || '').trim()).filter(Boolean))
  );

  const payload: Omit<MarketplaceOrder, 'id'> = {
    orderId,
    buyerId,
    buyerProfileId: args.buyerProfileId ?? null,
    currency: 'KES',
    items,
    sellerIds,
    subtotal: args.quote.subtotal,
    platformFee: args.quote.platformFee,
    total: args.quote.total,
    status: 'pending_payment',
    payment: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, ORDERS_COLLECTION), payload as any);
  return { docId: ref.id, orderId };
};

export const updateMarketplaceOrder = async (docId: string, updates: Partial<MarketplaceOrder>) => {
  if (!docId) throw new Error('docId is required');
  await updateDoc(doc(db, ORDERS_COLLECTION, docId), {
    ...updates,
    updatedAt: serverTimestamp(),
  } as any);
};

export const getOrdersForBuyer = async (buyerId: string): Promise<MarketplaceOrder[]> => {
  const normalized = String(buyerId ?? '').trim();
  if (!normalized) return [];
  const q = query(collection(db, ORDERS_COLLECTION), where('buyerId', '==', normalized));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceOrder));
};

export const getOrdersForSeller = async (sellerId: string): Promise<MarketplaceOrder[]> => {
  const normalized = String(sellerId ?? '').trim();
  if (!normalized) return [];
  const q = query(collection(db, ORDERS_COLLECTION), where('sellerIds', 'array-contains', normalized));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceOrder));
};

export const getMarketplaceOrderByDocId = async (docId: string): Promise<MarketplaceOrder | null> => {
  const normalized = String(docId ?? '').trim();
  if (!normalized) return null;
  const snap = await getDoc(doc(db, ORDERS_COLLECTION, normalized));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as MarketplaceOrder) : null;
};

const TICKETS_COLLECTION = 'marketplace_tickets';

export const createTicketsForPaidOrder = async (args: {
  orderDocId: string;
  orderId: string;
  buyerId: string;
  buyerProfileId?: string | null;
  quote: MarketplaceCartQuote;
}): Promise<{ ticketIds: string[] }> => {
  const orderDocId = String(args.orderDocId ?? '').trim();
  const orderId = String(args.orderId ?? '').trim();
  const buyerId = String(args.buyerId ?? '').trim();
  if (!orderDocId || !orderId || !buyerId) throw new Error('Missing ticket payload fields');

  const ticketIds: string[] = [];

  const eventLines = args.quote.lines.filter((l) => l.product.productType === ProductType.EVENT);
  for (const line of eventLines) {
    const qty = Math.max(1, Math.min(10, Math.floor(line.quantity)));

    for (let i = 0; i < qty; i += 1) {
      const ticketId = `MFTK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`.slice(
        0,
        48
      );

      const payload: Omit<MarketplaceTicket, 'id'> = {
        ticketId,
        orderDocId,
        orderId,
        buyerId,
        buyerProfileId: args.buyerProfileId ?? null,
        sellerId: line.product.sellerId,
        productId: line.product.id,
        productName: line.product.name,
        eventKind: line.product.eventKind,
        eventStartsAt: line.product.eventStartsAt ?? null,
        eventVenue: line.product.eventVenue ?? null,
        eventRoomCode: line.product.eventRoomCode ?? null,
        status: 'active',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, TICKETS_COLLECTION), payload as any);
      ticketIds.push(ticketId);
    }
  }

  return { ticketIds };
};

export const getTicketsForBuyer = async (buyerId: string): Promise<MarketplaceTicket[]> => {
  const normalized = String(buyerId ?? '').trim();
  if (!normalized) return [];
  const q = query(collection(db, TICKETS_COLLECTION), where('buyerId', '==', normalized));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceTicket));
};

export const getTicketByTicketId = async (ticketId: string): Promise<MarketplaceTicket | null> => {
  const normalized = String(ticketId ?? '').trim();
  if (!normalized) return null;

  const q = query(
    collection(db, TICKETS_COLLECTION),
    where('ticketId', '==', normalized),
    limit(1)
  );
  const snapshot = await getDocs(q);
  const docSnap = snapshot.docs[0];
  if (!docSnap) return null;
  return { id: docSnap.id, ...(docSnap.data() as any) } as MarketplaceTicket;
};

export const redeemTicketByTicketId = async (args: {
  ticketId: string;
  redeemerId: string;
}): Promise<MarketplaceTicket> => {
  const ticketId = String(args.ticketId ?? '').trim();
  const redeemerId = String(args.redeemerId ?? '').trim();
  if (!ticketId) throw new Error('Ticket code is required');
  if (!redeemerId) throw new Error('Sign in required');

  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket?.id) throw new Error('Ticket not found');
  if (ticket.status !== 'active') throw new Error(`Ticket is ${ticket.status}`);
  if (ticket.sellerId && ticket.sellerId !== redeemerId) throw new Error('This ticket belongs to a different seller');

  await updateDoc(doc(db, TICKETS_COLLECTION, ticket.id), {
    status: 'redeemed',
    redeemedAt: serverTimestamp(),
    redeemedBy: redeemerId,
  } as any);

  return {
    ...ticket,
    status: 'redeemed',
    redeemedBy: redeemerId,
  };
};

/* ------------------------------ PAYMENTS ------------------------------ */

type PaybillMarketplaceSubmitResponse = {
  ok: true;
  alreadyPaid: boolean;
  orderId: string;
  status?: 'paid' | 'pending_verification' | string;
  autoConfirmed?: boolean;
};

type PaybillPromoCreditsSubmitResponse = {
  ok: true;
  receiptCode: string;
  amountKsh: number;
  credits: number;
};

type DarajaMarketplaceStkPushResponse = {
  ok: true;
  amount: number;
  uid: string;
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  customerMessage: string | null;
};

type DarajaMarketplaceQueryResponse = {
  ok: true;
  uid: string;
  checkoutRequestId: string;
  resultCode: string | number | null;
  resultDesc: string | null;
  order?: {
    id: string;
    orderId: string;
    status: MarketplaceOrderStatus;
  } | null;
  wallet?: MarketplaceOrderWalletSummary | null;
  raw: any;
};

const darajaFunctionUrl = () => {
  if (!supabaseUrl) throw new Error('Supabase env vars missing');
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/daraja`;
};

const paybillFunctionUrl = () => {
  if (!supabaseUrl) throw new Error('Supabase env vars missing');
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/paybill`;
};

export const marketplaceSubmitPaybillReceipt = async (args: {
  firebaseToken: string;
  orderDocId: string;
  receiptCode: string;
}): Promise<PaybillMarketplaceSubmitResponse> => {
  const res = await fetch(paybillFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_submit_receipt',
      orderDocId: args.orderDocId,
      receiptCode: args.receiptCode,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Payment receipt submission failed');
  return data as PaybillMarketplaceSubmitResponse;
};

export const promoCreditsSubmitPaybillReceipt = async (args: {
  firebaseToken: string;
  amountKsh: number;
  receiptCode: string;
}): Promise<PaybillPromoCreditsSubmitResponse> => {
  const res = await fetch(paybillFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'promo_credits_submit_receipt',
      amountKsh: args.amountKsh,
      receiptCode: args.receiptCode,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Promo credits receipt submission failed');
  return data as PaybillPromoCreditsSubmitResponse;
};

export const mpesaMarketplaceStkPush = async (args: {
  firebaseToken: string;
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}): Promise<DarajaMarketplaceStkPushResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_stkpush',
      phone: args.phone,
      amount: args.amount,
      accountReference: args.accountReference,
      transactionDesc: args.transactionDesc,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Payment request failed');
  return data as DarajaMarketplaceStkPushResponse;
};

export const mpesaMarketplaceQuery = async (args: {
  firebaseToken: string;
  checkoutRequestId: string;
  orderDocId: string;
}): Promise<DarajaMarketplaceQueryResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_query',
      checkoutRequestId: args.checkoutRequestId,
      orderDocId: args.orderDocId,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Payment verification failed');
  return data as DarajaMarketplaceQueryResponse;
};

type DarajaPromoCreditsStkPushResponse = {
  ok: true;
  uid: string;
  topupDocId: string;
  phone: string;
  amount: number;
  credits: number;
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  customerMessage: string | null;
};

type DarajaPromoCreditsQueryResponse = {
  ok: true;
  uid: string;
  topupDocId: string;
  checkoutRequestId: string;
  status: 'confirmed' | 'failed';
  resultCode: string | number | null;
  resultDesc: string | null;
  availableCredits?: number | null;
  raw: any;
};

export const mpesaPromoCreditsStkPush = async (args: {
  firebaseToken: string;
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}): Promise<DarajaPromoCreditsStkPushResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'promo_credits_stkpush',
      phone: args.phone,
      amount: args.amount,
      accountReference: args.accountReference,
      transactionDesc: args.transactionDesc,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Credit top up failed');
  return data as DarajaPromoCreditsStkPushResponse;
};

export const mpesaPromoCreditsQuery = async (args: {
  firebaseToken: string;
  topupDocId: string;
}): Promise<DarajaPromoCreditsQueryResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'promo_credits_query',
      topupDocId: args.topupDocId,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Credit top up verification failed');
  return data as DarajaPromoCreditsQueryResponse;
};

type MarketplacePromoteCreditsResponse = {
  ok: true;
  uid: string;
  availableCredits: number;
  totalCredits: number;
  endsAt: string;
  transactionId: string;
};

export const marketplacePromoteWithCredits = async (args: {
  firebaseToken: string;
  productIds: string[];
  placement: PromotionPlacement;
  durationUnit: 'hours' | 'days';
  durationValue: number;
}): Promise<MarketplacePromoteCreditsResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_promote_credits',
      productIds: args.productIds,
      placement: args.placement,
      durationUnit: args.durationUnit,
      durationValue: args.durationValue,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Unable to start promotion');
  return data as MarketplacePromoteCreditsResponse;
};

export const marketplaceExtendPromotionWithCredits = async (args: {
  firebaseToken: string;
  productIds: string[];
  placement: PromotionPlacement;
  durationUnit: 'hours' | 'days';
  durationValue: number;
}): Promise<MarketplacePromoteCreditsResponse> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_extend_promo_credits',
      productIds: args.productIds,
      placement: args.placement,
      durationUnit: args.durationUnit,
      durationValue: args.durationValue,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Unable to extend promotion');
  return data as MarketplacePromoteCreditsResponse;
};

export const marketplaceCancelPromotion = async (args: {
  firebaseToken: string;
  productId: string;
}): Promise<{ ok: true; uid: string; productId: string }> => {
  const res = await fetch(darajaFunctionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'marketplace_cancel_promo',
      productId: args.productId,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || 'Unable to cancel promotion');
  return data as { ok: true; uid: string; productId: string };
};

/* ------------------------------- REPORTS ------------------------------ */

const REPORTS_COLLECTION = 'marketplace_reports';

export const reportMarketplaceProduct = async (args: {
  productId: string;
  reporterId: string;
  reporterProfileId?: string | null;
  reason: string;
}) => {
  const productId = String(args.productId ?? '').trim();
  const reporterId = String(args.reporterId ?? '').trim();
  const reason = normalizeText(String(args.reason ?? '')).slice(0, 800);

  if (!productId) throw new Error('productId is required');
  if (!reporterId) throw new Error('Sign in required');
  if (!reason) throw new Error('Please enter a reason');

  await addDoc(collection(db, REPORTS_COLLECTION), {
    productId,
    reporterId,
    reporterProfileId: args.reporterProfileId ?? null,
    reason,
    createdAt: serverTimestamp(),
  });
};

/* ---------------------- SELLER PAYOUT DETAILS ---------------------- */

const SELLER_PAYOUT_COLLECTION = 'marketplace_seller_payment_details';

export const upsertSellerPaymentDetails = async (
  sellerId: string,
  details: Omit<SellerPaymentDetails, 'sellerId' | 'updatedAt' | 'createdAt'>
): Promise<void> => {
  if (!sellerId) throw new Error('sellerId is required');

  const ref = doc(db, SELLER_PAYOUT_COLLECTION, sellerId);
  const existing = await getDoc(ref);

  await setDoc(
    ref,
    {
      sellerId,
      ...details,
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? null : { createdAt: serverTimestamp() }),
    } as any,
    { merge: true }
  );
};

export const getSellerPaymentDetails = async (
  sellerId: string
): Promise<SellerPaymentDetails | null> => {
  if (!sellerId) return null;
  const snap = await getDoc(doc(db, SELLER_PAYOUT_COLLECTION, sellerId));
  return snap.exists() ? ({ sellerId: snap.id, ...snap.data() } as SellerPaymentDetails) : null;
};
