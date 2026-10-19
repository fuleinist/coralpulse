import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAlert, effectiveServer, sendNtfy } from "../src/notify.js";
import { assessRisk } from "../src/risk.js";
import type { RiskEntry } from "../src/report.js";
import type { ProductKey, SiteSnapshot } from "../src/crw.js";

function snapshotFor(level: number): SiteSnapshot {
  const stored: SiteSnapshot["values"] = {};
  const add = (key: ProductKey, value: number): void => {
    stored[key] = { key, time: "2026-10-15T12:00:00Z", latitude: -18.275, longitude: 147.675, value };
  };
  add("baa", level);
  add("dhw", 7.42);
  add("hotspot", 1.63);
  return { siteId: "example-reef", fetchedAt: "2026-10-20T06:00:00Z", values: stored, errors: {} };
}

function entryFor(name: string, level: number): RiskEntry {
  return { siteId: "example-reef", name, assessment: assessRisk(snapshotFor(level)) };
}

test("buildAlert returns null for an empty list", () => {
  assert.equal(buildAlert([]), null);
});

test("buildAlert renders a single-site title and message", () => {
  const alert = buildAlert([entryFor("Example Reef", 4)]);
  assert.ok(alert);
  assert.equal(alert.title, "coralpulse: bleaching alert for 1 site");
  assert.ok(alert.message.includes("Example Reef: Alert Level 2"));
  assert.ok(alert.message.includes("DHW 7.4 °C-weeks"));
  assert.ok(alert.message.includes("data 2026-10-15T12:00:00Z"));
});

test("buildAlert pluralizes the site count", () => {
  const alert = buildAlert([entryFor("A", 3), entryFor("B", 4)]);
  assert.ok(alert);
  assert.equal(alert.title, "coralpulse: bleaching alert for 2 sites");
  assert.equal(alert.message.split("\n").length, 2);
});

test("effectiveServer falls back and trims slashes", () => {
  assert.equal(effectiveServer(undefined), "https://ntfy.sh");
  assert.equal(effectiveServer(""), "https://ntfy.sh");
  assert.equal(effectiveServer("https://ntfy.sh/"), "https://ntfy.sh");
  assert.equal(effectiveServer("https://example.com/ntfy///"), "https://example.com/ntfy");
});

test("sendNtfy posts the title and message", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetching = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  await sendNtfy(
    { server: "https://ntfy.sh", topic: "reef-alerts", title: "coralpulse: test", message: "hello reef" },
    fetching,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ntfy.sh/reef-alerts");
  assert.equal(calls[0].init?.method, "POST");
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Title, "coralpulse: test");
  assert.equal(headers.Priority, "default");
  assert.equal(calls[0].init?.body, "hello reef");
});

test("sendNtfy throws on HTTP errors", async () => {
  const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  await assert.rejects(
    () => sendNtfy({ topic: "t", title: "x", message: "y" }, failing),
    /ntfy POST failed: HTTP 500/,
  );
});