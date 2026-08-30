/**
 * What a disclosure has to contain and where it has to appear — with the
 * wording left to the product.
 *
 * Article 50(5) sets the bar: clear and distinguishable, at the latest at the
 * time of the first interaction or exposure. That is a rule about substance and
 * placement, and this file knows both. It does not know your voice, your users
 * or your language, so it ships no sentences. The caller writes them, and a
 * notice that leaves a required element unwritten is refused rather than filled
 * in with a default nobody chose.
 */

import { assess, measures, type Assessment, type Measure, type SystemProfile } from "./policy.ts";

/**
 * The header this library sets. There is no standard header for this — the
 * regulation says what must be communicated, not how — so this is a convention
 * of this package. It is a machine-readable hint alongside the human-readable
 * statement, never a substitute for it.
 */
export const DISCLOSURE_HEADER = "AI-Disclosure";

/** The things a notice has to get across. Each one needs wording from the caller. */
export type ElementId = "ai-system" | "artificial-content" | "biometric-operation";

export type Element = {
  readonly id: ElementId;
  /** What the wording has to convey. Which words do that is not ours to decide. */
  readonly must: string;
};

export const ELEMENTS: Record<ElementId, Element> = {
  "ai-system": {
    id: "ai-system",
    must: "that the person is dealing with an AI system and not with a human",
  },
  "artificial-content": {
    id: "artificial-content",
    must: "that the content was artificially generated or manipulated",
  },
  "biometric-operation": {
    id: "biometric-operation",
    must: "that emotion recognition or biometric categorisation is in operation and that the person is exposed to it",
  },
};

const MANNER = "clear and distinguishable, and conforming to the applicable accessibility requirements";

export type Placement = {
  /** The deadline. Article 50(5) never allows it to be later than this. */
  readonly when: string;
  readonly where: string;
  readonly manner: string;
};

export type Requirement = {
  readonly measure: Measure;
  /** The obligations that demand this measure. */
  readonly obligations: readonly string[];
  /** What wording has to cover. Empty when no wording can satisfy the measure. */
  readonly elements: readonly Element[];
  readonly placement: Placement;
  /** False for machine-readable marking: it is a property of the content, not of a sentence. */
  readonly satisfiedByText: boolean;
};

type Spec = { readonly elements: readonly ElementId[]; readonly placement: Placement };

const REQUIRED: Record<Measure, Spec> = {
  "inform-before-interaction": {
    elements: ["ai-system"],
    placement: {
      when: "at the latest at the time of the first interaction",
      where: "in the interface the person is already using, before they say anything to it",
      manner: MANNER,
    },
  },
  "inform-exposed-persons": {
    elements: ["ai-system", "biometric-operation"],
    placement: {
      when: "at the latest at the time of the first exposure",
      where: "where the person meets the system, not on a policy page they would have to go looking for",
      manner: MANNER,
    },
  },
  "disclose-artificial-content": {
    elements: ["artificial-content"],
    placement: {
      when: "at the latest at the time of the first exposure to the content",
      where: "with the content itself, so that it travels wherever the content travels",
      manner: MANNER,
    },
  },
  "mark-machine-readable": {
    elements: [],
    placement: {
      when: "when the content is generated or manipulated",
      where: "inside the content, in a format a machine can detect",
      manner: "effective, interoperable, robust and reliable as far as technically feasible",
    },
  },
};

/** The wording, in the product's own voice and language. */
export type Notice = {
  /** One text per required element. Blank or absent counts as missing. */
  readonly text?: Partial<Record<ElementId, string>>;
  /** BCP 47 tag of the wording above, carried into the record of what was shown. */
  readonly locale?: string;
};

export type Disclosure = {
  /** The caller's words, in the order the elements are required. */
  readonly statement: string;
  /** The elements the statement carries. */
  readonly elements: readonly ElementId[];
  /** The obligations this disclosure exists to satisfy. */
  readonly obligations: readonly string[];
  /** Measures still unmet by a statement alone — marking, above all. */
  readonly unmetByStatement: readonly Measure[];
  /** For headers and metadata. */
  readonly machineReadable: Readonly<Record<string, string>>;
  /** Where the article keeps the duty but changes how it must be met. */
  readonly notes: readonly string[];
  readonly locale?: string;
};

/** Raised instead of emitting a notice that does not say everything it must. */
export class IncompleteDisclosure extends Error {
  readonly missing: readonly Element[] = [];

  constructor(missing: readonly Element[]) {
    super(
      "the notice is missing wording for a required element: " +
        missing.map((element) => `${element.id} — ${element.must}`).join("; "),
    );
    this.name = "IncompleteDisclosure";
    this.missing = missing;
  }
}

/**
 * What a profile has to disclose, and where. This is the part of the notice the
 * package can supply: the elements, the deadline, the placement. The sentences
 * that carry them are the caller's.
 */
export function requirements(profile: SystemProfile): readonly Requirement[] {
  return requirementsOf(assess(profile));
}

function requirementsOf(assessment: Assessment): readonly Requirement[] {
  return measures(assessment).map((measure) => {
    const spec = REQUIRED[measure];
    return {
      measure,
      obligations: assessment.applies
        .filter((applied) => applied.obligation.measure === measure)
        .map((applied) => applied.obligation.id),
      elements: spec.elements.map((id) => ELEMENTS[id]),
      placement: spec.placement,
      satisfiedByText: spec.elements.length > 0,
    };
  });
}

/**
 * Build the disclosure for a profile from the caller's wording.
 *
 * Throws `IncompleteDisclosure` when an element the profile requires has no
 * text. What cannot be checked here is whether a sentence says what it must in
 * the language it was written in; a person still has to read it. The check is
 * that nothing was left blank, which is the failure a library can catch.
 *
 * `unmetByStatement` is the other honest part: telling someone in words that
 * content is AI-generated does not embed a machine-readable mark, and Article
 * 50(2) asks for both.
 */
export function disclose(profile: SystemProfile, notice: Notice = {}): Disclosure {
  const assessment = assess(profile);
  const required = requirementsOf(assessment);
  const elements = [...new Set(required.flatMap((r) => r.elements.map((e) => e.id)))];

  const text = notice.text ?? {};
  const wording = (id: ElementId) => (text[id] ?? "").trim();

  const missing = elements.filter((id) => wording(id) === "").map((id) => ELEMENTS[id]);
  if (missing.length > 0) throw new IncompleteDisclosure(missing);

  const obligations = assessment.applies.map((a) => a.obligation.id);
  const notes = assessment.applies
    .filter((a) => a.note !== undefined)
    .map((a) => `${a.obligation.article}: ${a.note}`);

  const machineReadable: Record<string, string> = {};
  if (obligations.length > 0) {
    machineReadable[DISCLOSURE_HEADER] = obligations.join(", ");
  }

  return {
    statement: [...new Set(elements.map(wording))].join(" "),
    elements,
    obligations,
    unmetByStatement: required.filter((r) => !r.satisfiedByText).map((r) => r.measure),
    machineReadable,
    notes,
    locale: notice.locale,
  };
}
