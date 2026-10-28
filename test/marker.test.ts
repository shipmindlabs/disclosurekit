import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { EvidenceLog } from "../src/log.ts";
import {
  markContent,
  UnmarkedContent,
  type Marker,
  type MarkResult,
  type MarkTarget,
} from "../src/marker.ts";

const fixedClock = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 16, 12, 0, tick++));
};

const sha256 = (content: Uint8Array | string): string => {
  const hash = createHash("sha256");
  if (typeof content === "string") {
    hash.update(content, "utf8");
  } else {
    hash.update(content);
  }
  return hash.digest("hex");
};

/** A fake that really does write something into the content. */
class AppendedComment implements Marker {
  readonly name = "appended-comment";

  async mark(target: MarkTarget): Promise<MarkResult> {
    return {
      marked: true,
      method: "text-comment",
      content: `${String(target.content)}\n<!-- artificially generated -->`,
    };
  }
}

/** The dangerous fake: it reports a signature and changes nothing. */
class PretendSigner implements Marker {
  readonly name = "pretend-signer";

  async mark(target: MarkTarget): Promise<MarkResult> {
    return { marked: true, method: "c2pa", content: target.content, detail: "signed" };
  }
}

test("a real mark reaches the log with its method and a digest of what went out", async () => {
  const log = new EvidenceLog({ now: fixedClock() });
  const result = await markContent(
    new AppendedComment(),
    { content: "A poem about the sea.", mediaType: "text/plain" },
    log,
  );

  assert.equal(result.marked, true);
  assert.match(String(result.content), /artificially generated/);

  const [entry] = log.entries;
  assert.equal(entry.kind, "content-marked");
  assert.equal(entry.detail.marker, "appended-comment");
  assert.equal(entry.detail.method, "text-comment");
  assert.equal(entry.detail.mediaType, "text/plain");
  assert.equal(entry.detail.hash, sha256(result.content));
  assert.notEqual(entry.detail.hash, sha256("A poem about the sea."));
  assert.equal(log.verify().ok, true);
});

// The claim is not the evidence. A marker that changed no byte embedded no
// mark, and a log that took its word for it would be worse than no log.
test("a marker that claims a mark and changes nothing is recorded as unmarked", async () => {
  const log = new EvidenceLog({ now: fixedClock() });
  const pixels = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const result = await markContent(
    new PretendSigner(),
    { content: pixels, mediaType: "image/png" },
    log,
  );

  assert.equal(result.marked, false);
  assert.equal(result.content, pixels);
  assert.match(result.detail ?? "", /no byte differs from the input/);

  assert.deepEqual(
    log.entries.map((entry) => entry.kind),
    ["content-unmarked"],
  );
  const [entry] = log.entries;
  assert.equal(entry.detail.marker, "pretend-signer");
  assert.equal(entry.detail.method, "c2pa");
  assert.equal(entry.detail.mediaType, "image/png");
  assert.match(String(entry.detail.reason), /reported a mark by c2pa/);
  assert.match(String(entry.detail.reason), /nothing was marked/);
  assert.equal(entry.detail.hash, undefined);
  assert.equal(log.verify().ok, true);
});

test("the default marker writes the gap it leaves, with the article behind it", async () => {
  const log = new EvidenceLog({ now: fixedClock() });
  const result = await markContent(
    new UnmarkedContent(),
    { content: "generated text", mediaType: "text/plain" },
    log,
  );

  assert.equal(result.marked, false);
  assert.equal(result.content, "generated text");

  const [entry] = log.entries;
  assert.equal(entry.kind, "content-unmarked");
  assert.equal(entry.detail.marker, "unmarked");
  assert.equal(entry.detail.method, "none");
  assert.match(String(entry.detail.reason), /not met by this deployment/);
});

test("marker records chain with the rest of the evidence and survive the export", async () => {
  const log = new EvidenceLog({ now: fixedClock() });
  log.append("assessment", { obligations: ["art50-2"] });
  await markContent(new AppendedComment(), { content: "One", mediaType: "text/plain" }, log);
  await markContent(new PretendSigner(), { content: "Two", mediaType: "text/plain" }, log);

  assert.deepEqual(
    log.entries.map((entry) => entry.kind),
    ["assessment", "content-marked", "content-unmarked"],
  );
  assert.equal(EvidenceLog.fromJSONL(log.toJSONL()).verify().ok, true);
});
