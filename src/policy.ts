/**
 * Which transparency obligations of Article 50 of the EU AI Act apply to a
 * given system, and — just as usefully — which ones do not and why.
 *
 * This is a map of the article's structure, not legal advice. The regulation's
 * own text governs; an exemption that turns on judgement (is the AI "obvious to
 * a reasonably well-informed person"?) is an input here, never a conclusion
 * this code reaches on its own.
 */

/** Who carries an obligation. The article splits them deliberately. */
export type Bearer = "provider" | "deployer";

/** What the obligated party has to actually do. */
export type Measure =
  | "inform-before-interaction"
  | "mark-machine-readable"
  | "inform-exposed-persons"
  | "disclose-artificial-content";

export type Obligation = {
  readonly id: string;
  readonly article: string;
  readonly bearer: Bearer;
  readonly summary: string;
  readonly measure: Measure;
};

/**
 * A description of the system. Every field is something a person decides and
 * this library records — not something it detects.
 */
export type SystemProfile = {
  /** Which side you are on. "both" answers for a self-hosted own system. */
  role: Bearer | "both";
  /** Interacts directly with natural persons — a chatbot, a voice agent. */
  interactsWithPeople?: boolean;
  /** Generates or manipulates synthetic audio, image, video or text. */
  generatesSyntheticContent?: boolean;
  /** The generated content depicts real people, places or events. */
  deepfake?: boolean;
  emotionRecognition?: boolean;
  biometricCategorisation?: boolean;

  /* Exemptions the article recognises. Each one is a claim the operator makes
   * and must be able to defend, which is why they are recorded in the log. */

  /** Art. 50(1): obvious to a reasonably well-informed, observant person. */
  obviousFromContext?: boolean;
  /** Art. 50(2): assistive standard editing that does not substantially alter the input. */
  assistiveEditingOnly?: boolean;
  /** Art. 50(4): artistic, creative, satirical or fictional work. */
  artisticOrSatirical?: boolean;
  /** Art. 50(4): text published to inform the public on matters of public interest. */
  publicInterestText?: boolean;
  /** Art. 50(4): a person holds editorial responsibility and reviewed the text. */
  humanEditorialReview?: boolean;
  /** Authorised by law to detect, prevent, investigate or prosecute criminal offences. */
  lawEnforcementAuthorised?: boolean;
};

export const OBLIGATIONS: Record<string, Obligation> = {
  "art50-1": {
    id: "art50-1",
    article: "Article 50(1)",
    bearer: "provider",
    summary: "People must be informed they are interacting with an AI system.",
    measure: "inform-before-interaction",
  },
  "art50-2": {
    id: "art50-2",
    article: "Article 50(2)",
    bearer: "provider",
    summary:
      "Synthetic audio, image, video or text must be marked in a machine-readable format and detectable as artificially generated or manipulated.",
    measure: "mark-machine-readable",
  },
  "art50-3": {
    id: "art50-3",
    article: "Article 50(3)",
    bearer: "deployer",
    summary:
      "People exposed to emotion recognition or biometric categorisation must be informed of its operation.",
    measure: "inform-exposed-persons",
  },
  "art50-4-deepfake": {
    id: "art50-4-deepfake",
    article: "Article 50(4)",
    bearer: "deployer",
    summary: "Deep fake content must be disclosed as artificially generated or manipulated.",
    measure: "disclose-artificial-content",
  },
  "art50-4-text": {
    id: "art50-4-text",
    article: "Article 50(4)",
    bearer: "deployer",
    summary:
      "AI-generated text published to inform the public on matters of public interest must be disclosed.",
    measure: "disclose-artificial-content",
  },
} as const;

/** An obligation that applies, sometimes in an adapted form. */
export type Applied = {
  readonly obligation: Obligation;
  /** Set when the article keeps the duty but changes how it must be met. */
  readonly note?: string;
};

/** An obligation that was considered and set aside, with the reason. */
export type Exclusion = {
  readonly obligation: Obligation;
  readonly because: string;
};

export type Assessment = {
  readonly applies: readonly Applied[];
  readonly excluded: readonly Exclusion[];
};

/**
 * Assess a profile. Obligations addressed to a role you do not hold are left
 * out of both lists: they are not your exemptions, they are someone else's
 * duties.
 */
export function assess(profile: SystemProfile): Assessment {
  const applies: Applied[] = [];
  const excluded: Exclusion[] = [];

  const holds = (bearer: Bearer) => profile.role === "both" || profile.role === bearer;
  const decide = (
    obligation: Obligation,
    triggered: boolean,
    outcome?: { exempt: string } | { adapted: string },
  ) => {
    if (!triggered || !holds(obligation.bearer)) return;
    if (outcome && "exempt" in outcome) {
      excluded.push({ obligation, because: outcome.exempt });
      return;
    }
    applies.push({ obligation, note: outcome?.adapted });
  };

  // The law-enforcement carve-out is the one exemption that reaches several
  // obligations at once, so it is checked first and named the same way in each.
  const lawEnforcement = profile.lawEnforcementAuthorised
    ? {
        exempt:
          "authorised by law for the detection, prevention, investigation or prosecution of criminal offences",
      }
    : undefined;

  decide(
    OBLIGATIONS["art50-1"],
    profile.interactsWithPeople === true,
    lawEnforcement ??
      (profile.obviousFromContext
        ? { exempt: "recorded as obvious to a reasonably well-informed, observant person" }
        : undefined),
  );

  decide(
    OBLIGATIONS["art50-2"],
    profile.generatesSyntheticContent === true,
    lawEnforcement ??
      (profile.assistiveEditingOnly
        ? {
            exempt:
              "recorded as assistive standard editing that does not substantially alter the input data",
          }
        : undefined),
  );

  decide(
    OBLIGATIONS["art50-3"],
    profile.emotionRecognition === true || profile.biometricCategorisation === true,
    lawEnforcement,
  );

  // An artistic work does not lose the duty — the article changes how it must
  // be met. Filing this as an exemption would be the library's most damaging
  // possible mistake, so it is an adaptation instead.
  decide(
    OBLIGATIONS["art50-4-deepfake"],
    profile.deepfake === true,
    profile.artisticOrSatirical
      ? {
          adapted:
            "artistic, creative or satirical work: disclose in an appropriate manner that does not hamper the display or enjoyment of the work",
        }
      : undefined,
  );

  decide(
    OBLIGATIONS["art50-4-text"],
    profile.publicInterestText === true,
    profile.humanEditorialReview
      ? {
          exempt:
            "a natural or legal person holds editorial responsibility and the text was reviewed",
        }
      : undefined,
  );

  return { applies, excluded };
}

/** The measures a profile has to implement, deduplicated. */
export function measures(assessment: Assessment): readonly Measure[] {
  return [...new Set(assessment.applies.map((a) => a.obligation.measure))];
}
