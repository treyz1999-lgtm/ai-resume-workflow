// Next.js calls register() once when a server starts, before it handles any
// request. It doesn't run during `next build`, so the build needs no secrets.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnvOnStartup } = await import("@/lib/env");
    checkEnvOnStartup();

    // AI jobs left running by the previous process can't finish (E6-7).
    const { recoverInterruptedJobs } = await import("@/lib/jobs/runner");
    const { logServerError } = await import("@/lib/log");
    await recoverInterruptedJobs().catch((error: unknown) => logServerError("startup", error));

    // Finished jobs, with what they were given and wrote, are deleted after a while.
    const { startJobSweep } = await import("@/lib/jobs/retention");
    startJobSweep();

    // Nightly backups at 03:00, while they're switched on (E10-7).
    const { startPreparationBackups } = await import("@/lib/preparation-backups");
    startPreparationBackups();

    // The inbox check, while a Google account is connected (E15-3).
    const { startInboxSchedule } = await import("@/lib/google/sync");
    startInboxSchedule();

    // Discovery is independent of tailoring, with durable interval/window claims.
    const { startDiscoverySchedule } = await import("@/lib/discovery/scheduler");
    startDiscoverySchedule();
    const { startTailoringQueue } = await import("@/lib/tailoring/runner");
    startTailoringQueue();

    // Startup sources participate in the same discovery schedule. The legacy
    // daily startup timer would bypass the user's selected windows and sessions.

    // DOSSIER_JOBS_SOURCE=arbeitsagentur: the log says what that choice means (#223).
    const { arbeitsagenturStartupNotice, loadJobSearchConfig } = await import("@/lib/job-search/config");
    try {
      const notice = arbeitsagenturStartupNotice(await loadJobSearchConfig());
      if (notice) console.log(notice);
    } catch (error) {
      logServerError("job search", error);
    }

    // DOSSIER_TELEMETRY, when set, is the usage ping's answer on record (#172).
    // Then the log says what the ping sends while it's on, or how to answer
    // while nobody has.
    const { recordEnvChoice, usagePingNotice } = await import("@/lib/usage-ping");
    const { loadSettings } = await import("@/lib/settings-data");
    try {
      await recordEnvChoice();
      const notice = usagePingNotice(await loadSettings());
      if (notice) console.log(notice);
    } catch (error) {
      logServerError("usage ping", error);
    }
  }
}
