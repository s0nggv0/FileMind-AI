import "server-only";
import { PostgresWorkspaceRepository } from "@/lib/workspace/postgres-repository";
import { database } from "./database";
export const workspaceRepository = new PostgresWorkspaceRepository(database);
