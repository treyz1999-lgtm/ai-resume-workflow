import { redirect } from "next/navigation";

/** Old bookmarks lead to discovery; legacy drafts are not created here. */
export default function AgentPage() { redirect("/discovery"); }
