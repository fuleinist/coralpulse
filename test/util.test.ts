import { test } from "node:test";
import assert from "node:assert/strict";

import { clamp, isIsoDate, pad2, slugify, todayISO } from "../src/util.js";

test("pad2 pads numbers to two digits", () => {
  assert.equal(pad2(3), "03");
  assert.equal(pad2(12), "12");
  assert.equal(pad2(0), "00");
});

test("isIsoDate accepts real dates only", () => {
  assert.equal(isIsoDate("2026-10-20"), true);
  assert.equal(isIsoDate("2026-2-03"), false);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("nope"), false);
});

test("todayISO renders the UTC date", () => {
  assert.equal(todayISO(new Date("2026-10-20T01:02:03Z")), "2026-10-20");
});

test("clamp keeps values in range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("slugify makes simple slugs", () => {
  assert.equal(slugify("Davies Reef!"), "davies-reef");
  assert.equal(slugify("  My  Site  "), "my-site");
  assert.equal(slugify("---"), "");
});