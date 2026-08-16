/**
 * An append-only record of what was disclosed, when, and on what grounds.
 *
 * Meeting a transparency obligation and being able to show that you met it are
 * two different problems, and the second one is the one that arrives with a
 * regulator's letter months later. Entries are chained by hash so that a
 * removed or edited entry can be detected — not so that anyone is prevented
 * from editing the file, which no library can do.
 */

import { createHash } from "node:crypto";

export type EventKind =
  | "assessment"
  | "disclosure-shown"
  | "content-marked"
  | "content-unmarked"
  | "exemption-claimed";

export type Entry = {
  readonly seq: number;
  readonly at: string;
  readonly kind: EventKind;
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
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly brokenAt: number; readonly reason: string };

export class EvidenceLog {
  #entries: Entry[] = [];
  #now: () => Date;

  /** The clock is injectable so that tests are not at the mercy of one. */
  constructor(options: { now?: () => Date; entries?: readonly Entry[] } = {}) {
    this.#now = options.now ?? (() => new Date());
    if (options.entries) this.#entries = [...options.entries];
  }

  get entries(): readonly Entry[] {
    return this.#entries;
  }

  append(kind: EventKind, detail: Record<string, unknown> = {}): Entry {
    const previous = this.#entries.at(-1);
    const withoutHash = {
      seq: this.#entries.length,
      at: this.#now().toISOString(),
      kind,
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
}
