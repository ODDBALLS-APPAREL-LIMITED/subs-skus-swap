import { ActionOptions } from "gadget-server";

export const params = {
  month: { type: "string" },
  productId: { type: "string" },
  productTitle: { type: "string" },
  productImage: { type: "string" },
};

export const run: ActionRun = async ({ params, api, connections, logger }) => {
  const { month, productId, productTitle, productImage } = params;
  const shopId = connections.shopify.currentShopId;

  if (!shopId) {
    throw new Error("Missing Shopify shop context");
  }
  if (!month || !productId || !productTitle) {
    throw new Error("month, productId and productTitle are required");
  }

  const existing = await api.internal.monthlyProductSelection.findMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
    first: 1,
  });

  if (existing.length > 0) {
    logger.info({ shopId, month }, "updating monthly product selection");
    return await api.internal.monthlyProductSelection.update(existing[0].id, {
      productId,
      productTitle,
      productImage,
    });
  }

  logger.info({ shopId, month }, "creating monthly product selection");
  return await api.internal.monthlyProductSelection.create({
    month,
    productId,
    productTitle,
    productImage,
    shop: { _link: shopId },
  });
};

export const options: ActionOptions = {};
