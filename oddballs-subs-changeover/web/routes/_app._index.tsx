import { useMemo } from "react";
import { useFindMany, useGlobalAction } from "@gadgetinc/react";
import { api } from "../api";

declare const shopify: {
  resourcePicker: (options: {
    type: "product" | "variant" | "collection";
    multiple?: boolean;
  }) => Promise<
    | Array<{
        id: string;
        title: string;
        images?: Array<{ originalSrc?: string; src?: string }>;
      }>
    | undefined
  >;
};

function buildNextTwelveMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-GB", { month: "long", year: "numeric" });
    return { key, label };
  });
}

export default function Index() {
  const months = useMemo(() => buildNextTwelveMonths(), []);

  const [{ data, fetching, error }, refresh] = useFindMany(api.monthlyProductSelection, {
    select: {
      id: true,
      month: true,
      productId: true,
      productTitle: true,
      productImage: true,
    },
    first: 100,
  });

  const [{ fetching: saving }, setMonthlyProduct] = useGlobalAction(api.setMonthlyProduct);
  const [{ fetching: clearing }, clearMonthlyProduct] = useGlobalAction(api.clearMonthlyProduct);

  const clearProduct = async (monthKey: string) => {
    await clearMonthlyProduct({ month: monthKey });
    await refresh();
  };

  const pickProduct = async (monthKey: string) => {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (!selected || selected.length === 0) return;

    const product = selected[0];
    const image = product.images?.[0]?.originalSrc ?? product.images?.[0]?.src;

    await setMonthlyProduct({
      month: monthKey,
      productId: product.id,
      productTitle: product.title,
      productImage: image,
    });
    await refresh();
  };

  const selectionsByMonth = useMemo(() => {
    const map: Record<string, { id: string; productTitle: string; productImage: string | null }> = {};
    for (const row of data ?? []) {
      map[row.month] = {
        id: row.id,
        productTitle: row.productTitle,
        productImage: row.productImage ?? null,
      };
    }
    return map;
  }, [data]);

  return (
    <s-page heading="Monthly product selection">
      <s-section heading="Next 12 months">
        {error ? <s-text tone="critical">Failed to load selections: {error.message}</s-text> : null}
        {fetching ? <s-text >Loading saved selections…</s-text> : null}

        <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "8px" }}>
          {months.map((month) => {
            const selected = selectionsByMonth[month.key];
            return (
              <div key={month.key} style={{ flex: "0 0 220px" }}>
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="base">
                    <s-text >{month.label}</s-text>

                    {selected ? (
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        {selected.productImage ? (
                          <s-thumbnail
                            src={selected.productImage}
                            alt={selected.productTitle}
                            size="small"
                          />
                        ) : null}
                        <s-text>{selected.productTitle}</s-text>
                      </s-stack>
                    ) : (
                      <s-text >No product selected</s-text>
                    )}

                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        disabled={saving || clearing || undefined}
                        onClick={() => pickProduct(month.key)}
                      >
                        {selected ? "Change product" : "Select product"}
                      </s-button>
                      {selected ? (
                        <s-button
                          variant="tertiary"
                          disabled={saving || clearing || undefined}
                          onClick={() => clearProduct(month.key)}
                        >
                          Clear
                        </s-button>
                      ) : null}
                    </s-stack>
                  </s-stack>
                </s-box>
              </div>
            );
          })}
        </div>
      </s-section>
    </s-page>
  );
}
