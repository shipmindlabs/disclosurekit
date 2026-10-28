/**
 * The seam where content marking plugs in.
 *
 * This library deliberately implements no marker. Machine-readable marking of
 * synthetic media means C2PA Content Credentials or a watermark, and those have
 * maintained implementations already — c2pa-rs, c2pa-node, c2pa-js from the
 * Content Authenticity Initiative. Writing a fourth one here would be worse
 * than using theirs, and a marker that only appears to sign is the single most
 * dangerous thing this package could ship.
 *
 * So: an interface, a default that says plainly that nothing was marked, and
 * one function that runs a marker and writes down what it did.
 */

import { HASH_ALGORITHM, type EvidenceLog } from "./log.ts";

import { createHash } from "node:crypto";

export type MarkTarget = {
  /** What is being marked, as bytes or text. */
  readonly content: Uint8Array | string;
  /** Media type, e.g. "image/jpeg". */
  readonly mediaType: string;
};

export type MarkResult = {
  /** True only when a marker actually wrote something into the content. */
  readonly marked: boolean;
  /** How it was marked, or why it was not. */
  readonly method: string;
  /** The content to serve. Unchanged when marked is false. */
  readonly content: Uint8Array | string;
  readonly detail?: string;
};

export interface Marker {
  readonly name: string;
  mark(target: MarkTarget): Promise<MarkResult>;
}

/**
 * The default marker: it marks nothing and says so.
 *
 * Article 50(2) is a provider obligation to embed a machine-readable mark. A
 * deployment that has not wired up a real marker has not met it, and this
 * result is what makes that visible in the evidence log instead of leaving a
 * silent gap.
 */
export class UnmarkedContent implements Marker {
  readonly name = "unmarked";

  async mark(target: MarkTarget): Promise<MarkResult> {
    return {
      marked: false,
      method: "none",
      content: target.content,
      detail:
        "no marker configured: machine-readable marking under Article 50(2) is not met by this deployment",
    };
  }
}

/**
 * Run a marker and record the outcome.
 *
 * A mark that nobody can show happened is half of Article 50(2), so the result
 * goes on the evidence log: `content-marked` with the marker, the method and a
 * digest of the content that went out, or `content-unmarked` with the reason
 * nothing was marked.
 *
 * A marker that reports success while returning the input byte for byte is
 * recorded as unmarked, with the contradiction as the reason — and the result
 * handed back says `marked: false` too, because the caller is about to serve
 * content that carries no mark. Trusting the claim over the bytes is how a
 * deployment ends up with a log full of marks that no detector can find.
 *
 * The digest is taken with the algorithm each entry names in its `alg` field,
 * over the bytes of the content as served, so it can be recomputed later from
 * the content alone.
 */
export async function markContent(
  marker: Marker,
  target: MarkTarget,
  log: EvidenceLog,
): Promise<MarkResult> {
  const result = await marker.mark(target);
  const hash = digestOf(result.content);
  const unchanged = hash === digestOf(target.content);

  if (result.marked && unchanged) {
    const reason =
      `${marker.name} reported a mark by ${result.method} and returned the content unchanged: ` +
      "no byte differs from the input, so nothing was marked";
    log.append("content-unmarked", {
      marker: marker.name,
      mediaType: target.mediaType,
      method: result.method,
      reason,
    });
    return { ...result, marked: false, content: target.content, detail: reason };
  }

  if (result.marked) {
    log.append("content-marked", {
      marker: marker.name,
      mediaType: target.mediaType,
      method: result.method,
      hash,
    });
    return result;
  }

  log.append("content-unmarked", {
    marker: marker.name,
    mediaType: target.mediaType,
    method: result.method,
    reason: result.detail ?? "the marker reported no mark and gave no reason",
  });
  return result;
}

function digestOf(content: Uint8Array | string): string {
  const hash = createHash(HASH_ALGORITHM);
  if (typeof content === "string") {
    hash.update(content, "utf8");
  } else {
    hash.update(content);
  }
  return hash.digest("hex");
}
