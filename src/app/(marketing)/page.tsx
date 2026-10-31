import type { Metadata } from "next";
import { HeroSection } from "@/features/landing/hero-section";
import { CitationDemo } from "@/features/landing/citation-demo";
import { AgentDemo } from "@/features/landing/agent-demo";
import { CapabilitiesSection } from "@/features/landing/capabilities-section";
import { WorkflowSection } from "@/features/landing/workflow-section";
import { GraphShowcase } from "@/features/landing/graph-showcase";
import { CleanupShowcase } from "@/features/landing/cleanup-showcase";
import { FinalCTA } from "@/features/landing/final-cta";
import { getDemoLandingPresentation } from "@/lib/demo/presentation";

export const metadata: Metadata = {
  title: "FileMind AI · 从资料找到答案，回到原文核对",
  description: "知序 AI：导入文档与图片，审阅整理建议，向资料提问并点击引用核对原文。",
};

export default function LandingPage() {
  const data = getDemoLandingPresentation();
  return (
    <>
      <HeroSection formats={data.landingFormats} />
      <CitationDemo />
      <div id="product" className="marketing-width scroll-mt-24">
        <AgentDemo stages={data.agentStages} files={data.landingFiles} metrics={data.metrics} />
      </div>
      <CapabilitiesSection organize={data.organizeExamples} search={data.semanticExample} nodes={data.landingGraphNodes} edges={data.landingGraphEdges} comparison={data.cleanupComparison} />
      <WorkflowSection steps={data.workflowSteps} />
      <GraphShowcase nodes={data.landingGraphNodes} edges={data.landingGraphEdges} />
      <CleanupShowcase comparison={data.cleanupComparison} />
      <FinalCTA />
    </>
  );
}
