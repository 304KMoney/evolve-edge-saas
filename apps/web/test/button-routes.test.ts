import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";

const appRoot = path.resolve(process.cwd(), "app");

function normalizeRoutePath(route: string) {
  const [pathname] = route.split(/[?#]/, 1);
  return pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
}

function hasRouteImplementation(route: string) {
  const normalized = normalizeRoutePath(route);
  const routeDir = path.join(appRoot, normalized);

  return (
    existsSync(path.join(routeDir, "page.tsx")) ||
    existsSync(path.join(routeDir, "page.ts")) ||
    existsSync(path.join(routeDir, "route.ts")) ||
    existsSync(path.join(routeDir, "route.tsx"))
  );
}

function runButtonRouteTests() {
  const buttonRoutes = [
    "/dashboard",
    "/dashboard/assessments",
    "/dashboard/assessments/start",
    "/dashboard/frameworks",
    "/dashboard/monitoring",
    "/dashboard/evidence",
    "/dashboard/programs",
    "/dashboard/reports",
    "/dashboard/roadmap",
    "/dashboard/billing",
    "/dashboard/demo",
    "/dashboard/settings",
    "/dashboard/settings?billing=demo-mode#billing-controls",
    "/dashboard/settings#inventory-registry",
    "/dashboard/settings#trust-center",
    "/onboarding",
    "/contact-sales",
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
