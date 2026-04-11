import {
  FRAMEWORK_COVERAGE_ENTRIES,
  type FrameworkCoverageEntry,
  METHODOLOGY_STAGES,
  type MethodologyStage
} from "./authority-content";

export function getFrameworkCoverageEntryBySlug(slug: string) {
  return FRAMEWORK_COVERAGE_ENTRIES.find((framework) => framework.slug === slug) ?? null;
}

export function getFrameworkCoverageCategories() {
  return Array.from(
    new Set(FRAMEWORK_COVERAGE_ENTRIES.map((framework) => framework.category))
  );
}

export function getMethodologyStageBySlug(slug: string) {
  return METHODOLOGY_STAGES.find((stage) => stage.slug === slug) ?? null;
}

export function sortFrameworkCoverageEntries(
  entries: FrameworkCoverageEntry[] = FRAMEWORK_COVERAGE_ENTRIES
) {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

export function sortMethodologyStages(
  stages: MethodologyStage[] = METHODOLOGY_STAGES
) {
  return [...stages];
}
