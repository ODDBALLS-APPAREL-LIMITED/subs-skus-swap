import { ActionOptions } from "gadget-server";

type VariantsResponse = {
  product: {
    variants: {
      edges: Array<{ node: { id: string; title: string; sku: string | null } }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

export const run: ActionRun = async ({ api, connections, logger }) => {
  // Prefer the shop from the current session; fall back to the single installed
  // shop so this also works from the API playground and scheduled jobs.
  let shopId = connections.shopify.currentShopId;
  if (!shopId) {
    const [shop] = await api.internal.shopifyShop.findMany({ first: 1, select: { id: true } });
    shopId = shop?.id;
  }
  if (!shopId) {
    throw new Error("No Shopify shop found");
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selection] = await api.internal.monthlyProductSelection.findMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
    first: 1,
  });

  if (!selection) {
    logger.info({ shopId, month }, "no product selected for current month");
    return [];
  }

  const shopify = connections.shopify.current ?? (await connections.shopify.forShopId(shopId));
  if (!shopify) {
    throw new Error("Missing Shopify connection");
  }

  const variants: Array<{ variantId: string; title: string; sku: string | null }> = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = (await shopify.graphql(
      `query ProductVariants($id: ID!, $cursor: String) {
        product(id: $id) {
          variants(first: 100, after: $cursor) {
            edges {
              node { id title sku }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: selection.productId, cursor }
    )) as VariantsResponse;

    if (!result.product) {
      logger.warn({ shopId, month, productId: selection.productId }, "product not found in Shopify");
      break;
    }

    for (const edge of result.product.variants.edges) {
      variants.push({
        variantId: edge.node.id,
        title: edge.node.title,
        sku: edge.node.sku ?? null,
      });
    }

    hasNextPage = result.product.variants.pageInfo.hasNextPage;
    cursor = result.product.variants.pageInfo.endCursor;
  }

  logger.info({ shopId, month, count: variants.length }, "fetched current month product variants");
  return variants;
};

export const options: ActionOptions = {};
