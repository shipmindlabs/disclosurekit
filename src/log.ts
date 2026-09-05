/**
 * An append-only record of what was disclosed, when, and on what grounds.
 *
 * Meeting a transparency obligation and being able to show that you met it are
 * two different problems, and the second one is the one that arrives with a
 * regulator's letter months later. Two things follow. Entries are chained by
 * hash, so a removed or edited entry can be detected — not so that anyone is
 * prevented from editing the file, which no library can do. And every entry
 * names its own format, hash algorithm, timestamp and rule version, so that the
 * record can be read and re-verified by anything that can parse JSON and
 * compute a SHA-256, long after this package is gone from the project.
 *
 * The recipe, for whoever has only the file: take a record, remove its `hash`
 * field, serialise what is left as JSON with object keys sorted and no
 * whitespace, SHA-256 it, compare. `previousHash` is the hash of the record
 * before it; the first one is GENESIS.
 */

import { createHash } from "node:crypto";

import type { Disclosure } from "./disclosure.ts";
import { assess, inputsOf, RULES_VERSION, type SystemProfile } from "./policy.ts";

export type EventKind =
  | "assessment"
  | "disclosure-shown"
  | "content-marked"
  | "content-unmarked"
  | "exemption-claimed";

/** The shape of a record, carried by every record so that a line explains itself. */
export const EVIDENCE_FORMAT = "disclosurekit.evidence/1";

/** The digest taken over a record's canonical JSON, written down for the same reason. */
export const HASH_ALGORITHM = "sha256";

export type Entry = {
  readonly format: string;
  readonly alg: string;
  readonly seq: number;
  readonly at: string;
  readonly kind: EventKind;
  /** The version of the rules the decision was made under. */
  readonly rules: string;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly previousHash: string;
  readonly hash: string;
};

/** The chain's anchor: there is no entry before the first one. */
export const GENESIS = "0".repeat(64);

/** Stable stringify, so an unchanged entry always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
}

function digest(parts: Omit<Entry, "hash">): string {
  return createHash(HASH_ALGORITHM).update(canonical(parts)).digest("hex");
}

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly brokenAt: number; readonly reason: string };

export class EvidenceLog {
  #entries: Entry[] = [];
  #now: () => Date;
  #rules: string;

  /**
   * The clock is injectable so that tests are not at the mercy of one. The rule
   * version is injectable so that a decision taken under an older reading of
   * the article can be recorded as what it was.
   */
  constructor(options: { now?: () => Date; entries?: readonly Entry[]; rules?: string } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#rules = options.rules ?? RULES_VERSION;
    if (options.entries) this.#entries = [...options.entries];
  }

  get entries(): readonly Entry[] {
    return this.#entries;
  }

  append(kind: EventKind, detail: Record<string, unknown> = {}): Entry {
    const previous = this.#entries.at(-1);
    const withoutHash = {
      format: EVIDENCE_FORMAT,
      alg: HASH_ALGORITHM,
      seq: this.#entries.length,
      at: this.#now().toISOString(),
      kind,
      rules: this.#rules,
      detail,
      previousHash: previous?.hash ?? GENESIS,
    };
    const entry: Entry = { ...withoutHash, hash: digest(withoutHash) };
    this.#entries.push(entry);
    return entry;
  }

  /** Recompute the chain and report the first entry that does not hold. */
  verify(): VerifyResult {
    let previousHash = GENESIS;
    for (const [index, entry] of this.#entries.entries()) {
      if (entry.seq !== index) {
        return { ok: false, brokenAt: index, reason: `expected seq ${index}, found ${entry.seq}` };
      }
      if (entry.previousHash !== previousHash) {
        return { ok: false, brokenAt: index, reason: "does not follow the previous entry" };
      }
      // A record this version cannot read is not one it can vouch for either.
      if (entry.format !== EVIDENCE_FORMAT) {
        return {
          ok: false,
          brokenAt: index,
          reason: `record format ${entry.format} is not one this version can verify`,
        };
      }
      if (entry.alg !== HASH_ALGORITHM) {
        return {
          ok: false,
          brokenAt: index,
          reason: `hash algorithm ${entry.alg} is not one this version can verify`,
        };
      }
      const { hash, ...rest } = entry;
      if (digest(rest) !== hash) {
        return { ok: false, brokenAt: index, reason: "contents do not match the recorded hash" };
      }
      previousHash = hash;
    }
    return { ok: true };
  }

  toJSON(): readonly Entry[] {
    return this.entries;
  }

  static fromJSON(entries: readonly Entry[]): EvidenceLog {
    return new EvidenceLog({ entries });
  }

  /**
   * The export: one record per line, keys sorted, no whitespace — the same
   * bytes that were hashed, so a line can be checked where it lies. A line per
   * record also means the file appends, greps and splits with tools that have
   * never heard of this package.
   */
  toJSONL(): string {
    return this.#entries.map((entry) => canonical(entry) + "\n").join("");
  }

  static fromJSONL(text: string): EvidenceLog {
    const entries = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Entry);
    return new EvidenceLog({ entries });
  }
}

/**
 * Record one disclosure decision: the inputs exactly as they were stated, what
 * the rules made of them, and the words that were shown.
 *
 * The record is written to be legible on its own. It repeats the article and
 * the summary of each obligation rather than only its id, keeps the reason for
 * every exemption and the text of every unanswered question, and names the
 * questions nobody answered — because the reader months from now will have the
 * file and not this code.
 */
export function recordDecision(
  log: EvidenceLog,
  profile: SystemProfile,
  disclosure: Disclosure,
): Entry {
  const assessment = assess(profile);
  return log.append("assessment", {
    inputs: inputsOf(profile),
    applies: assessment.applies.map(({ obligation, note }) => ({
      obligation: obligation.id,
      article: obligation.article,
      measure: obligation.measure,
      summary: obligation.summary,
      ...(note === undefined ? {} : { note }),
    })),
    excluded: assessment.excluded.map(({ obligation, because }) => ({
      obligation: obligation.id,
      article: obligation.article,
      because,
    })),
    needsReview: assessment.needsReview.map(({ obligation, question }) => ({
      obligation: obligation.id,
      article: obligation.article,
      question,
    })),
    unmetByStatement: disclosure.unmetByStatement,
    elements: disclosure.elements,
    statement: disclosure.statement,
    locale: disclosure.locale,
  });
}
