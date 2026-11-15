/** Parameterized V5 layout adapted from Jake Gutierrez's MIT-licensed resume.
 * See templates/v5/LICENSE. This module contains no personal source sections.
 */
export type V5Track = "swe" | "data";
export type V5Contact = { name: string; email?: string; phone?: string; location?: string; website?: string; linkedin?: string; github?: string };
export type V5ResumeInput = {
  contact: V5Contact;
  skills: { category: string; items: string[] }[];
  experience: { role: string; company: string; location: string; dates: string; bullets: string[]; includeSwe: boolean; includeData: boolean }[];
  projects: { name: string; url: string; stack: string[]; bullets: string[] }[];
  education: { school: string; degree: string; location?: string; dates: string; details?: string[] }[];
};
export type CoverLetterInput = {
  contact: V5Contact; date: string; company: string; role: string;
  salutation: string; paragraphs: string[]; closing: string;
};

/** Text is always prose. Never accept user LaTeX or TeX control characters. */
export function escapeLatex(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("Unsupported control character in document text.");
  const escaped: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#", "%": "\\%", "_": "\\_", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" };
  return value.replace(/[\\{}$&#%_~^]/g, character => escaped[character]).replace(/[\r\n\t]+/g, " ");
}

/** Only ordinary web links are accepted; encode TeX delimiters before escaping. */
export function latexWebUrl(value: string): string {
  if (/[\\\u0000-\u0020\u007f]/.test(value)) throw new Error("Use a valid HTTP or HTTPS document link.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Use a valid HTTP or HTTPS document link."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a valid HTTP or HTTPS document link.");
  return url.href.replace(/[{}$^~]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/[%&#_]/g, character => `\\${character}`);
}

// Retained verbatim from the reusable V5 master preamble and layout macros.
// Personal metadata and section inputs are deliberately supplied by the caller.
export const V5_PREAMBLE = String.raw`% Adapted from Jake Gutierrez's Jake's Resume (MIT), based on sb2nov/resume.
% Copyright (c) 2020 Jake Gutierrez. See templates/v5/LICENSE.
% https://www.overleaf.com/latex/templates/jakes-resume/syzfjbzwjncs
\documentclass[letterpaper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.5in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[english]{babel}
\usepackage{needspace}
\usepackage[colorlinks=true,urlcolor=blue,linkcolor=blue,citecolor=blue,pdfborder={0 0 0}]{hyperref}
\input{glyphtounicode}
\pdfgentounicode=1
\pagestyle{empty}
\urlstyle{same}
\raggedright
\raggedbottom
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\titleformat{\section}{\large\scshape\raggedright}{}{0em}{}[\titlerule]
\titlespacing*{\section}{0pt}{8pt}{4pt}
\newcommand{\resumeItem}[1]{\item {#1}}
\newenvironment{resumeItems}{\begin{itemize}[leftmargin=0.16in,label=\textbullet,itemsep=1pt,topsep=2pt,parsep=0pt,partopsep=0pt]}{\end{itemize}}
% A wrapping paragraph avoids a rigid table cell for long project names/stacks.
\newcommand{\projectHeading}[2]{\par\addvspace{4pt}\Needspace{4\baselineskip}\textbf{#1}\enspace\textbar\enspace\textit{#2}\par}`;

function contactBlock(contact: V5Contact): string {
  const details = [contact.location, contact.phone].filter((value): value is string => Boolean(value)).map(escapeLatex);
  if (contact.email) {
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(contact.email)) throw new Error("Use a valid contact email address.");
    const mailto = `mailto:${encodeURIComponent(contact.email).replace(/%40/g, "@").replace(/%/g, "\\%")}`;
    details.push(`{\\hypersetup{urlcolor=black}\\href{${mailto}}{${escapeLatex(contact.email)}}}`);
  }
  if (contact.linkedin) details.push(`\\href{${latexWebUrl(contact.linkedin)}}{LinkedIn}`);
  if (contact.github) details.push(`\\href{${latexWebUrl(contact.github)}}{GitHub}`);
  if (contact.website) details.push(`\\href{${latexWebUrl(contact.website)}}{Portfolio}`);
  return `\\begin{center}\n{\\LARGE\\scshape ${escapeLatex(contact.name)}}\\\\[3pt]\n\\small ${details.join(" \\enspace\\textbar\\enspace ")}\n\\end{center}\n\\vspace{-8pt}`;
}
function bullets(values: string[]): string {
  if (!values.length) return "";
  return `\\begin{resumeItems}\n${values.map(value => `\\resumeItem{${escapeLatex(value)}}`).join("\n")}\n\\end{resumeItems}`;
}
function metadata(name: string, title: string): string {
  return `\\hypersetup{pdftitle={${escapeLatex(title)}},pdfauthor={${escapeLatex(name)}}}`;
}

/** Renders supplied evidence only. Selection, wording and QA belong to M4. */
export function renderV5Resume(track: V5Track, input: V5ResumeInput): string {
  if (track !== "swe" && track !== "data") throw new Error("Choose the SWE or Data preset.");
  const roles = input.experience.filter(role => track === "swe" ? role.includeSwe : role.includeData);
  const skills = input.skills.map(skill => `\\textbf{${escapeLatex(skill.category)}:} ${skill.items.map(escapeLatex).join(", ")}\\\\`).join("\n");
  const experience = roles.map(role => `\\par\\addvspace{3pt}\\Needspace{4\\baselineskip}\n\\textbf{${escapeLatex(role.role)}}\\enspace\\textbar\\enspace ${escapeLatex(role.company)}\\enspace\\textbar\\enspace ${escapeLatex(role.location)}\\hfill ${escapeLatex(role.dates)}\n${bullets(role.bullets)}`).join("\n");
  const projects = input.projects.map(project => `\\projectHeading{\\href{${latexWebUrl(project.url)}}{${escapeLatex(project.name)}}}{${project.stack.map(escapeLatex).join(", ")}}\n${bullets(project.bullets)}`).join("\n");
  const education = input.education.map(entry => `\\par\\addvspace{3pt}\\textbf{${escapeLatex(entry.school)}}${entry.location ? `\\enspace\\textbar\\enspace ${escapeLatex(entry.location)}` : ""}\\hfill ${escapeLatex(entry.dates)}\\\\\n${escapeLatex(entry.degree)}\n${bullets(entry.details ?? [])}`).join("\n");
  const sections = [
    ["Technical Skills", skills],
    ["Experience", experience],
    ["Projects", projects],
    ["Education", education],
  ].filter(([, body]) => body.trim()).map(([name, body]) => `\\section{${name}}\n${body}`).join("\n");
  return `${V5_PREAMBLE}\n% V5 ${track.toUpperCase()} preset; work-history inclusion is profile data.\n${metadata(input.contact.name, `${input.contact.name} Resume`)}\n\\begin{document}\n${contactBlock(input.contact)}\n\\small\n${sections}\n\\end{document}\n`;
}

/** Basic local cover letter, with explicit author-provided prose and no invented claims. */
export function renderCoverLetter(input: CoverLetterInput): string {
  return `${V5_PREAMBLE}\n${metadata(input.contact.name, `${input.contact.name} Cover Letter`)}\n\\begin{document}\n${contactBlock(input.contact)}\n\\setlength{\\parskip}{10pt}\n${escapeLatex(input.date)}\\par\n\\textbf{${escapeLatex(input.company)}}\\par\nRe: ${escapeLatex(input.role)}\\par\n${escapeLatex(input.salutation)}\\par\n${input.paragraphs.map(paragraph => `${escapeLatex(paragraph)}\\par`).join("\n")}\n${escapeLatex(input.closing)}\\par\n${escapeLatex(input.contact.name)}\n\\end{document}\n`;
}

/** All names, dates and accomplishments below are fictional test data. */
export const fictionalResume: V5ResumeInput = {
  contact: { name: "Morgan Example", email: "morgan@example.com", phone: "555-0100", location: "Example City", website: "https://example.com", linkedin: "https://example.com/profile" },
  skills: [{ category: "Languages", items: ["TypeScript", "Python", "SQL"] }, { category: "Tools", items: ["PostgreSQL", "Docker", "Git"] }],
  experience: [
    { role: "Software Analyst", company: "Fictional Systems", location: "Example City", dates: "2024–2026", includeSwe: true, includeData: true, bullets: ["Maintained an internal planning tool and tested its calculation rules.", "Validated imported records with documented reconciliation checks."] },
    { role: "Reporting Analyst", company: "Example Research", location: "Example City", dates: "2022–2024", includeSwe: false, includeData: true, bullets: ["Prepared SQL reports to investigate changes in operational measures.", "Documented metric definitions and reviewed findings with the team."] },
  ],
  projects: [
    { name: "Aurora", stack: ["TypeScript", "PostgreSQL"], url: "https://example.com/aurora", bullets: ["Built a task tracker with searchable records.", "Validated form inputs before saving changes.", "Added integration checks for the update flow."] },
    { name: "Beacon", stack: ["Python", "SQL"], url: "https://example.com/beacon", bullets: ["Built a reproducible reporting pipeline.", "Checked missing values before aggregation.", "Recorded source definitions with each output."] },
    { name: "Cedar", stack: ["TypeScript"], url: "https://example.com/cedar", bullets: ["Created an accessible inventory dashboard.", "Added filters for category and availability.", "Verified keyboard navigation through forms."] },
    { name: "Delta", stack: ["Python"], url: "https://example.com/delta", bullets: ["Compared fictional forecasts with observations.", "Separated training and evaluation datasets.", "Published error summaries with assumptions."] },
    { name: "Ember", stack: ["SQL", "Docker"], url: "https://example.com/ember", bullets: ["Packaged a local database demonstration.", "Added idempotent fixture loading commands.", "Tested restoration into an empty database."] },
  ],
  education: [{ school: "Example University", degree: "B.S. Computer Science", dates: "2022", location: "Example City" }],
};
export const fictionalCoverLetter: CoverLetterInput = {
  contact: fictionalResume.contact, date: "November 2, 2026", company: "Fictional Hiring Team", role: "Software Engineer", salutation: "Dear Hiring Team,",
  paragraphs: ["I am interested in the Software Engineer role. My fictional project work includes building a task tracker and validating its update flow.", "The Aurora project gave me practice with TypeScript, PostgreSQL, and integration checks. I would welcome the opportunity to discuss how this experience relates to the role.", "Thank you for considering my application."], closing: "Sincerely,",
};
