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
 * So: an interface, and a default that says plainly that nothing was marked.
 */

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
