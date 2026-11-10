import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";

export function AgentSection() {
  return <Card className="flex flex-col gap-4">
    <h2 className="text-xl font-medium">Discovery</h2>
    <p className="text-sm text-muted">Manage sources, weekly windows, quick sessions and the scan interval on the Discovery page. Discovery compares roles with your knowledge base; you choose which findings to select for tailoring.</p>
    <div><Link href="/discovery" className={buttonClassName()}>Open discovery</Link></div>
    <p className="text-sm text-muted">Role and location preferences live in your <Link href="/knowledge" className="underline">knowledge base</Link>. Automatic draft creation is no longer used.</p>
  </Card>;
}
