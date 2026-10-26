import type { SearchIssue } from "./search-outcome";
import { WorkspaceError } from "../workspace/authorization";

export class SearchFailure extends WorkspaceError {
  constructor(public readonly reason: SearchIssue, status = 404) { super("NOT_FOUND", reason, status); }
}
