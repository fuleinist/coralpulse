import { test } from "node:test";
import assert from "node:assert/strict";

import { demoRiskEntries } from "../src/demo.js";

test("demoRiskEntries returns two offline entries", () => {
  const entries = demoRiskEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].siteId, "davies-reef");
  assert.equal(entries[0].assessment.level, 0);
  assert.equal(entries[0].assessment.label, "No Stress");
  assert.equal(entries[1].siteId, "example-reef");
  assert.equal(entries[1].assessment.level, 4);
  assert.equal(entries[1].assessment.label, "Alert Level 2");
});

test("the synthetic demo entry is clearly labelled", () => {
  const entries = demoRiskEntries();
  assert.ok(entries[1].name.toLowerCase().includes("synthetic"));
  assert.ok(entries[1].assessment.notes.some((n) => n.includes("synthetic")));
});