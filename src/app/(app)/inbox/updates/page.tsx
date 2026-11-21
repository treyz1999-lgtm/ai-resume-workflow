import type { Metadata } from "next";
import { googleConnection } from "@/lib/google/account";
import { loadStatusFindings } from "@/lib/google/status-report";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";
import { userTimeZone } from "@/lib/time-zone";
import { UpdatesScreen } from "./updates-screen";

export const metadata: Metadata = { title: "Application updates" };

export default async function UpdatesPage() {
  const [findings, connection, settings, timeZone, applications] = await Promise.all([
    loadStatusFindings(), googleConnection(), loadSettings(), userTimeZone(),
    prisma.application.findMany({
      where: { awaitingReview: false, sentAt: { not: null } },
      orderBy: [{ sentAt: "desc" }, { id: "asc" }],
      select: { id: true, company: true, role: true, sentAt: true },
    }),
  ]);
  return <UpdatesScreen
    findings={findings.map(finding => ({ ...finding, emailDate: finding.emailDate.toISOString() }))}
    applications={applications.map(application => ({ ...application, sentAt: application.sentAt?.toISOString() ?? null }))}
    connected={connection.status === "connected" && connection.canRead && settings.gmailRead}
    timeZone={timeZone ?? "UTC"}
  />;
}
