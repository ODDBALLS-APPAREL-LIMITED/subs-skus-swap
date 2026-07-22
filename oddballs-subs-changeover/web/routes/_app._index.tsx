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
        image?: { originalSrc?: string; src?: string };
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

  const [{ data, fetching, error }, refresh] = useFindMany(api.monthlyCollectionSelection, {
    select: {
      id: true,
      month: true,
      collectionId: true,
      collectionTitle: true,
      collectionImage: true,
    },
    first: 100,
  });

  const [{ fetching: saving }, setMonthlyCollection] = useGlobalAction(api.setMonthlyCollection);
  const [{ fetching: clearing }, clearMonthlyCollection] = useGlobalAction(api.clearMonthlyCollection);
  const [{ fetching: dryRunning }, alignSubscriptionSkus] = useGlobalAction(api.alignSubscriptionSkus);

  const runDryRun = async () => {
    const result = await alignSubscriptionSkus({ apply: false });
    if (result.error) {
      console.error("Changeover dry-run failed", result.error);
    } else {
      console.log("Changeover dry-run", result.data);
    }
  };

  const clearCollection = async (monthKey: string) => {
    await clearMonthlyCollection({ month: monthKey });
    await refresh();
  };

  const pickCollection = async (monthKey: string) => {
    const selected = await shopify.resourcePicker({ type: "collection", multiple: false });
    if (!selected || selected.length === 0) return;

    const collection = selected[0];
    const image = collection.image?.originalSrc ?? collection.image?.src;

    await setMonthlyCollection({
      month: monthKey,
      collectionId: collection.id,
      collectionTitle: collection.title,
      collectionImage: image,
    });
    await refresh();
  };

  const selectionsByMonth = useMemo(() => {
    const map: Record<string, { id: string; collectionTitle: string; collectionImage: string | null }> = {};
    for (const row of data ?? []) {
      map[row.month] = {
        id: row.id,
        collectionTitle: row.collectionTitle,
        collectionImage: row.collectionImage ?? null,
      };
    }
    return map;
  }, [data]);

  return (
    <s-page heading="Monthly subscription collection">
      <s-section heading="Next 12 months">
        {error ? <s-text tone="critical">Failed to load selections: {error.message}</s-text> : null}
        {fetching ? <s-text>Loading saved selections…</s-text> : null}

        <s-stack direction="inline" gap="base">
          <s-button onClick={runDryRun} disabled={dryRunning || undefined}>
            {dryRunning ? "Running…" : "Run dry-run (log to console)"}
          </s-button>
        </s-stack>

        <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "8px" }}>
          {months.map((month) => {
            const selected = selectionsByMonth[month.key];
            return (
              <div key={month.key} style={{ flex: "0 0 220px" }}>
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="base">
                    <s-text>{month.label}</s-text>

                    {selected ? (
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        {selected.collectionImage ? (
                          <s-thumbnail
                            src={selected.collectionImage}
                            alt={selected.collectionTitle}
                            size="small"
                          />
                        ) : null}
                        <s-text>{selected.collectionTitle}</s-text>
                      </s-stack>
                    ) : (
                      <s-text>No collection selected</s-text>
                    )}

                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        disabled={saving || clearing || undefined}
                        onClick={() => pickCollection(month.key)}
                      >
                        {selected ? "Change collection" : "Select collection"}
                      </s-button>
                      {selected ? (
                        <s-button
                          variant="tertiary"
                          disabled={saving || clearing || undefined}
                          onClick={() => clearCollection(month.key)}
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
