import { ActionOptions } from "gadget-server";
import { subscriptionMappings } from "../subscriptionMappings";

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

type CollectionProductNode = {
  id: string;
  title: string;
  productType: string | null;
  variants: {
    nodes: VariantNode[];
    pageInfo: { hasNextPage: boolean };
  };
};

type CollectionProductsResponse = {
  collection: {
    products: {
      nodes: CollectionProductNode[];
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

type Change = { variantId: string; title: string; oldSku: string | null; newSku: string };

const sizeOf = (variant: VariantNode) =>
  variant.selectedOptions.find((option) => option.name === SIZE_OPTION_NAME)?.value ?? null;

// Build a Size -> SKU map from a set of variants. Variants of a size share one
// SKU, so the first non-empty SKU per size wins.
const sizeSkuMap = (variants: VariantNode[]): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const variant of variants) {
    const size = sizeOf(variant);
    const sku = variant.sku?.trim();
    if (size && sku && !(size in map)) {
      map[size] = sku;
    }
  }
  return map;
};

// Fetch every variant of a single product, following pagination.
const loadProductVariants = async (shopify: ShopifyClient, productId: string): Promise<VariantNode[]> => {
  const variants: VariantNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = (await shopify.graphql(
      `query ProductVariants($id: ID!, $cursor: String) {
        product(id: $id) {
          variants(first: 100, after: $cursor) {
            nodes { id title sku selectedOptions { name value } }
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

// Fetch all products in a collection. Assumes each product has few enough
// variants to fit one page (warns otherwise).
const loadCollectionProducts = async (
  shopify: ShopifyClient,
  collectionId: string,
  logger: { warn: (data: unknown, msg: string) => void }
): Promise<CollectionProductNode[]> => {
  const products: CollectionProductNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = (await shopify.graphql(
      `query CollectionProducts($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 50, after: $cursor) {
            nodes {
              id
              title
              productType
              variants(first: 100) {
                nodes { id title sku selectedOptions { name value } }
                pageInfo { hasNextPage }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: collectionId, cursor }
    )) as CollectionProductsResponse;

    if (!result.collection) {
      throw new Error(`Collection not found in Shopify: ${collectionId}`);
    }

    for (const product of result.collection.products.nodes) {
      if (product.variants.pageInfo.hasNextPage) {
        logger.warn(
          { productId: product.id, type: product.productType },
          "collection product has >100 variants; only first 100 read"
        );
      }
      products.push(product);
    }

    hasNextPage = result.collection.products.pageInfo.hasNextPage;
    cursor = result.collection.products.pageInfo.endCursor;
  }

  return products;
};

// Find the collection product for a mapping: match product_type, then narrow by
// titleContains when set. Returns the product plus a note if the match is
// missing or ambiguous.
const matchCollectionProduct = (
  products: CollectionProductNode[],
  mapping: { productType: string; titleContains?: string }
): { product: CollectionProductNode | null; note?: string } => {
  let candidates = products.filter(
    (product) => (product.productType?.trim() ?? "") === mapping.productType
  );

  if (mapping.titleContains) {
    const needle = mapping.titleContains.toLowerCase();
    candidates = candidates.filter((product) => product.title.toLowerCase().includes(needle));
  }

  if (candidates.length === 0) {
    return {
      product: null,
      note: mapping.titleContains
        ? `No "${mapping.productType}" product whose title contains "${mapping.titleContains}" in the collection`
        : `No product of product_type "${mapping.productType}" in the collection`,
    };
  }
  if (candidates.length > 1) {
    return {
      product: candidates[0],
      note: `Ambiguous match (${candidates.length} products); using the first. Add/adjust titleContains to disambiguate.`,
    };
  }
  return { product: candidates[0] };
};

const computeChanges = (subVariants: VariantNode[], sizeSku: Record<string, string>) => {
  const changes: Change[] = [];
  const unmatched: Array<{ variantId: string; title: string; size: string | null }> = [];
  let unchanged = 0;

  for (const variant of subVariants) {
    const size = sizeOf(variant);
    const newSku = size ? sizeSku[size] : undefined;

    if (!newSku) {
      unmatched.push({ variantId: variant.id, title: variant.title, size });
      continue;
    }
    if ((variant.sku?.trim() ?? "") === newSku) {
      unchanged += 1;
      continue;
    }
    changes.push({ variantId: variant.id, title: variant.title, oldSku: variant.sku ?? null, newSku });
  }

  return { changes, unmatched, unchanged };
};

const applyChanges = async (shopify: ShopifyClient, productId: string, changes: Change[]) => {
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
        productId,
        variants: batch.map((change) => ({ id: change.variantId, inventoryItem: { sku: change.newSku } })),
      }
    )) as BulkUpdateResponse;

    const errors = result.productVariantsBulkUpdate.userErrors;
    if (errors.length > 0) {
      throw new Error(`Failed to update SKUs for ${productId}: ${errors.map((e) => e.message).join("; ")}`);
    }
  }
};

export const params = {
  apply: { type: "boolean", default: false },
};

export const run: ActionRun = async ({ params, api, connections, logger }) => {
  const apply = params.apply ?? false;

  if (subscriptionMappings.length === 0) {
    throw new Error("No subscription mappings configured in api/subscriptionMappings.ts");
  }

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

  // 1. Find the current month's selected collection — the source of SKUs.
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selection] = await api.internal.monthlyCollectionSelection.findMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
    first: 1,
  });

  if (!selection) {
    throw new Error(`No collection selected for the current month (${month})`);
  }

  // 2. Load the collection's products.
  const collectionProducts = await loadCollectionProducts(shopify, selection.collectionId, logger);

  // 3. Walk each mapping: match the collection product by type (and titleContains
  // when set), then align that subscription product's variant SKUs by Size.
  const results: Array<Record<string, unknown>> = [];

  for (const mapping of subscriptionMappings) {
    const { product: source, note } = matchCollectionProduct(collectionProducts, mapping);

    if (!source) {
      results.push({
        subscriptionProductId: mapping.subscriptionProductId,
        productType: mapping.productType,
        titleContains: mapping.titleContains ?? null,
        matchedCollectionProductId: null,
        note,
        changeCount: 0,
        changes: [],
        unmatched: [],
        unchanged: 0,
      });
      continue;
    }

    const sizeSku = sizeSkuMap(source.variants.nodes);
    const subVariants = await loadProductVariants(shopify, mapping.subscriptionProductId);
    const { changes, unmatched, unchanged } = computeChanges(subVariants, sizeSku);

    if (apply && changes.length > 0) {
      await applyChanges(shopify, mapping.subscriptionProductId, changes);
    }

    results.push({
      subscriptionProductId: mapping.subscriptionProductId,
      productType: mapping.productType,
      titleContains: mapping.titleContains ?? null,
      matchedCollectionProductId: source.id,
      matchedCollectionTitle: source.title,
      note: note ?? null,
      sizeSku,
      changeCount: changes.length,
      changes,
      unmatched,
      unchanged,
    });
  }

  const totalChanges = results.reduce((sum, r) => sum + (r.changeCount as number), 0);
  logger.info({ month, collectionId: selection.collectionId, apply, totalChanges }, "subscription sku alignment");

  return {
    month,
    collectionId: selection.collectionId,
    applied: apply && totalChanges > 0,
    totalChanges,
    results,
  };
};

export const options: ActionOptions = {};
