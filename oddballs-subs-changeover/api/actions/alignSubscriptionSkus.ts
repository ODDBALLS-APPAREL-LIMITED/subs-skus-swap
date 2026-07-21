import { ActionOptions } from "gadget-server";

// The subscription product whose variant SKUs get overwritten. Hardcoded default
// for now; override with the productId param if needed.
const DEFAULT_TARGET_PRODUCT_ID = "gid://shopify/Product/10573881966858";

const SIZE_OPTION_NAME = "Size";

type VariantNode = {
  id: string;
  title: string;
  sku: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
};

type ProductVariantsResponse = {
  product: {
    variants: {
      nodes: VariantNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

type BulkUpdateResponse = {
  productVariantsBulkUpdate: {
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

type ShopifyClient = { graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown> };

const sizeOf = (variant: VariantNode) =>
  variant.selectedOptions.find((option) => option.name === SIZE_OPTION_NAME)?.value ?? null;

// Fetch every variant of a product, following pagination.
const loadVariants = async (shopify: ShopifyClient, productId: string): Promise<VariantNode[]> => {
  const variants: VariantNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = (await shopify.graphql(
      `query ProductVariants($id: ID!, $cursor: String) {
        product(id: $id) {
          variants(first: 100, after: $cursor) {
            nodes {
              id
              title
              sku
              selectedOptions { name value }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: productId, cursor }
    )) as ProductVariantsResponse;

    if (!result.product) {
      throw new Error(`Product not found in Shopify: ${productId}`);
    }

    variants.push(...result.product.variants.nodes);
    hasNextPage = result.product.variants.pageInfo.hasNextPage;
    cursor = result.product.variants.pageInfo.endCursor;
  }

  return variants;
};

export const params = {
  productId: { type: "string" },
  apply: { type: "boolean", default: false },
};

export const run: ActionRun = async ({ params, api, connections, logger }) => {
  const targetProductId = params.productId ?? DEFAULT_TARGET_PRODUCT_ID;
  const apply = params.apply ?? false;

  // Prefer the session shop; fall back to the single installed shop so this also
  // works from the API playground and scheduled jobs.
  let shopId = connections.shopify.currentShopId;
  if (!shopId) {
    const [shop] = await api.internal.shopifyShop.findMany({ first: 1, select: { id: true } });
    shopId = shop?.id;
  }
  if (!shopId) {
    throw new Error("No Shopify shop found");
  }

  const shopify = (connections.shopify.current ??
    (await connections.shopify.forShopId(shopId))) as ShopifyClient | null;
  if (!shopify) {
    throw new Error("Missing Shopify connection");
  }

  // 1. Find the current month's selected product — the input/source of SKUs.
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selection] = await api.internal.monthlyProductSelection.findMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
    first: 1,
  });

  if (!selection) {
    throw new Error(`No product selected for the current month (${month})`);
  }

  // 2. Build the input SKU per pants size from that product. Variants of a size
  // share one SKU, so the first non-empty one per size is the canonical value.
  const inputVariants = await loadVariants(shopify, selection.productId);
  const inputSkuBySize: Record<string, string> = {};
  for (const variant of inputVariants) {
    const size = sizeOf(variant);
    const sku = variant.sku?.trim();
    if (size && sku && !(size in inputSkuBySize)) {
      inputSkuBySize[size] = sku;
    }
  }

  // 3. Compare against the target product's variants, matching by pants size.
  const targetVariants = await loadVariants(shopify, targetProductId);
  const changes: Array<{ variantId: string; title: string; oldSku: string | null; newSku: string }> = [];
  const unmatched: Array<{ variantId: string; title: string; size: string | null }> = [];
  let unchanged = 0;

  for (const variant of targetVariants) {
    const size = sizeOf(variant);
    const newSku = size ? inputSkuBySize[size] : undefined;

    if (!newSku) {
      unmatched.push({ variantId: variant.id, title: variant.title, size });
      continue;
    }
    if ((variant.sku?.trim() ?? "") === newSku) {
      unchanged += 1;
      continue;
    }
    changes.push({
      variantId: variant.id,
      title: variant.title,
      oldSku: variant.sku ?? null,
      newSku,
    });
  }

  const plan = {
    inputProductId: selection.productId,
    targetProductId,
    month,
    applied: false,
    inputSkuBySize,
    changeCount: changes.length,
    unchanged,
    changes,
    unmatched,
  };

  if (!apply || changes.length === 0) {
    logger.info(
      { targetProductId, month, changeCount: changes.length, apply },
      "sku alignment dry-run"
    );
    return plan;
  }

  // 4. Apply the changes. SKU is written via the variant's inventory item.
  const BATCH_SIZE = 100;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);
    const result = (await shopify.graphql(
      `mutation AlignSkus($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      {
        productId: targetProductId,
        variants: batch.map((change) => ({
          id: change.variantId,
          inventoryItem: { sku: change.newSku },
        })),
      }
    )) as BulkUpdateResponse;

    const errors = result.productVariantsBulkUpdate.userErrors;
    if (errors.length > 0) {
      logger.error({ targetProductId, errors }, "productVariantsBulkUpdate returned errors");
      throw new Error(`Failed to update SKUs: ${errors.map((e) => e.message).join("; ")}`);
    }
  }

  logger.info({ targetProductId, month, changeCount: changes.length }, "sku alignment applied");
  return { ...plan, applied: true };
};

export const options: ActionOptions = {};
