export async function requireRecordInOrganization<T>(input: {
  recordId: string;
  organizationId: string;
  entityLabel: string;
  load: (scope: { recordId: string; organizationId: string }) => Promise<T | null>;
}) {
  const record = await input.load({
    recordId: input.recordId,
    organizationId: input.organizationId
  });

  if (!record) {
    throw new Error(`${input.entityLabel} not found.`);
  }

  return record;
}
