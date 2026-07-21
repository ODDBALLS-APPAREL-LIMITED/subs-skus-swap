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
};

export const subscriptionMappings: SubscriptionMapping[] = [
  // TODO: replace with real values, one entry per subscription type.
  // { productType: "Bamboo Boxer Shorts", subscriptionProductId: "gid://shopify/Product/0000000000000" },
  // { productType: "Briefs", subscriptionProductId: "gid://shopify/Product/0000000000000" },
];
