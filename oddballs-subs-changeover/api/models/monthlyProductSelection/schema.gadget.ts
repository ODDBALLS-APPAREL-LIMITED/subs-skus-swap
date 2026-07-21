import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "monthlyProductSelection" model, go to https://oddballs-subs-changeover.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DataModel-MonthlyProductSelection",
  fields: {
    month: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyProductSelection-month",
    },
    productId: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyProductSelection-productId",
    },
    productImage: {
      type: "string",
      storageKey: "MonthlyProductSelection-productImage",
    },
    productTitle: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyProductSelection-productTitle",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "MonthlyProductSelection-shop",
    },
  },
};
