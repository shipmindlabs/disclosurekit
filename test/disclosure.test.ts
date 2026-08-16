import { test } from "node:test";
import assert from "node:assert/strict";

import { disclose, DISCLOSURE_HEADER } from "../src/disclosure.ts";
import { UnmarkedContent } from "../src/marker.ts";

test("a chatbot gets a plain statement and a machine-readable header", () => {
  const disclosure = disclose({ role: "provider", interactsWithPeople: true });
  assert.equal(disclosure.statement, "You are interacting with an AI system.");
  assert.deepEqual(disclosure.obligations, ["art50-1"]);
  assert.equal(disclosure.machineReadable[DISCLOSURE_HEADER], "art50-1");
});

// The point of the whole package: words are not a machine-readable mark, and a
// caller who renders the sentence and stops has not met Article 50(2).
test("a statement does not satisfy the marking obligation, and says so", () => {
  const disclosure = disclose({ role: "provider", generatesSyntheticContent: true });
  assert.deepEqual(disclosure.unmetByStatement, ["mark-machine-readable"]);
});

test("obligations met by speaking are not listed as unmet", () => {
  const disclosure = disclose({ role: "provider", interactsWithPeople: true });
  assert.deepEqual(disclosure.unmetByStatement, []);
});

test("wording can be replaced without touching the obligation logic", () => {
  const disclosure = disclose(
    { role: "provider", interactsWithPeople: true },
    { statements: { "inform-before-interaction": "Sie sprechen mit einem KI-System." } },
  );
  assert.equal(disclosure.statement, "Sie sprechen mit einem KI-System.");
  assert.deepEqual(disclosure.obligations, ["art50-1"]);
});

test("an adapted duty carries its note through to the disclosure", () => {
  const disclosure = disclose({
    role: "deployer",
    deepfake: true,
    artisticOrSatirical: true,
  });
  assert.equal(disclosure.notes.length, 1);
  assert.match(disclosure.notes[0], /Article 50\(4\)/);
});

test("nothing triggered means nothing said and no header", () => {
  const disclosure = disclose({ role: "both" });
  assert.equal(disclosure.statement, "");
  assert.deepEqual(disclosure.obligations, []);
  assert.deepEqual(disclosure.machineReadable, {});
});

test("several obligations produce one combined statement without repetition", () => {
  const disclosure = disclose({
    role: "both",
    interactsWithPeople: true,
    deepfake: true,
  });
  assert.match(disclosure.statement, /interacting with an AI system/);
  assert.match(disclosure.statement, /generated or altered/);
  assert.equal(disclosure.obligations.length, 2);
});

// The default marker must never look like it did something.
test("the default marker reports that nothing was marked", async () => {
  const result = await new UnmarkedContent().mark({
    content: "generated text",
    mediaType: "text/plain",
  });
  assert.equal(result.marked, false);
  assert.equal(result.content, "generated text");
  assert.match(result.detail ?? "", /not met by this deployment/);
});
