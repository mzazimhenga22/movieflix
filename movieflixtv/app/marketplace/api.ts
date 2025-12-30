export async function trackPromotionImpression(_input: {
  productId: string;
  placement?: string;
}): Promise<void> {
  // no-op on TV
}

export async function trackPromotionClick(_input: {
  productId: string;
  placement?: string;
}): Promise<void> {
  // no-op on TV
}
