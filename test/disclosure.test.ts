import { test } from "node:test";
import assert from "node:assert/strict";

import {
  disclose,
  requirements,
  DISCLOSURE_HEADER,
  IncompleteDisclosure,
  UnresolvedQuestions,
} from "../src/disclosure.ts";
import { UnmarkedContent } from "../src/marker.ts";
import type { SystemProfile } from "../src/policy.ts";

const chatbot: SystemProfile = { role: "provider", interactsWithPeople: true };
const words = { "ai-system": "You are chatting with our AI assistant." };

test("the caller's words are the statement; the header still names the obligation", () => {
  const disclosure = disclose(chatbot, { text: words, locale: "en-GB" });
  assert.equal(disclosure.statement, "You are chatting with our AI assistant.");
  assert.deepEqual(disclosure.obligations, ["art50-1"]);
  assert.equal(disclosure.machineReadable[DISCLOSURE_HEADER], "art50-1");
  assert.equal(disclosure.locale, "en-GB");
});

// The point of the whole file: a half-written notice is worse than an error.
test("a notice missing a required element is refused, and names what is missing", () => {
  assert.throws(
    () => disclose({ role: "both", interactsWithPeople: true, deepfake: true }, { text: words }),
    (error: unknown) => {
      assert.ok(error instanceof IncompleteDisclosure);
      assert.deepEqual(
        error.missing.map((element) => element.id),
        ["artificial-content"],
      );
      return true;
    },
  );
});

test("blank wording is missing wording", () => {
  assert.throws(() => disclose(chatbot, { text: { "ai-system": "   " } }), IncompleteDisclosure);
});

// A profile nobody finished answering used to be served silently, with no
// header at all — indistinguishable from a system that owes nothing.
test("an unanswered question is refused, and the error carries the question", () => {
  assert.throws(
    () => disclose({ role: "provider", interactsWithPeople: "unknown" }, { text: words }),
    (error: unknown) => {
      assert.ok(error instanceof UnresolvedQuestions);
      assert.deepEqual(
        error.questions.map((review) => review.obligation.id),
        ["art50-1"],
      );
      assert.match(error.message, /interacts directly with natural persons/);
      return true;
    },
  );
});

// Until the question is answered nobody knows which elements the notice owes,
// so the open question is reported before the blank wording.
test("an open question is reported ahead of wording that is also missing", () => {
  assert.throws(
    () =>
      disclose(
        { role: "both", interactsWithPeople: true, deepfake: true, artisticOrSatirical: "unknown" },
        { text: {} },
      ),
    UnresolvedQuestions,
  );
});

test("an answered no leaves nothing open", () => {
  const disclosure = disclose(
    { role: "provider", interactsWithPeople: true, obviousFromContext: false },
    { text: words },
  );
  assert.deepEqual(disclosure.obligations, ["art50-1"]);
});

test("exposure to emotion recognition takes two elements, not one", () => {
  const profile: SystemProfile = { role: "deployer", emotionRecognition: true };
  const required = requirements(profile);

  assert.deepEqual(
    required.map((r) => r.measure),
    ["inform-exposed-persons"],
  );
  assert.deepEqual(
    required[0].elements.map((element) => element.id),
    ["ai-system", "biometric-operation"],
  );
  assert.throws(() => disclose(profile, { text: words }), IncompleteDisclosure);

  const disclosure = disclose(profile, {
    text: { ...words, "biometric-operation": "It reads the tone of your voice to route your call." },
  });
  assert.match(disclosure.statement, /tone of your voice/);
});

// Words are not a machine-readable mark, and Article 50(2) asks for both.
test("marking is a requirement no wording can satisfy, and it says so", () => {
  const profile: SystemProfile = { role: "provider", generatesSyntheticContent: true };
  const marking = requirements(profile).find((r) => r.measure === "mark-machine-readable");

  assert.equal(marking?.satisfiedByText, false);
  assert.deepEqual(marking?.elements, []);

  const disclosure = disclose(profile);
  assert.deepEqual(disclosure.unmetByStatement, ["mark-machine-readable"]);
  assert.equal(disclosure.statement, "");
});

test("obligations met by speaking are not listed as unmet", () => {
  assert.deepEqual(disclose(chatbot, { text: words }).unmetByStatement, []);
});

test("placement comes with the requirement rather than being left to guesswork", () => {
  const [interaction] = requirements(chatbot);
  assert.match(interaction.placement.when, /first interaction/);
  assert.match(interaction.placement.manner, /clear and distinguishable/);
});

test("an adapted duty carries its note through to the disclosure", () => {
  const disclosure = disclose(
    { role: "deployer", deepfake: true, artisticOrSatirical: true },
    { text: { "artificial-content": "Ce visage a été généré par une IA." }, locale: "fr" },
  );
  assert.equal(disclosure.notes.length, 1);
  assert.match(disclosure.notes[0], /Article 50\(4\)/);
});

test("nothing triggered means nothing required and nothing said", () => {
  const disclosure = disclose({ role: "both" });
  assert.deepEqual(requirements({ role: "both" }), []);
  assert.equal(disclosure.statement, "");
  assert.deepEqual(disclosure.obligations, []);
  assert.deepEqual(disclosure.machineReadable, {});
});

test("one sentence covering two elements is not repeated", () => {
  const sentence = "You are talking to an AI, and everything it shows you is AI-generated.";
  const disclosure = disclose(
    { role: "both", interactsWithPeople: true, deepfake: true },
    { text: { "ai-system": sentence, "artificial-content": sentence } },
  );
  assert.equal(disclosure.statement, sentence);
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
