import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRequestOrigin } from "../src/lib/workspace/request-origin";

test("standalone origin uses the launcher's explicit browser address while rejecting foreign origins", () => {
  const internal = "http://localhost:3081/api/workspaces";
  const browserOrigin = "http://127.0.0.1:3081";
  assert.doesNotThrow(() => validateRequestOrigin(new Request(internal, { headers: { origin: browserOrigin } }), browserOrigin));
  for (const origin of ["http://evil.example", "null", "http://127.0.0.1:3082", "https://127.0.0.1:3081"]) {
    assert.throws(() => validateRequestOrigin(new Request(internal, { headers: { origin, host: "evil.example", "x-forwarded-host": "evil.example" } }), browserOrigin), /Request origin is not allowed/);
  }
});

test("normal server keeps same-origin checks and permits non-browser requests without Origin", () => {
  const url = "https://filemind.example/api/workspaces";
  assert.doesNotThrow(() => validateRequestOrigin(new Request(url, { headers: { origin: "https://filemind.example" } })));
  assert.doesNotThrow(() => validateRequestOrigin(new Request(url)));
  assert.throws(() => validateRequestOrigin(new Request(url, { headers: { origin: "https://other.example" } })), /Request origin is not allowed/);
});
