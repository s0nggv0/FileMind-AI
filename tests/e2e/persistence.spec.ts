import { test, expect, type Page } from "@playwright/test";
import { recoverSnapshot, WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../../src/lib/workspace/schemas";
import { validateReview } from "../../src/lib/workspace/authorization";
import { textFile } from "./fixtures";
async function persistentTransport(page: Page, existing?: WorkspaceSnapshot, intelligence = false) {
  let snapshot = existing; let saves = 0;
  await page.route("**/api/workspace-config", route => route.fulfill({ json: { persistent: true, intelligence, label: intelligence ? "FileMind Intelligence" : "Mock · basic organization" } }));
  await page.route("**/api/workspaces**", async route => {
    const request = route.request(); const method = request.method(); const url = new URL(request.url());
    if (method === "GET") { await route.fulfill({ json: snapshot ? recoverSnapshot(snapshot) : { workspaces: [], persistent: true } }); return; }
    if (url.pathname.endsWith("/files")) { await route.fulfill({ json: snapshot }); return; }
    if (method === "POST") {
      snapshot = WorkspaceSnapshotSchema.parse({ id: crypto.randomUUID(), name: "Transformer Notes", revision: 0, documents: [], run: null, proposal: null, texts: {}, updatedAt: new Date().toISOString() });
    } else if (method === "PUT") {
      const next = WorkspaceSnapshotSchema.parse(request.postDataJSON()); expect(next.revision).toBe(snapshot?.revision); snapshot = { ...next, revision: next.revision + 1 }; saves++;
    } else if (method === "PATCH") {
      const body = request.postDataJSON(); expect(body.revision).toBe(snapshot?.revision);
      if (body.action === "resume") { snapshot!.run = null; snapshot!.proposal = null; }
      else { validateReview(snapshot!, body.proposal); snapshot!.proposal = body.proposal; if (body.action === "apply") { snapshot!.run!.status = "completed"; snapshot!.run!.result = body.proposal; } }
      snapshot!.revision++; saves++;
    }
    await route.fulfill({ json: snapshot });
  });
  return { snapshot: () => snapshot!, saves: () => saves };
}
test("persistent mock upload → review autosave → refresh review → apply → refresh completed", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  const transport = await persistentTransport(page);
  await page.goto("/workspace"); await expect(page.getByText("Persistent workspace", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Choose local files").setInputFiles([textFile("Transformer Notes.txt")]);
  await page.getByRole("button", { name: "Organize with FileMind" }).click(); await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible();
  // Wait for run events to finish saving before review edits.
  await expect.poll(() => transport.snapshot()?.run?.status).toBe("waiting_for_review");
  await page.getByLabel("Category for Transformer Notes.txt").selectOption("Research");
  await page.getByLabel("New tag for Transformer Notes.txt").fill("Custom"); await page.getByRole("button", { name: "Add tag to Transformer Notes.txt" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(transport.snapshot().proposal!.documents[0].tags).toContain("Custom");
  await page.reload(); await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible(); await expect(page.getByLabel("Category for Transformer Notes.txt")).toHaveValue("Research");
  await page.getByRole("button", { name: "Apply organization plan" }).click(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  expect(transport.saves()).toBeGreaterThan(2); expect(errors).toEqual([]);
});
test("interrupted saved run restores explicitly and can resume with saved text", async ({ page }) => {
  const documentId = crypto.randomUUID(); const id = crypto.randomUUID();
  const document = { id: documentId, name: "Transformer Notes.txt", type: "txt", mimeType: "text/plain", size: 15, contentRef: documentId, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } };
  const snapshot = WorkspaceSnapshotSchema.parse({ id, name: "Notes", revision: 2, documents: [document], texts: { [documentId]: "Transformer attention lecture notes." }, proposal: null, run: { id: crypto.randomUUID(), engine: "mock", status: "running", simulation: true, startedAt: Date.now(), documents: [document], steps: [], activity: [], progress: 10 }, updatedAt: new Date().toISOString() });
  await persistentTransport(page, snapshot); await page.goto(`/workspace?workspace=${id}`);
  await expect(page.getByRole("heading", { name: "Run interrupted" })).toBeVisible(); await page.getByRole("button", { name: "Resume analysis" }).click();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible();
});
test("saved workspace load failure is visible; default dashboard has no fake totals", async ({ page }) => {
  const unauthorized = await page.request.get(`/api/workspaces/${crypto.randomUUID()}`, { headers: { cookie: `filemind-session=${crypto.randomUUID()}.forged-signature` } });
  expect(unauthorized.status()).toBe(404);
  await page.route("**/api/workspace-config", route => route.fulfill({ json: { persistent: true, intelligence: false, label: "Mock" } }));
  await page.route("**/api/workspaces/*", route => route.fulfill({ status: 404, json: { error: "Workspace not found." } }));
  await page.goto(`/workspace?workspace=${crypto.randomUUID()}`); await expect(page.getByRole("alert").filter({ hasText: "Workspace not found." })).toBeVisible();
  await page.goto("/dashboard"); await expect(page.getByText("No saved workspaces yet")).toBeVisible();
});
test("LLM transport failure offers explicit local fallback and preserves human review", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await persistentTransport(page, undefined, true);
  await page.route("**/api/ai/agent", route => route.fulfill({ status: 503, json: { error: "AI service is temporarily unavailable." } }));
  await page.goto("/workspace"); await page.getByLabel("Choose local files").setInputFiles([textFile("Transformer Notes.txt")]);
  await page.getByRole("button", { name: "Organize with FileMind" }).click(); await expect(page.getByRole("heading", { name: "Agent needs a restart" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with local organization" }).click();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible(); await expect(page.getByText("AI analysis unavailable — using basic local organization.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply organization plan" })).toBeVisible(); expect(errors).toEqual([]);
});
