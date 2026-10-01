import type { Metadata } from "next";
import { HeroSection } from "@/features/landing/hero-section";
import { AgentDemo } from "@/features/landing/agent-demo";
import { CapabilitiesSection } from "@/features/landing/capabilities-section";
import { WorkflowSection } from "@/features/landing/workflow-section";
import { GraphShowcase } from "@/features/landing/graph-showcase";
import { CleanupShowcase } from "@/features/landing/cleanup-showcase";
import { FinalCTA } from "@/features/landing/final-cta";
import { getLandingPresentation } from "@/services/presentation-repository";

export const metadata: Metadata = {
  title: "FileMind AI · Turn files into connected knowledge",
  description: "知序 AI：让散乱的文件，成为可以理解、搜索和关联的个人知识空间。体验 Agent 整理、语义搜索与知识图谱的前端演示。",
};

export default function LandingPage() {
  const data = getLandingPresentation();
  return (
    <>
      <HeroSection formats={data.landingFormats} />
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
