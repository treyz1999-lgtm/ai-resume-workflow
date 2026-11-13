import { notFound } from "next/navigation";
import { PreparedResumeDocument } from "@/components/documents/resume-document";
import { verifyPrintAccess } from "@/lib/pdf/print-access";
import { readPrintSnapshot } from "@/lib/tailoring/print-snapshot";
import { printCss } from "@/lib/themes";
import type { ResumeContent } from "@/lib/resume-content";

export default async function PrintTailoring({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await verifyPrintAccess("/print/tailoring/" + id);
  const snapshot = await readPrintSnapshot(id);
  if (!snapshot) notFound();
  const { resume, theme, track } = snapshot;
  const c = resume.contact;
  const links: Record<string, string> = {};
  const contacts = [c.location, c.phone, c.email].filter((v): v is string => Boolean(v));
  if (c.email) links[c.email] = "mailto:" + c.email;
  for (const [label, url] of [["LinkedIn", c.linkedin], ["GitHub", c.github], ["Portfolio", c.website]]) {
    if (label && url) { contacts.push(label); links[label] = url; }
  }
  const content: ResumeContent = {
    name: c.name, contacts, photo: null, headline: "", summary: "",
    skills: resume.skills.map(group => group.category + ": " + group.items.join(", ")).join(" · "),
    languages: "", publications: [], references: [],
    projects: resume.projects.map((p, index) => {
      links[p.url] = p.url;
      return { id: String(index), name: p.name, link: p.url, dates: "", skills: p.stack, bullets: p.bullets };
    }),
    experience: resume.experience.filter(r => track === "swe" ? r.includeSwe : r.includeData).map((r, i) => ({
      id: String(i), role: r.role, company: [r.company, r.location].filter(Boolean).join(" · "), dates: r.dates, bullets: r.bullets, skills: [],
    })),
    education: resume.education.map((e, i) => ({ id: String(i), degree: e.degree, school: [e.school, e.location].filter(Boolean).join(" · "), dates: e.dates, notes: (e.details ?? []).join(" · ") })),
  };
  return <><style>{printCss(theme, "LETTER")}</style><PreparedResumeDocument theme={theme} content={content} paper="LETTER" links={links} /></>;
}

