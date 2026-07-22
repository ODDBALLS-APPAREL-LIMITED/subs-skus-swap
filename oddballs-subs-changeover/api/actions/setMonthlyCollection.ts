import { ActionOptions } from "gadget-server";

export const params = {
  month: { type: "string" },
  collectionId: { type: "string" },
  collectionTitle: { type: "string" },
  collectionImage: { type: "string" },
};

export const run: ActionRun = async ({ params, api, connections, logger }) => {
  const { month, collectionId, collectionTitle, collectionImage } = params;
  const shopId = connections.shopify.currentShopId;

  if (!shopId) {
    throw new Error("Missing Shopify shop context");
  }
  if (!month || !collectionId || !collectionTitle) {
    throw new Error("month, collectionId and collectionTitle are required");
  }

  const existing = await api.internal.monthlyCollectionSelection.findMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
    first: 1,
  });

  if (existing.length > 0) {
    logger.info({ shopId, month }, "updating monthly collection selection");
    return await api.internal.monthlyCollectionSelection.update(existing[0].id, {
      collectionId,
      collectionTitle,
      collectionImage,
    });
  }

  logger.info({ shopId, month }, "creating monthly collection selection");
  return await api.internal.monthlyCollectionSelection.create({
    month,
    collectionId,
    collectionTitle,
    collectionImage,
    shop: { _link: shopId },
  });
};

export const options: ActionOptions = {};
