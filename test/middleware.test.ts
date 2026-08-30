import { test } from "node:test";
import assert from "node:assert/strict";

import { IncompleteDisclosure } from "../src/disclosure.ts";
import { EvidenceLog } from "../src/log.ts";
import { DISCLOSURE_HEADER, withDisclosure } from "../src/middleware.ts";
import type { SystemProfile } from "../src/policy.ts";

const chatbot: SystemProfile = { role: "provider", interactsWithPeople: true };
const notice = { text: { "ai-system": "You are chatting with our AI assistant." }, locale: "en-GB" };

const jsonHandler = () =>
  new Response(JSON.stringify({ answer: "42" }), {
    headers: { "content-type": "application/json" },
  });

test("the header rides on every response", async () => {
  const handler = withDisclosure(jsonHandler, chatbot, notice);
  const response = await handler(new Request("https://example.com/chat"));
  assert.equal(response.headers.get(DISCLOSURE_HEADER), "art50-1");
  assert.deepEqual(await response.json(), { answer: "42" });
});

// Wrapping is where missing wording should hurt: at start-up, not in front of a
// user halfway through a request.
test("a handler cannot be wrapped without the wording its profile requires", () => {
  assert.throws(() => withDisclosure(jsonHandler, chatbot), IncompleteDisclosure);
});

// A response body belongs to the service. Reshaping it without being asked is
// how a middleware breaks a client it never heard of.
test("the body is left alone unless a key is named", async () => {
  const untouched = await withDisclosure(jsonHandler, chatbot, notice)(
    new Request("https://example.com/chat"),
  );
  assert.deepEqual(await untouched.json(), { answer: "42" });

  const injected = await withDisclosure(jsonHandler, chatbot, {
    ...notice,
    injectJsonKey: "disclosure",
  })(new Request("https://example.com/chat"));
  assert.deepEqual(await injected.json(), {
    answer: "42",
    disclosure: "You are chatting with our AI assistant.",
  });
});

test("a non-object JSON body is not wrapped into a shape nobody agreed to", async () => {
  const arrayHandler = () =>
    new Response(JSON.stringify([1, 2, 3]), { headers: { "content-type": "application/json" } });
  const response = await withDisclosure(arrayHandler, chatbot, {
    ...notice,
    injectJsonKey: "disclosure",
  })(new Request("https://example.com/chat"));
  assert.deepEqual(await response.json(), [1, 2, 3]);
});

test("a non-JSON response keeps its body and still gets the header", async () => {
  const textHandler = () => new Response("hello", { headers: { "content-type": "text/plain" } });
  const response = await withDisclosure(textHandler, chatbot, {
    ...notice,
    injectJsonKey: "disclosure",
  })(new Request("https://example.com/chat"));
  assert.equal(await response.text(), "hello");
  assert.equal(response.headers.get(DISCLOSURE_HEADER), "art50-1");
});

test("status and existing headers survive the wrapper", async () => {
  const handler = withDisclosure(
    () =>
      new Response("no", { status: 418, statusText: "I'm a teapot", headers: { "x-trace": "abc" } }),
    chatbot,
    notice,
  );
  const response = await handler(new Request("https://example.com/chat"));
  assert.equal(response.status, 418);
  assert.equal(response.headers.get("x-trace"), "abc");
});

test("a system with no obligations is passed through untouched", async () => {
  const handler = withDisclosure(jsonHandler, { role: "both" });
  const response = await handler(new Request("https://example.com/chat"));
  assert.equal(response.headers.get(DISCLOSURE_HEADER), null);
});

test("the log records the assessment once and each disclosure served", async () => {
  const log = new EvidenceLog();
  const handler = withDisclosure(jsonHandler, chatbot, { ...notice, log });

  await handler(new Request("https://example.com/chat"));
  await handler(new Request("https://example.com/chat/stream"));

  assert.deepEqual(
    log.entries.map((entry) => entry.kind),
    ["assessment", "disclosure-shown", "disclosure-shown"],
  );
  assert.equal(log.entries[0].detail.locale, "en-GB");
  assert.equal(log.entries[2].detail.path, "/chat/stream");
  assert.equal(log.verify().ok, true);
});
