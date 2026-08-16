import { test } from "node:test";
import assert from "node:assert/strict";

import { EvidenceLog, GENESIS, type Entry } from "../src/log.ts";

const fixedClock = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 16, 12, 0, tick++));
};

test("entries chain from the genesis anchor", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  const first = log.append("assessment", { obligations: ["art50-1"] });
  const second = log.append("disclosure-shown", { path: "/chat" });

  assert.equal(first.seq, 0);
  assert.equal(first.previousHash, GENESIS);
  assert.equal(second.previousHash, first.hash);
  assert.equal(log.verify().ok, true);
});

test("an edited entry is detected, and the report names which one", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", { obligations: ["art50-1"] });
  log.append("exemption-claimed", { because: "obvious from context" });
  log.append("disclosure-shown", { path: "/chat" });

  const tampered = structuredClone(log.entries) as Entry[];
  (tampered[1] as { detail: Record<string, unknown> }).detail = { because: "something else" };

  const result = EvidenceLog.fromJSON(tampered).verify();
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.brokenAt, 1);
  assert.match(result.ok === false ? result.reason : "", /do not match the recorded hash/);
});

test("a removed entry breaks the chain", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", {});
  log.append("exemption-claimed", { because: "obvious from context" });
  log.append("disclosure-shown", {});

  const without = [log.entries[0], log.entries[2]] as Entry[];
  const result = EvidenceLog.fromJSON(without).verify();
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.brokenAt, 1);
});

// Hashing must not depend on how a caller happened to order its object keys.
test("key order does not change an entry's hash", () => {
  // Both clocks start at the same instant, so only the key order differs.
  const a = new EvidenceLog({ now: fixedClock() }).append("assessment", {
    obligations: ["art50-1"],
    role: "provider",
  });
  const b = new EvidenceLog({ now: fixedClock() }).append("assessment", {
    role: "provider",
    obligations: ["art50-1"],
  });
  assert.equal(a.hash, b.hash);
});

test("a log survives a round trip through JSON", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", { obligations: ["art50-2"] });
  log.append("content-unmarked", { reason: "no marker configured" });

  const restored = EvidenceLog.fromJSON(JSON.parse(JSON.stringify(log)));
  assert.equal(restored.verify().ok, true);
  assert.deepEqual(restored.entries, log.entries);
});

test("an empty log verifies", () => {
  assert.equal(new EvidenceLog().verify().ok, true);
});
