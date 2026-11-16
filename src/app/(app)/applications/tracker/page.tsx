import Link from "next/link";
import { TrackerImport } from "./tracker-import";

export const metadata = { title: "Tracker CSV" };
export default function TrackerPage() {
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <Link href="/applications" className="underline">Applications</Link>
    <h1 className="text-3xl">Tracker CSV</h1>
    <a className="underline" href="/api/tracker-csv" download>Download tracker CSV</a>
    <TrackerImport />
  </main>;
}
