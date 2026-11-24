ALTER TABLE "DiscoveryScan" DROP CONSTRAINT "DiscoveryScan_status_check";
ALTER TABLE "DiscoveryScan" ADD CONSTRAINT "DiscoveryScan_status_check"
CHECK ("status" IN ('QUEUED','RUNNING','COMPLETED','FAILED','INTERRUPTED','CANCELLED'));
