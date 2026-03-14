export type UsePromotedProductsOptions = {
  placement?: string;
  limit?: number;
};

// TV app is lightweight; promotions are disabled.
export function usePromotedProducts(_options?: UsePromotedProductsOptions) {
  return { products: [] as any[], hasAds: false };
}
