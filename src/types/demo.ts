export interface DemoActivity {
  id: string;
  title: string;
  description: string;
  time: string;
  status: "completed" | "pending";
}

export interface DemoWorkspaceStep {
  id: string;
  label: string;
  tool: string;
}
