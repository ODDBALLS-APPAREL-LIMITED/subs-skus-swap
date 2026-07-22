// Maps each Shopify product_type (as it appears on the actual products inside the
// monthly collection) to the fixed subscription product whose variant SKUs should
// be overwritten to match. This list also defines the full set of subscription
// products the changeover touches.
//
// productType: the exact `product_type` on the actual product in the collection.
// subscriptionProductId: the subscription product GID whose SKUs get updated.

export type SubscriptionMapping = {
  productType: string;
  subscriptionProductId: string;
  // Optional: when a product_type has more than one product in the collection,
  // this substring (case-insensitive) disambiguates which product's title to use.
  titleContains?: string;
};

// Dev store values — these will change in future.
// Note: "seamless" intentionally maps to two subscription products.
export const subscriptionMappings: SubscriptionMapping[] = [
  { productType: "goolies", subscriptionProductId: "gid://shopify/Product/10574541783306" },
  { productType: "Ladies Bamboo Boxers", subscriptionProductId: "gid://shopify/Product/10574535328010" },
  { productType: "Thong", subscriptionProductId: "gid://shopify/Product/10574535426314" },
  { productType: "Bamboo Boxer Shorts", subscriptionProductId: "gid://shopify/Product/10574535164170" },
  { productType: "Ladies Boxers", subscriptionProductId: "gid://shopify/Product/10574535393546" },
  { productType: "Low Rise Briefs", subscriptionProductId: "gid://shopify/Product/10574535491850" },
  { productType: "seamless", subscriptionProductId: "gid://shopify/Product/10574535524618", titleContains: "brazilian" },
  { productType: "girlies", subscriptionProductId: "gid://shopify/Product/10574541750538" },
  { productType: "Bralette", subscriptionProductId: "gid://shopify/Product/10574535295242" },
  { productType: "Boxer Shorts", subscriptionProductId: "gid://shopify/Product/10574535229706" },
  { productType: "Briefs", subscriptionProductId: "gid://shopify/Product/10574535196938" },
  { productType: "seamless", subscriptionProductId: "gid://shopify/Product/10574534574346", titleContains: "full" },
];
