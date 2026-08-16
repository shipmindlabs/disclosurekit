/**
 * A run through the whole package: assess a system, serve one request with the
 * disclosure attached, and check the record afterwards.
 *
 *   npm run demo
 */

import { assess, disclose, EvidenceLog, withDisclosure, type SystemProfile } from "../src/index.ts";

// A support assistant that also generates images of real places for the user.
const profile: SystemProfile = {
  role: "both",
  interactsWithPeople: true,
  generatesSyntheticContent: true,
  deepfake: true,
};

const assessment = assess(profile);
console.log("Obligations that apply:");
for (const { obligation, note } of assessment.applies) {
  console.log(`  ${obligation.article.padEnd(16)} ${obligation.summary}`);
  if (note) console.log(`  ${" ".repeat(16)} note: ${note}`);
}

const disclosure = disclose(profile);
console.log(`\nWhat the person is told:\n  "${disclosure.statement}"`);

if (disclosure.unmetByStatement.length > 0) {
  console.log("\nNot covered by saying it:");
  for (const measure of disclosure.unmetByStatement) {
    console.log(`  ${measure} — needs a marker; none is configured`);
  }
}

const log = new EvidenceLog();
const handler = withDisclosure(
  () => new Response(JSON.stringify({ answer: "The office opens at nine." }), {
    headers: { "content-type": "application/json" },
  }),
  profile,
  { log, injectJsonKey: "disclosure" },
);

const response = await handler(new Request("https://example.com/chat"));
console.log("\nOne request through the middleware:");
console.log(`  AI-Disclosure: ${response.headers.get("AI-Disclosure")}`);
console.log(`  body: ${await response.text()}`);

console.log("\nEvidence log:");
for (const entry of log.entries) {
  console.log(`  #${entry.seq} ${entry.kind} ${entry.hash.slice(0, 12)}…`);
}
console.log(`  chain verifies: ${log.verify().ok}`);
