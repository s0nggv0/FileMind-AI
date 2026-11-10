import { CitationReading } from "@/components/knowledge/citation-reader";
import { citationAnchor } from "@/lib/retrieval/citation-contract";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { RAGSource } from "@/lib/retrieval/answer-contract";

export function SearchCitation({ selected, selectedRunId, onClose }: { selected: RAGSource | null; selectedRunId?: string; onClose(): void }) {
  return (
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="top-0 right-0 left-auto h-dvh w-full max-w-xl translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-xl"><DialogHeader><DialogTitle className="break-words pr-5 text-base leading-7">{selected?.documentName}</DialogTitle><DialogDescription>资料来源 · 核对引用、前后文与提取全文</DialogDescription></DialogHeader>{selected && <CitationReading key={`${selectedRunId}:${selected.id}`} anchor={citationAnchor(selected)} savedSource={selected} runId={selectedRunId} onBack={() => onClose()} />}</DialogContent></Dialog>
  );
}
