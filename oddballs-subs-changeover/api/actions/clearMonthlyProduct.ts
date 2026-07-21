import { ActionOptions } from "gadget-server";

export const params = {
  month: { type: "string" },
};

export const run: ActionRun = async ({ params, api, connections, logger }) => {
  const { month } = params;
  const shopId = connections.shopify.currentShopId;

  if (!shopId) {
    throw new Error("Missing Shopify shop context");
  }
  if (!month) {
    throw new Error("month is required");
  }

  logger.info({ shopId, month }, "clearing monthly product selection");
  await api.internal.monthlyProductSelection.deleteMany({
    filter: { shopId: { equals: shopId }, month: { equals: month } },
  });
};

export const options: ActionOptions = {};
