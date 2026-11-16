import { createHash } from "node:crypto";

export const legacyColumns = [
  "application_id", "company", "job_title", "job_track", "date_applied", "job_source", "state",
  "work_arrangement", "salary_min", "salary_max", "resume_version", "cover_letter_sent",
  "experience_requirement", "application_status", "response_date", "interview_stage", "rejection_date",
] as const;
export const columns = [...legacyColumns, "local_id", "posting_url", "salary", "salary_currency", "salary_period", "experience_band", "local_status", "submitted_score", "scoring_method"] as const;
type Column = typeof columns[number];
export type CsvFields = Partial<Record<Column, string>>;
export class CsvError extends Error {}

const statusNames = {
  draft: "DRAFT", prepared: "DRAFT", "resume prepared": "DRAFT", "pending submission": "DRAFT",
  "needs manual completion": "DRAFT", applied: "SENT", submitted: "SENT", sent: "SENT",
  screening: "SCREENING", assessment: "SCREENING", interview: "INTERVIEW", interviewing: "INTERVIEW",
  offer: "OFFER", accepted: "ACCEPTED", rejected: "REJECTED", rejection: "REJECTED",
  declined: "DECLINED", withdrawn: "DECLINED",
} as const;

function parseRecords(text: string) {
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  const finish = () => {
    row.push(field);
    if (row.some(cell => cell.trim())) records.push(row);
    row = []; field = ""; closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (c === ",") { row.push(field); field = ""; closed = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      finish();
    } else if (closed || (c === '"' && field.length)) {
      throw new CsvError(`Unexpected character in CSV record ${records.length + 1}.`);
    } else if (c === '"') quoted = true;
    else field += c;
  }
  if (quoted) throw new CsvError("Unclosed quoted field.");
  finish();
  return records;
}

function day(value: string, row: number, column: string) {
  if (!value) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = us ? `${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}` : value;
  const date = new Date(iso + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(date.valueOf()) || date.toISOString().slice(0,10) !== iso)
    throw new CsvError(`Row ${row}: use YYYY-MM-DD or M/D/YYYY for ${column}.`);
  return date;
}

export function parseTracker(text: string) {
  const [rawHeaders, ...records] = parseRecords(text);
  const headers = rawHeaders?.map(s => s.trim().toLowerCase().replaceAll(" ", "_")) ?? [];
  if (!headers.includes("company") || !headers.includes("job_title")) throw new CsvError("Include company and job_title headers.");
  const unknown = headers.filter(h => !(columns as readonly string[]).includes(h));
  if (unknown.length) throw new CsvError(`Unrecognized headers: ${unknown.join(", ")}.`);
  if (new Set(headers).size !== headers.length) throw new CsvError("Duplicate column headers.");
  if (!records.length) throw new CsvError("The CSV has no application rows.");
  const ids = new Set<string>(), occurrences = new Map<string, number>();
  return records.map((cells, index) => {
    const row = index + 2;
    if (cells.length !== headers.length) throw new CsvError(`Row ${row}: expected ${headers.length} fields, found ${cells.length}.`);
    const fields: CsvFields = Object.fromEntries(headers.map((h,i) => [h,cells[i].replace(/^'(?=[=+@\-\t\r'])/,"")]));
    const company = fields.company?.trim(), role = fields.job_title?.trim();
    if (!company || !role) throw new CsvError(`Row ${row}: company and job_title are required.`);
    const applied = day(fields.date_applied?.trim() ?? "",row,"date_applied");
    for (const col of ["response_date","rejection_date"] as const) day(fields[col]?.trim() ?? "",row,col);
    const statusText = (fields.local_status || fields.application_status || (applied ? "sent" : "draft")).trim().toLowerCase();
    const status = statusNames[statusText as keyof typeof statusNames];
    if (!Object.hasOwn(statusNames,statusText)) throw new CsvError(`Row ${row}: unrecognized application status "${statusText}".`);
    if (fields.posting_url) {
      let url: URL;
      try { url = new URL(fields.posting_url); } catch { throw new CsvError(`Row ${row}: invalid posting_url.`); }
      if (!["http:", "https:"].includes(url.protocol)) throw new CsvError(`Row ${row}: posting_url must use http or https.`);
    }
    let key = fields.application_id?.trim();
    if (!key) {
      const signature = JSON.stringify([company,role,fields.date_applied,fields.posting_url,fields.job_source]);
      const count = occurrences.get(signature) ?? 0;
      occurrences.set(signature,count+1);
      key = JSON.stringify([signature,count]);
    }
    if (fields.local_id && !/^[a-zA-Z0-9_-]{1,100}$/.test(fields.local_id)) throw new CsvError(`Row ${row}: invalid local_id.`);
    const id = fields.local_id || "csv_" + createHash("sha256").update(key).digest("hex");
    if (ids.has(id)) throw new CsvError(`Row ${row}: duplicate attempt ID. Give separate applications distinct IDs.`);
    ids.add(id);
    return {id, fields, company, role, applied, status};
  });
}

export function encodeTracker(rows: CsvFields[]) {
  function cell(value: string) {
    // A leading apostrophe neutralizes formulas in spreadsheet applications.
    const literal = /^[=+@\-\t\r']/.test(value) ? "'" + value : value;
    return '"' + literal.replaceAll('"','""') + '"';
  }
  return [columns.join(","), ...rows.map(row => columns.map(col => cell(row[col] ?? "")).join(","))].join("\r\n") + "\r\n";
}
