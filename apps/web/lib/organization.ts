import { prisma, SUPPORTED_FRAMEWORK_CATALOG } from "@evolve-edge/db";

export function slugifyOrganizationName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function ensureUniqueOrganizationSlug(baseSlug: string) {
  let candidate = baseSlug || "organization";
  let counter = 1;

  while (
    await prisma.organization.findUnique({
      where: { slug: candidate }
    })
  ) {
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }

  return candidate;
}

export async function ensureDefaultFrameworkCatalog() {
  for (const framework of SUPPORTED_FRAMEWORK_CATALOG) {
    await prisma.framework.upsert({
      where: { code: framework.code },
      update: {
        name: framework.name,
        category: framework.category,
        version: framework.version
      },
      create: {
        code: framework.code,
        name: framework.name,
        category: framework.category,
        version: framework.version
      }
    });
  }

  return prisma.framework.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });
}
