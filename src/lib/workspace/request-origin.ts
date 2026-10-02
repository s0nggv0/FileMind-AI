import { WorkspaceError } from "./authorization";

export function validateRequestOrigin(request: Request, configuredOrigin?: string) {
  const origin = request.headers.get("origin");
  const expected = configuredOrigin || new URL(request.url).origin;
  if (origin && origin !== expected) throw new WorkspaceError("INVALID_STATE", "Request origin is not allowed.", 403);
}
