import { test } from "node:test";
import assert from "node:assert/strict";

import { assess, measures, type SystemProfile } from "../src/policy.ts";

const ids = (list: readonly { obligation: { id: string } }[]) => list.map((a) => a.obligation.id);

test("a chatbot has to say it is a chatbot", () => {
  const result = assess({ role: "provider", interactsWithPeople: true });
  assert.deepEqual(ids(result.applies), ["art50-1"]);
  assert.deepEqual(measures(result), ["inform-before-interaction"]);
});

test("an obligation addressed to the other role is not yours to hold or to be exempt from", () => {
  // Article 50(1) binds the provider; a deployer of someone else's chatbot does
  // not answer for it, so it appears in neither list.
  const deployer = assess({ role: "deployer", interactsWithPeople: true });
  assert.deepEqual(ids(deployer.applies), []);
  assert.deepEqual(ids(deployer.excluded), []);

  const both = assess({ role: "both", interactsWithPeople: true });
  assert.deepEqual(ids(both.applies), ["art50-1"]);
});

test("an exemption is recorded with its reason rather than silently dropping the duty", () => {
  const result = assess({
    role: "provider",
    interactsWithPeople: true,
    obviousFromContext: true,
  });
  assert.deepEqual(ids(result.applies), []);
  assert.equal(result.excluded.length, 1);
  assert.match(result.excluded[0].because, /reasonably well-informed/);
});

// The mistake that would matter most: an artistic deepfake still has to be
// disclosed. The article changes the manner, not the duty.
test("an artistic deepfake keeps the duty and gains a note about the manner", () => {
  const result = assess({ role: "deployer", deepfake: true, artisticOrSatirical: true });
  assert.deepEqual(ids(result.applies), ["art50-4-deepfake"]);
  assert.deepEqual(ids(result.excluded), []);
  assert.match(result.applies[0].note ?? "", /does not hamper the display or enjoyment/);
});

test("editorial responsibility exempts public-interest text, and nothing else does", () => {
  const reviewed = assess({
    role: "deployer",
    publicInterestText: true,
    humanEditorialReview: true,
  });
  assert.deepEqual(ids(reviewed.applies), []);
  assert.deepEqual(ids(reviewed.excluded), ["art50-4-text"]);

  const unreviewed = assess({ role: "deployer", publicInterestText: true });
  assert.deepEqual(ids(unreviewed.applies), ["art50-4-text"]);
});

test("the law-enforcement carve-out reaches several obligations at once", () => {
  const profile: SystemProfile = {
    role: "both",
    interactsWithPeople: true,
    generatesSyntheticContent: true,
    emotionRecognition: true,
    lawEnforcementAuthorised: true,
  };
  const result = assess(profile);
  assert.deepEqual(ids(result.applies), []);
  assert.deepEqual(ids(result.excluded).sort(), ["art50-1", "art50-2", "art50-3"]);
  for (const exclusion of result.excluded) {
    assert.match(exclusion.because, /criminal offences/);
  }
});

test("a system that triggers nothing produces no obligations and no noise", () => {
  const result = assess({ role: "both" });
  assert.deepEqual(ids(result.applies), []);
  assert.deepEqual(ids(result.excluded), []);
  assert.deepEqual(measures(result), []);
});

test("a system can carry several obligations at once", () => {
  const result = assess({
    role: "both",
    interactsWithPeople: true,
    generatesSyntheticContent: true,
    deepfake: true,
  });
  assert.deepEqual(ids(result.applies).sort(), ["art50-1", "art50-2", "art50-4-deepfake"]);
  assert.deepEqual(measures(result).sort(), [
    "disclose-artificial-content",
    "inform-before-interaction",
    "mark-machine-readable",
  ]);
});
