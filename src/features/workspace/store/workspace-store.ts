"use client";

import { create } from "zustand";
import type { AgentEngine, AgentRun, Decision, DemoFault, OrganizationPlan, ParsedDocument, ProposalDocument } from "@/types/workspace";
import { registerFile, releaseDocument, releaseFile, validateFiles } from "../services/file-parser";
import { MockAgentEngine } from "../services/mock-agent";

interface WorkspaceState {
  documents: ParsedDocument[]; errors: string[]; run: AgentRun | null; proposal: OrganizationPlan | null;
  applied: OrganizationPlan[]; fault: DemoFault;
  addFiles: (files: File[]) => void; removeFile: (id: string) => void; clearFiles: () => void;
  setFault: (fault: DemoFault) => void; start: () => Promise<void>; cancel: () => void; restart: () => Promise<void>;
  retry: (stepId: string) => Promise<void>; skip: (stepId: string) => Promise<void>;
  editDocument: (id: string, patch: Partial<Pick<ProposalDocument, "category" | "tags" | "renameDecision">>) => void;
  decide: (kind: "duplicates" | "relationships", id: string, decision: Decision) => void;
  apply: () => Promise<void>; reset: () => void;
}
export function createWorkspaceStore(engine: AgentEngine) {
  return create<WorkspaceState>((set, get) => {
    const locked = () => get().run !== null;
    const update = (run: AgentRun) => {
      if (get().run?.id !== run.id) return;
      set({ run, documents: run.documents, ...(run.status === "waiting_for_review" ? { proposal: run.result ?? null } : {}) });
    };
    return {
      documents: [], errors: [], run: null, proposal: null, applied: [], fault: "none",
      addFiles: (files) => {
        if (locked()) return;
        const validated = validateFiles(files, get().documents.length);
        set({ documents: [...get().documents, ...validated.accepted.map(registerFile)], errors: validated.errors });
      },
      removeFile: (id) => { if (!locked()) { releaseDocument(id); set({ documents: get().documents.filter((document) => document.id !== id), errors: [] }); } },
      clearFiles: () => { if (!locked()) { get().documents.forEach((document) => releaseDocument(document.id)); set({ documents: [], errors: [] }); } },
      setFault: (fault) => { if (!locked()) set({ fault }); },
      start: async () => {
        if (locked() || !get().documents.length) return;
        const run = engine.createRun(get().documents, get().fault); set({ run, proposal: null, errors: [] });
        await engine.executeRun(run.id, update);
      },
      cancel: () => { const run = get().run; if (run) engine.cancelRun(run.id); },
      restart: async () => {
        const previous = get().run;
        if (!previous || !["cancelled", "failed"].includes(previous.status)) return;
        engine.disposeRun(previous.id);
        set({ run: null, proposal: null, fault: "none", documents: get().documents.map((document) => ({ ...document, parseStatus: "ready", parseError: undefined })) });
        await get().start();
      },
      retry: async (id) => { const run = get().run; if (run) await engine.retryStep(run.id, id, update); },
      skip: async (id) => { const run = get().run; if (run) await engine.skipStep(run.id, id, update); },
      editDocument: (id, patch) => {
        const proposal = get().proposal;
        if (!proposal || get().run?.status !== "waiting_for_review") return;
        set({ proposal: { ...proposal, documents: proposal.documents.map((document) => document.id === id ? { ...document, ...patch } : document) } });
      },
      decide: (kind, id, decision) => {
        const proposal = get().proposal;
        if (!proposal || get().run?.status !== "waiting_for_review") return;
        set({ proposal: { ...proposal, [kind]: proposal[kind].map((item) => item.id === id ? { ...item, decision } : item) } });
      },
      apply: async () => {
        const { run, proposal } = get();
        if (!run || !proposal || run.status !== "waiting_for_review") return;
        const plan = { ...proposal, documents: proposal.documents.map((document) => ({ ...document, name: document.renameDecision === "accepted" && document.suggestedName ? document.suggestedName : document.originalName })), relationships: proposal.relationships.filter((item) => item.decision !== "ignored") };
        await engine.applyPlan(run.id, plan, update);
        if (get().run?.id === run.id && get().run?.status === "completed") {
          set({ applied: [...get().applied, structuredClone(plan)] });
          get().documents.forEach((document) => releaseFile(document.id));
        }
      },
      reset: () => {
        const run = get().run; if (run) engine.disposeRun(run.id);
        get().documents.forEach((document) => releaseDocument(document.id));
        set({ documents: [], errors: [], run: null, proposal: null, fault: "none" });
      },
    };
  });
}
export const useWorkspaceStore = createWorkspaceStore(new MockAgentEngine());
