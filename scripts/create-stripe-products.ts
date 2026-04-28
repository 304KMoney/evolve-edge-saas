import { createRequire } from "node:module";

import {
  CANONICAL_PLAN_DISPLAY_NAMES,
  CANONICAL_PUBLIC_PRICING,
  type CanonicalPlanCode,
  type CanonicalBillingCadence
} from "../apps/web/lib/canonical-domain";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { loadEnvConfig } = requireFromWeb("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};

type StripeLike = {
  products: {
    list: (params: { active: boolean; limit: number }) => Promise<{ data: Array<{ id: string; name: string }> }>;
    create: (params: {
      name: string;
      description: string;
      metadata: Record<string, string>;
    }) => Promise<{ id: string; name: string }>;
  };
  prices: {
    list: (params: {
      product: string;
      active: boolean;
      limit: number;
    }) => Promise<{
      data: Array<{
        id: string;
        currency: string;
        unit_amount: number | null;
        recurring: { interval: "month" | "year" } | null;
      }>;
    }>;
    create: (params: {
      product: string;
      unit_amount: number;
      currency: "usd";
      recurring: { interval: "month" | "year" };
      metadata: Record<string, string>;
    }) => Promise<{ id: string }>;
  };
};

type PriceIds = {
  monthly: string | null;
  annual: string | null;
};

type SummaryRow = {
  planCode: CanonicalPlanCode;
  productName: string;
  productId: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
};

const DRY_RUN = process.argv.includes("--dry-run");

function dollarsToCents(usd: number) {
  return Math.round(usd * 100);
}

function formatId(id: string | null) {
  return id ?? "-";
}

async function findProductByName(stripe: StripeLike, name: string) {
  const products = await stripe.products.list({
    active: true,
    limit: 100
  });

  return products.data.find((product) => product.name === name) ?? null;
}

async function findRecurringPrice(
  stripe: StripeLike,
  productId: string,
  interval: "month" | "year"
) {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100
  });

  return (
    prices.data.find(
      (price) =>
        price.currency === "usd" &&
        price.recurring?.interval === interval &&
        typeof price.unit_amount === "number"
    ) ?? null
  );
}

async function ensurePrice(
  stripe: StripeLike,
  input: {
    productId: string;
    amountUsd: number;
    cadence: CanonicalBillingCadence;
  }
) {
  const interval = input.cadence === "monthly" ? "month" : "year";
  const existing = await findRecurringPrice(stripe, input.productId, interval);
  if (existing) {
    return existing.id;
  }

  if (DRY_RUN) {
    return `[dry-run] would-create-${interval}-price`;
  }

  const created = await stripe.prices.create({
    product: input.productId,
    unit_amount: dollarsToCents(input.amountUsd),
    currency: "usd",
    recurring: {
      interval
    },
    metadata: {
      cadence: input.cadence
    }
  });

  return created.id;
}

async function ensureProductAndPrices(
  stripe: StripeLike,
  planCode: CanonicalPlanCode
): Promise<SummaryRow> {
  const productName = CANONICAL_PLAN_DISPLAY_NAMES[planCode];
  const description = `${productName} plan`;

  let product = await findProductByName(stripe, productName);
  if (!product && DRY_RUN) {
    product = {
      id: `[dry-run] would-create-product-${planCode}`,
      name: productName
    };
  }

  if (!product) {
    product = await stripe.products.create({
      name: productName,
      description,
      metadata: {
        plan_code: planCode
      }
    });
  }

  const prices: PriceIds = {
    monthly: null,
    annual: null
  };

  const monthlyUsd = CANONICAL_PUBLIC_PRICING[planCode].cadence.monthly.usd;
  const annualUsd = CANONICAL_PUBLIC_PRICING[planCode].cadence.annual.usd;

  if (typeof monthlyUsd === "number") {
    prices.monthly = await ensurePrice(stripe, {
      productId: product.id,
      amountUsd: monthlyUsd,
      cadence: "monthly"
    });
  }

  if (typeof annualUsd === "number") {
    prices.annual = await ensurePrice(stripe, {
      productId: product.id,
      amountUsd: annualUsd,
      cadence: "annual"
    });
  }

  return {
    planCode,
    productName,
    productId: product.id,
    monthlyPriceId: prices.monthly,
    annualPriceId: prices.annual
  };
}

function printSummary(rows: SummaryRow[]) {
  console.log("\nStripe product/price summary:");
  console.table(
    rows.map((row) => ({
      "Product name": row.productName,
      "Product ID": row.productId,
      "Monthly price ID": formatId(row.monthlyPriceId),
      "Annual price ID": formatId(row.annualPriceId)
    }))
  );
}

function printVercelEnvBlock(rows: SummaryRow[]) {
  const byPlan = new Map(rows.map((row) => [row.planCode, row]));
  const starter = byPlan.get("starter");
  const scale = byPlan.get("scale");
  const enterprise = byPlan.get("enterprise");

  if (!starter || !scale || !enterprise) {
    throw new Error("Missing one or more canonical plans in summary output.");
  }

  console.log("Vercel env vars:");
  console.log(`STRIPE_PRODUCT_STARTER=${starter.productId}`);
  console.log(`STRIPE_PRODUCT_SCALE=${scale.productId}`);
  console.log(`STRIPE_PRODUCT_ENTERPRISE=${enterprise.productId}`);
  console.log(`STRIPE_PRICE_STARTER_MONTHLY=${starter.monthlyPriceId ?? ""}`);
  console.log(`STRIPE_PRICE_STARTER_ANNUAL=${starter.annualPriceId ?? ""}`);
  console.log(`STRIPE_PRICE_SCALE_MONTHLY=${scale.monthlyPriceId ?? ""}`);
  console.log(`STRIPE_PRICE_SCALE_ANNUAL=${scale.annualPriceId ?? ""}`);
}

function buildOfflineDryRunRows(): SummaryRow[] {
  return ["starter", "scale", "enterprise"].map((planCode) => {
    const hasMonthly = typeof CANONICAL_PUBLIC_PRICING[planCode].cadence.monthly.usd === "number";
    const hasAnnual = typeof CANONICAL_PUBLIC_PRICING[planCode].cadence.annual.usd === "number";

    return {
      planCode,
      productName: CANONICAL_PLAN_DISPLAY_NAMES[planCode],
      productId: `[dry-run] would-create-product-${planCode}`,
      monthlyPriceId: hasMonthly ? `[dry-run] would-create-month-price-${planCode}` : null,
      annualPriceId: hasAnnual ? `[dry-run] would-create-year-price-${planCode}` : null
    };
  });
}

async function loadStripeFromWeb(secretKey: string): Promise<StripeLike> {
  let StripeCtor: new (key: string) => StripeLike;

  try {
    StripeCtor = requireFromWeb("stripe") as new (key: string) => StripeLike;
  } catch {
    throw new Error(
      "The stripe package is not installed in apps/web. Add it to apps/web/package.json before live execution."
    );
  }

  return new StripeCtor(secretKey);
}

async function main() {
  loadEnvConfig("apps/web");

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set. Expected from apps/web/.env.local.");
  }

  if (secretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to run with test mode key (sk_test_...). Use a LIVE key.");
  }

  if (!secretKey.startsWith("sk_live_")) {
    throw new Error("Unexpected STRIPE_SECRET_KEY format. Expected sk_live_...");
  }

  if (DRY_RUN) {
    console.log("DRY RUN enabled: no products or prices will be created.");
    const rows = buildOfflineDryRunRows();
    printSummary(rows);
    printVercelEnvBlock(rows);
    return;
  }

  const stripe = await loadStripeFromWeb(secretKey);
  const plans: CanonicalPlanCode[] = ["starter", "scale", "enterprise"];
  const rows: SummaryRow[] = [];

  for (const planCode of plans) {
    const pricing = CANONICAL_PUBLIC_PRICING[planCode];
    if (
      planCode !== "enterprise" &&
      (typeof pricing.cadence.monthly.usd !== "number" ||
        typeof pricing.cadence.annual.usd !== "number")
    ) {
      throw new Error(`Expected numeric monthly/annual pricing for ${planCode}.`);
    }

    rows.push(await ensureProductAndPrices(stripe, planCode));
  }

  printSummary(rows);
  printVercelEnvBlock(rows);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  process.exit(1);
});