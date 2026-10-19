import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { disclose } from "../src/disclosure.ts";
import {
  recordDecision,
  EvidenceLog,
  EVIDENCE_FORMAT,
  GENESIS,
  HASH_ALGORITHM,
  UnrecordableDetail,
  type Entry,
} from "../src/log.ts";
import { RULES_VERSION, type SystemProfile } from "../src/policy.ts";

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

// A record has to say what it is, when it was made and which rules made it,
// without anyone having to know where it came from.
test("every entry names its format, its algorithm, its rules and its moment", () => {
  const entry = new EvidenceLog({ now: fixedClock() }).append("assessment", {});
  assert.equal(entry.format, EVIDENCE_FORMAT);
  assert.equal(entry.alg, HASH_ALGORITHM);
  assert.equal(entry.rules, RULES_VERSION);
  assert.equal(entry.at, "2026-08-16T12:00:00.000Z");
});

test("a log survives export to JSONL and back", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", { obligations: ["art50-2"] });
  log.append("content-unmarked", { reason: "no marker configured" });

  const exported = log.toJSONL();
  assert.equal(exported.split("\n").filter((line) => line !== "").length, 2);

  const restored = EvidenceLog.fromJSONL(exported);
  assert.equal(restored.verify().ok, true);
  assert.deepEqual(restored.entries, log.entries);
});

// A Date used to be hashed as {} and written to the file as a string, so the
// record was never the bytes a reader would check.
test("a Date in detail is recorded as the string JSON writes, and still verifies", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  const entry = log.append("disclosure-shown", {
    path: "/chat",
    shownAt: new Date(Date.UTC(2026, 7, 2, 9, 30, 0)),
    shown: [{ at: new Date(Date.UTC(2026, 7, 2, 9, 31, 0)) }],
  });

  assert.equal(entry.detail.shownAt, "2026-08-02T09:30:00.000Z");
  assert.deepEqual(entry.detail.shown, [{ at: "2026-08-02T09:31:00.000Z" }]);

  const line = log.toJSONL().split("\n")[0];
  const { hash, ...body } = JSON.parse(line) as Entry;
  assert.equal(hash, entry.hash);
  assert.equal((body.detail as Record<string, unknown>).shownAt, "2026-08-02T09:30:00.000Z");
  assert.equal(EvidenceLog.fromJSONL(log.toJSONL()).verify().ok, true);
  assert.equal(EvidenceLog.fromJSON(JSON.parse(JSON.stringify(log))).verify().ok, true);
});

// Dropping or rewriting a value quietly would make the hash a promise about
// something nobody can read back, so the call fails instead.
test("a value JSON cannot carry is refused rather than hashed as something else", () => {
  const log = new EvidenceLog({ now: fixedClock() });

  assert.throws(() => log.append("assessment", { seen: new Map([["a", 1]]) }), UnrecordableDetail);
  assert.throws(() => log.append("assessment", { count: Number.NaN }), UnrecordableDetail);
  assert.throws(() => log.append("assessment", { size: 10n }), UnrecordableDetail);
  assert.throws(
    () => log.append("assessment", { applies: [{ note: () => "later" }] }),
    (error: unknown) => {
      assert.ok(error instanceof UnrecordableDetail);
      assert.equal(error.path, "detail.applies[0].note");
      return true;
    },
  );

  // A refused detail leaves no entry behind, so the chain is untouched.
  assert.deepEqual(log.entries, []);
  assert.equal(log.verify().ok, true);
});

test("a key with no value is dropped, exactly as JSON drops it", () => {
  const a = new EvidenceLog({ now: fixedClock() }).append("assessment", {
    statement: "This face is AI-generated.",
    locale: undefined,
  });
  const b = new EvidenceLog({ now: fixedClock() }).append("assessment", {
    statement: "This face is AI-generated.",
  });
  assert.equal(a.hash, b.hash);
  assert.ok(!("locale" in a.detail));
});

// The point of the whole file: months from now the reader has the lines and a
// SHA-256 and nothing else. This test is that reader — it re-implements the
// documented recipe instead of calling verify().
test("an exported record checks out against a plain sha256, without this library", () => {
  const sortedJSON = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) =>
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
          )
        : item,
    );

  const profile: SystemProfile = { role: "deployer", deepfake: true };
  const log = new EvidenceLog({ now: fixedClock() });
  // Non-ASCII wording on purpose: the bytes that were hashed are the bytes in
  // the file, escapes and all.
  recordDecision(
    log,
    profile,
    disclose(profile, {
      text: { "artificial-content": "Ce visage a été généré par une IA." },
      locale: "fr",
    }),
  );
  log.append("disclosure-shown", { path: "/chat", shownAt: new Date(Date.UTC(2026, 7, 2, 9, 30)) });

  let previousHash = GENESIS;
  for (const line of log.toJSONL().split("\n").filter((l) => l !== "")) {
    const { hash, ...body } = JSON.parse(line) as Entry;
    assert.equal(createHash("sha256").update(sortedJSON(body), "utf8").digest("hex"), hash);
    assert.equal(body.previousHash, previousHash);
    previousHash = hash;
  }
});

test("the wording that was shown is kept with the decision", () => {
  const profile: SystemProfile = { role: "deployer", deepfake: true };
  const log = new EvidenceLog({ now: fixedClock() });
  const entry = recordDecision(
    log,
    profile,
    disclose(profile, {
      text: { "artificial-content": "This face is AI-generated." },
      locale: "en-GB",
    }),
  );

  assert.equal(entry.detail.statement, "This face is AI-generated.");
  assert.equal(entry.detail.locale, "en-GB");
  assert.deepEqual(entry.detail.elements, ["artificial-content"]);
});

test("the record keeps the inputs as stated, questions nobody answered included", () => {
  const profile: SystemProfile = {
    role: "deployer",
    deepfake: true,
    emotionRecognition: false,
    artisticOrSatirical: "unknown",
  };
  const log = new EvidenceLog({ now: fixedClock() });
  // There is no notice to record here — disclose() refuses one while a question
  // is open — and the open question is exactly what the file has to carry.
  const entry = recordDecision(log, profile);

  const inputs = entry.detail.inputs as Record<string, unknown>;
  assert.equal(inputs.deepfake, true);
  assert.equal(inputs.emotionRecognition, false);
  assert.equal(inputs.artisticOrSatirical, "unknown");
  // Never answered is not the same claim as answered "no".
  assert.equal(inputs.publicInterestText, "not stated");

  assert.deepEqual(
    (entry.detail.applies as { obligation: string }[]).map((a) => a.obligation),
    ["art50-4-deepfake"],
  );
  assert.match(
    (entry.detail.needsReview as { question: string }[])[0].question,
    /manner of disclosure but not the duty/,
  );
  assert.equal(entry.detail.statement, undefined);
});

test("an exemption is kept with the reason that was claimed for it", () => {
  const profile: SystemProfile = {
    role: "provider",
    interactsWithPeople: true,
    obviousFromContext: true,
  };
  const log = new EvidenceLog({ now: fixedClock() });
  const entry = recordDecision(log, profile, disclose(profile));

  const excluded = entry.detail.excluded as { obligation: string; because: string }[];
  assert.deepEqual(
    excluded.map((e) => e.obligation),
    ["art50-1"],
  );
  assert.match(excluded[0].because, /reasonably well-informed/);
});

// A file this version cannot read is not a file it can vouch for.
test("a record in an unknown format is not silently accepted", () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", {});

  const foreign = structuredClone(log.entries) as Entry[];
  (foreign[0] as { format: string }).format = "something-else/9";

  const result = EvidenceLog.fromJSON(foreign).verify();
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /format/);
});

test("a log can be stamped with the rules a past decision was made under", () => {
  const log = new EvidenceLog({ now: fixedClock(), rules: "eu-ai-act-article-50@0" });
  assert.equal(log.append("assessment", {}).rules, "eu-ai-act-article-50@0");
  assert.equal(log.verify().ok, true);
});
