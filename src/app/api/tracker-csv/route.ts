import { route } from "@/lib/route";
import { exportAttempts } from "@/lib/tracker-csv/store";
export const GET = route(async () => new Response(await exportAttempts(), {headers:{
  "content-type":"text/csv; charset=utf-8",
  "content-disposition":'attachment; filename="application-tracker.csv"',
}}));
