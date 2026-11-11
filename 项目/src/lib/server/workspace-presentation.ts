import "server-only";
import { recoverTenantBeforeAccess } from "./reliability";
import { getUserId } from "./identity";
import { database, persistenceConfigured } from "./database";
import { readAppliedPlans, readLibraryDocuments, readWorkspaceOverview } from "@/lib/workspace/presentation-reads";

async function presentationAccess() {
  // Read request identity even without persistence; never cache tenant data.
  const persistent = persistenceConfigured(), user = await getUserId();
  await recoverTenantBeforeAccess(user);
  return { persistent, user: persistent ? user : null };
}

export async function getWorkspaceOverview() {
  const { persistent, user } = await presentationAccess();
  const data: Awaited<ReturnType<typeof readWorkspaceOverview>> = user ? await readWorkspaceOverview(database, user) : {
    workspaces: [], activity: [], documents: [], totalDocuments: 0, totalWorkspaces: 0, recentReviewWorkspaces: 0,
  };
  return { persistent, ...data };
}

export async function getLibraryDocuments() {
  const { persistent, user } = await presentationAccess();
  const data: Awaited<ReturnType<typeof readLibraryDocuments>> = user ? await readLibraryDocuments(database, user) : { documents: [], totalDocuments: 0 };
  return { persistent, ...data };
}

export async function getAppliedPlans() {
  const { persistent, user } = await presentationAccess();
  const data: Awaited<ReturnType<typeof readAppliedPlans>> = user ? await readAppliedPlans(database, user) : { plans: [], totalWorkspaces: 0 };
  return { persistent, ...data };
}
