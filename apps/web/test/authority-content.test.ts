import assert from "node:assert/strict";
import {
  FRAMEWORK_COVERAGE_ENTRIES,
  METHODOLOGY_STAGES
} from "../lib/authority-content";
import {
  getFrameworkCoverageCategories,
  getFrameworkCoverageEntryBySlug,
  getMethodologyStageBySlug,
  sortFrameworkCoverageEntries
} from "../lib/authority";

function runAuthorityContentTests() {
  {
    const framework = getFrameworkCoverageEntryBySlug("soc-2");
    assert.equal(framework?.code, "SOC 2");
  }

  {
    const framework = getFrameworkCoverageEntryBySlug("missing-framework");
    assert.equal(framework, null);
  }

  {
    const categories = getFrameworkCoverageCategories();
    assert.ok(categories.includes("Security assurance"));
    assert.ok(categories.length >= 3);
  }

  {
    const sorted = sortFrameworkCoverageEntries(FRAMEWORK_COVERAGE_ENTRIES);
    assert.equal(sorted[0].name <= sorted[1].name, true);
  }

  {
    const stage = getMethodologyStageBySlug("delivery");
    assert.equal(stage?.name, "Executive delivery packaging");
    assert.equal(METHODOLOGY_STAGES.length >= 4, true);
  }

  console.log("authority-content tests passed");
}

runAuthorityContentTests();
