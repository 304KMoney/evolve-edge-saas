import assert from "node:assert/strict";
import { getHostingerSiteSyncReference } from "../lib/site-sync-reference";

function runSiteSyncReferenceTests() {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.evolveedge.ai";
  process.env.NEXT_PUBLIC_CONTACT_SALES_URL = "https://www.evolveedge.ai/contact-sales";

  const reference = getHostingerSiteSyncReference();

  assert.equal(reference.version, "hostinger-site-sync.v1");
  assert.equal(reference.publicPlans.length, 3);
  assert.deepEqual(
    reference.publicPlans.map((plan) => plan.code),
    ["starter", "scale", "enterprise"]
  );
  assert.equal(reference.publicPlans[0]?.entryHref, "https://app.evolveedge.ai/pricing?plan=starter");
  assert.equal(
    reference.publicPlans[2]?.entryHref,
    "https://www.evolveedge.ai/contact-sales"
  );
  assert.equal(reference.ctaRoutingRules.enterprise, "contact_sales");
  assert.equal(
    reference.compatibilityNotes.some((note) => note.includes("Growth")),
    true
  );

  console.log("site-sync-reference tests passed");
}

runSiteSyncReferenceTests();
