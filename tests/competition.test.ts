import { test } from "node:test";
import assert from "node:assert/strict";
import { competitionMode, realAIRequired, developmentControls } from "../src/lib/competition";
test("competition mode requires real AI even when a stale config requests mock",()=>{
  const env={COMPETITION_MODE:"true",AI_ENGINE:"mock",NODE_ENV:"development"};
  assert.equal(competitionMode(env),true);assert.equal(realAIRequired(env),true);assert.equal(developmentControls(env),false);
  assert.equal(developmentControls({NODE_ENV:"production"}),false);assert.equal(developmentControls({NODE_ENV:"development",DEMO_MODE:"true"}),false);assert.equal(realAIRequired({AI_ENGINE:"mock"}),false);
});
