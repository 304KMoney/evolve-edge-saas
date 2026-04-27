import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";

const repoAppRoot = path.resolve(process.cwd(), "apps", "web", "app");
const appRoot = existsSync(repoAppRoot)
  ? repoAppRoot
  : path.resolve(process.cwd(), "app");

function normalizeRoutePath(route: string) {
  const [pathname] = route.split(/[?#]/, 1);
  return pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
}

function directoryHasRouteImplementation(routeDir: string) {
  return (
    existsSync(path.join(routeDir, "page.tsx")) ||
    existsSync(path.join(routeDir, "page.ts")) ||
    existsSync(path.join(routeDir, "route.ts")) ||
    existsSync(path.join(routeDir, "route.tsx"))
  );
}

function isRouteGroupSegment(segment: string) {
  return /^\(.*\)$/.test(segment);
}

function isDynamicRouteSegment(segment: string) {
  return /^\[\[?\.\.\..+\]?\]$/.test(segment) || /^\[[^\]]+\]$/.test(segment);
}

function hasRouteImplementationForSegments(
  currentDir: string,
  segments: string[]
): boolean {
  if (segments.length === 0) {
    return directoryHasRouteImplementation(currentDir);
  }

  const [segment, ...rest] = segments;
  const literalDir = path.join(currentDir, segment);

  if (existsSync(literalDir) && hasRouteImplementationForSegments(literalDir, rest)) {
    return true;
  }

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidateDir = path.join(currentDir, entry.name);

    if (isRouteGroupSegment(entry.name)) {
      if (hasRouteImplementationForSegments(candidateDir, segments)) {
        return true;
      }
      continue;
    }

    if (isDynamicRouteSegment(entry.name)) {
      if (hasRouteImplementationForSegments(candidateDir, rest)) {
        return true;
      }
    }
  }

  return false;
}

function hasRouteImplementation(route: string) {
  const normalized = normalizeRoutePath(route);
  const segments = normalized === "" ? [] : normalized.split("/");

  return hasRouteImplementationForSegments(appRoot, segments);
}

function runButtonRouteTests() {
  const buttonRoutes = [
    "/",
    "/contact",
    "/frameworks",
    "/frameworks/soc-2",
    "/pricing",
    "/pricing?plan=starter&billingCadence=monthly",
    "/start",
    "/start?plan=starter",
    "/start?plan=starter&billingCadence=monthly",
    "/start?plan=scale",
    "/dashboard",
    "/dashboard/assessments",
    "/dashboard/assessments/start",
    "/dashboard/frameworks",
    "/dashboard/monitoring",
    "/dashboard/evidence",
    "/dashboard/programs",
    "/dashboard/reports",
    "/dashboard/reports/access",
    "/dashboard/reports/example-report-id",
    "/dashboard/reports/example-report-id#delivery-operations",
    "/dashboard/roadmap",
    "/dashboard/billing",
    "/dashboard/demo",
    "/dashboard/settings",
    "/dashboard/settings?billing=demo-mode#billing-controls",
    "/dashboard/settings#inventory-registry",
    "/dashboard/settings#trust-center",
    "/onboarding",
    "/contact-sales",
    "/contact-sales?intent=enterprise-plan&source=pricing-page",
    "/contact-sales?intent=framework-review&source=framework-page",
    "/contact-sales?intent=premium-reports&source=reports",
    "/contact-sales?intent=report-access-support&source=report-access-state",
    "/contact-sales?intent=white-glove-onboarding&source=dashboard",
    "/sign-out"
  ];

  for (const route of buttonRoutes) {
    assert.equal(
      hasRouteImplementation(route),
      true,
      `Expected a route implementation for ${route}`
    );
  }

  console.log("button route tests passed");
}

runButtonRouteTests();
