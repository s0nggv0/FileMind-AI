import { RelationshipDemo } from "@/components/knowledge/relationship-demo";
import { OrganizeDemo } from "./organize-demo";
import { SemanticDemo } from "./semantic-demo";
import { CleanupDemo } from "./cleanup-demo";
import type { CleanupComparison, RelationshipEdge, RelationshipNode } from "@/types/presentation";
import type { DocumentType } from "@/types";

type CapabilitiesProps = {
  organize: { before: string; after: string; type: DocumentType }[];
  search: { query: string; results: { name: string; excerpt: string; type: DocumentType }[] };
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  comparison: CleanupComparison;
};

function Capability({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <article className="min-w-0 border-t pt-6">
      <div className="mb-6 flex items-start gap-4"><span className="pt-1 font-mono text-xs text-muted-foreground">{number}</span><div><h3 className="text-xl font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div></div>
      {children}
    </article>
  );
}

export function CapabilitiesSection({ organize, search, nodes, edges, comparison }: CapabilitiesProps) {
  return (
    <section id="features" className="marketing-width marketing-section">
      <div className="mb-10 max-w-xl"><h2 className="section-title">Less managing.<br />More understanding.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">从文件名到内容，从单份资料到知识关联。<br />试着点击下面的演示，看看 FileMind 如何理解你的资料。</p></div>
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        <Capability number="01" title="AI Organize" description="Automatically understand, classify and rename your files."><OrganizeDemo examples={organize} /></Capability>
        <Capability number="02" title="Semantic Search" description="Find information by meaning, not filenames."><SemanticDemo example={search} /></Capability>
        <Capability number="03" title="Knowledge Graph" description="Discover hidden relationships between your documents."><div className="surface-secondary p-4"><RelationshipDemo nodes={nodes} edges={edges} compact /></div></Capability>
        <Capability number="04" title="Smart Cleanup" description="Detect duplicates, outdated files and messy naming."><CleanupDemo comparison={comparison} compact /></Capability>
      </div>
    </section>
  );
}
