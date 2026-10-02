import type { WorkspaceSnapshot } from "./schemas";
export interface WorkspaceRepository {
  create(userId: string, name: string): Promise<WorkspaceSnapshot>;
  get(userId: string, id: string): Promise<WorkspaceSnapshot>;
  list(userId: string): Promise<WorkspaceSnapshot[]>;
  save(userId: string, snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
}
