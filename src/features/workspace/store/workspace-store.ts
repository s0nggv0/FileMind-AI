"use client";

import { create } from "zustand";
import type { AgentEngine, AgentRun, Decision, DemoFault, OrganizationPlan, ParsedDocument, ProposalDocument } from "@/types/workspace";
import { registerFile, releaseDocument, releaseFile, validateFiles } from "../services/file-parser";
import { WorkspaceAgentEngine } from "../services/workspace-agent";

interface WorkspaceState {
  initialized: boolean; persistent: boolean; engineLabel: string; workspaceId?: string; saveStatus: "local" | "saving" | "saved" | "error";
  initialize: (id?: string) => Promise<void>; continueLocally: () => Promise<void>;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    const autosave = () => {
      if (!get().persistent || !engine.saveProposal) return;
      clearTimeout(timer);
      set({ saveStatus: "saving" });
      const version = ++generation;
      timer = setTimeout(async () => {
        const proposal = get().proposal;
        if (!proposal) return;
        try {
          await engine.saveProposal!(proposal);
          // 较早的请求完成时，不覆盖之后的编辑、应用或重置状态。
          if (version === generation) set({ saveStatus: "saved" });
        } catch (error) {
          if (version === generation) {
            set({ saveStatus: "error", errors: [error instanceof Error ? error.message : "工作区保存失败，请重试。"] });
          }
        }
      }, 500);
    };
    const locked = () => get().run !== null;
    const update = (run: AgentRun) => {
      if (get().run?.id !== run.id) return;
      set({ run, documents: run.documents, ...(run.status === "waiting_for_review" ? { proposal: run.result ?? null } : {}) });
    };
    const retryOrSkip = async (action: "retryStep" | "skipStep", stepId: string, fallback: string) => {
      const run = get().run;
      if (!run) return;
      try {
        await engine[action](run.id, stepId, update);
      } catch (error) {
        const message = error instanceof Error ? error.message : fallback;
        set({
          run: { ...(get().run ?? run), status: "failed", error: message },
          saveStatus: "error",
          errors: [message],
        });
      }
    };
    return {
      initialized: !engine.initialize, persistent: false, engineLabel: "仅本地演示", saveStatus: "local",
      initialize: async (id) => {
        if (get().initialized && (!id || get().workspaceId === id)) return;
        try {
          const session = await engine.initialize?.(id); if (!session) return;
          const snapshot = session.snapshot;
          set({ initialized: true, persistent: session.persistent, engineLabel: session.label, saveStatus: session.persistent ? "saved" : "local", workspaceId: snapshot?.id, ...(snapshot ? { documents: snapshot.documents, run: snapshot.run, proposal: snapshot.proposal, applied: snapshot.run?.status === "completed" && snapshot.run.result ? [snapshot.run.result] : get().applied } : {}) });
        } catch (error) { set({ initialized: true, errors: [error instanceof Error ? error.message : "工作区恢复失败，请重试。"] }); }
      },
      continueLocally: async () => {
        if (!engine.continueLocally) return; const documents = get().documents;
        await engine.continueLocally(documents, run => { set({ run, documents: run.documents, proposal: run.result ?? null }); });
      },
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
        if (!get().initialized || locked() || !get().documents.length) return;
        const run = engine.createRun(get().documents, get().fault); set({ run, proposal: null, errors: [] });
        if (get().persistent) set({ saveStatus: "saving" });
        await engine.executeRun(run.id, update);
        if (get().persistent) set({ workspaceId: engine.getWorkspaceId?.(), saveStatus: get().run?.status === "failed" ? "error" : "saved" });
      },
      cancel: () => { const run = get().run; if (run) engine.cancelRun(run.id); },
      restart: async () => {
        const previous = get().run;
        if (!previous || !["cancelled", "failed"].includes(previous.status)) return;
        engine.disposeRun(previous.id);
        set({ run: null, proposal: null, fault: "none", documents: get().documents.map((document) => ({ ...document, parseStatus: "ready", parseError: undefined })) });
        await get().start();
      },
      retry: (id) => retryOrSkip("retryStep", id, "重试状态保存失败，请重试。"),
      skip: (id) => retryOrSkip("skipStep", id, "跳过状态保存失败，请重试。"),
      editDocument: (id, patch) => {
        const proposal = get().proposal;
        if (!proposal || get().run?.status !== "waiting_for_review") return;
        set({ proposal: { ...proposal, documents: proposal.documents.map((document) => document.id === id ? { ...document, ...patch } : document) } });
        autosave();
      },
      decide: (kind, id, decision) => {
        const proposal = get().proposal;
        if (!proposal || get().run?.status !== "waiting_for_review") return;
        set({ proposal: { ...proposal, [kind]: proposal[kind].map((item) => item.id === id ? { ...item, decision } : item) } });
        autosave();
      },
      apply: async () => {
        const { run, proposal } = get();
        if (!run || !proposal || run.status !== "waiting_for_review") return;
        clearTimeout(timer); ++generation;
        set({ run: { ...run, status: "applying" } });
        const plan = { ...proposal, documents: proposal.documents.map((document) => ({ ...document, name: document.renameDecision === "accepted" && document.suggestedName ? document.suggestedName : document.originalName })) };
        try { await engine.applyPlan(run.id, plan, update); }
        catch (error) { set({ run, saveStatus: "error", errors: [error instanceof Error ? error.message : "方案应用失败，请重试。"] }); return; }
        if (get().run?.id === run.id && get().run?.status === "completed") {
          set({ applied: [...get().applied, structuredClone({ ...plan, relationships: plan.relationships.filter(item => item.decision === "accepted") })], saveStatus: get().persistent ? "saved" : "local" });
          get().documents.forEach((document) => releaseFile(document.id));
        }
      },
      reset: () => {
        clearTimeout(timer); ++generation;
        const run = get().run; if (run) engine.disposeRun(run.id);
        engine.resetWorkspace?.();
        get().documents.forEach((document) => releaseDocument(document.id));
        set({ documents: [], errors: [], run: null, proposal: null, fault: "none", workspaceId: undefined });
      },
    };
  });
}
export const useWorkspaceStore = createWorkspaceStore(new WorkspaceAgentEngine());
