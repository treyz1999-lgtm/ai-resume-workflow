"use client";
import { useState, useTransition } from "react";
import { previewCsv, importCsv } from "./actions";
type Preview = {id:string; company:string; role:string; date:string; status:string; exists:boolean};

export function TrackerImport() {
  const [text, setText] = useState(""), [rows,setRows] = useState<Preview[]>([]);
  const [message,setMessage] = useState(""), [busy,start] = useTransition();
  const count = rows.filter(r => !r.exists).length;
  return <section className="space-y-4">
    <h2 className="text-xl">Import a tracker</h2>
    <p>Upload a V5 tracker or a CSV exported here. Preview the application attempts before importing. Existing IDs are skipped.</p>
    <label className="block">Choose CSV (up to 1 MB)
      <input className="block" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        setRows([]); setText(""); setMessage("");
        if (!file) return;
        if (file.size > 1_000_000) {setMessage("Choose a CSV under 1 MB."); return;}
        start(async () => {
          try {
            const source = await file.text(), result = await previewCsv(source);
            if (!result.ok) {setMessage(result.error); return;}
            setText(source); setRows(result.data);
          } catch { setMessage("Could not read the CSV. Select it again to retry."); }
        });
      }} />
    </label>
    <p role="status">{busy ? "Working…" : message}</p>
    {rows.length > 0 && <>
      <p>{count} new attempts · {rows.length-count} existing IDs</p>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left">
        <caption className="sr-only">Applications in the CSV preview</caption>
        <thead><tr>{["Company","Role","Date","Status","Import"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{r.company}</td><td>{r.role}</td><td>{r.date}</td><td>{r.status}</td><td>{r.exists ? "Skip" : "Add"}</td></tr>)}</tbody>
      </table></div>
      <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={!count || busy} onClick={() => start(async () => {
        try {
          const result = await importCsv(text);
          if (!result.ok) { setMessage(result.error); return; }
          setRows([]); setMessage(`Imported ${result.data} application attempts.`);
        } catch {setMessage("Import could not be confirmed. Preview the file again to check saved IDs.");}
      })}>Import {count} attempts</button>
    </>}
  </section>;
}
