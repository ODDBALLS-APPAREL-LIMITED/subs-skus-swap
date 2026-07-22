import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "monthlyCollectionSelection" model, go to https://oddballs-subs-changeover.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DataModel-MonthlyCollectionSelection",
  fields: {
    collectionId: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyCollectionSelection-collectionId",
    },
    collectionImage: {
      type: "string",
      storageKey: "MonthlyCollectionSelection-collectionImage",
    },
    collectionTitle: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyCollectionSelection-collectionTitle",
    },
    month: {
      type: "string",
      validations: { required: true },
      storageKey: "MonthlyCollectionSelection-month",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "MonthlyCollectionSelection-shop",
    },
  },
};
