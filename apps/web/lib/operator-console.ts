import {
  CustomerRunStatus,
  CustomerAccountTimelineEntryType,
  Prisma,
  ReportPackageDeliveryStatus,
  ReportPackageQaStatus,
  prisma
} from "@evolve-edge/db";
import { getCustomerAccountsForAdmin, type OperatorCustomerQueueFilter } from "./customer-accounts";

type OperatorConsoleDbClient = Prisma.TransactionClient | typeof prisma;

function buildContainsFilter(q: string) {
  return q
    ? {
        contains: q,
        mode: "insensitive" as const
      }
    : undefined;
}

export async function getOperatorConsoleSnapshot(input: {
  q: string;
  queue: OperatorCustomerQueueFilter;
  db?: OperatorConsoleDbClient;
}) {
  const db = input.db ?? prisma;
  const containsFilter = buildContainsFilter(input.q);
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [queueCounts, customerAccounts, actionRequiredRuns, deliveryReviewPackages] =
    await Promise.all([
      Promise.all([
        db.customerAccount.count({
          where: {
            founderReviewRequired: true
          }
        }),
        db.customerAccount.count({
          where: {
            nextActionLabel: { not: null },
            nextActionDueAt: { lte: nextWeek }
          }
        }),
        db.customerRun.count({
          where: {
            status: CustomerRunStatus.ACTION_REQUIRED
          }
        }),
        db.reportPackage.count({
          where: {
            OR: [
              {
                qaStatus: {
                  in: [ReportPackageQaStatus.PENDING, ReportPackageQaStatus.CHANGES_REQUESTED]
                }
              },
              {
                requiresFounderReview: true,
                founderReviewedAt: null
              },
              {
                deliveryStatus: {
                  in: [
                    ReportPackageDeliveryStatus.SENT,
                    ReportPackageDeliveryStatus.BRIEFING_BOOKED
                  ]
                }
              }
            ]
          }
        })
      ]),
      getCustomerAccountsForAdmin({
        q: input.q,
        queue: input.queue,
        limit: 18,
        db
      }),
      db.customerRun.findMany({
        where: {
          status: CustomerRunStatus.ACTION_REQUIRED,
          ...(input.q
            ? {
                OR: [
                  { assessment: { name: containsFilter } },
                  { report: { title: containsFilter } },
                  { organization: { name: containsFilter } },
                  { organization: { slug: containsFilter } }
                ]
              }
            : {})
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          assessment: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          report: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 12
      }),
      db.reportPackage.findMany({
        where: {
          OR: [
            {
              qaStatus: {
                in: [ReportPackageQaStatus.PENDING, ReportPackageQaStatus.CHANGES_REQUESTED]
              }
            },
            {
              requiresFounderReview: true,
              founderReviewedAt: null
            },
            {
              deliveryStatus: {
                in: [ReportPackageDeliveryStatus.SENT, ReportPackageDeliveryStatus.BRIEFING_BOOKED]
              }
            }
          ],
          ...(input.q
            ? {
                OR: [
                  { title: containsFilter },
                  { organization: { name: containsFilter } },
                  { assessment: { name: containsFilter } }
                ]
              }
            : {})
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          assessment: {
            select: {
              id: true,
              name: true
            }
          },
          latestReport: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 12
      })
    ]);

  const overdueFollowUps = customerAccounts.filter(
    (account) => account.nextActionDueAt && account.nextActionDueAt < now
  ).length;

  const recentInternalNotes = await db.customerAccountTimelineEntry.findMany({
    where: {
      entryType: CustomerAccountTimelineEntryType.NOTE_ADDED,
      ...(input.q
        ? {
            OR: [
              { title: containsFilter },
              { body: containsFilter },
              { actorLabel: containsFilter },
              { customerAccount: { companyName: containsFilter } },
              { customerAccount: { primaryContactEmail: containsFilter } }
            ]
          }
        : {})
    },
    include: {
      customerAccount: {
        select: {
          id: true,
          companyName: true,
          primaryContactEmail: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  return {
    queueCounts: {
      founderReview: queueCounts[0],
      upcomingFollowUps: queueCounts[1],
      actionRequiredRuns: queueCounts[2],
      deliveryReview: queueCounts[3],
      overdueFollowUps
    },
    customerAccounts,
    actionRequiredRuns,
    deliveryReviewPackages,
    recentInternalNotes
  };
}
