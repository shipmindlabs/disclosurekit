/**
 * Which transparency obligations of Article 50 of the EU AI Act apply to a
 * given system, which ones do not and why, and which ones cannot be decided
 * from what was stated at all.
 *
 * This is a map of the article's structure, not legal advice. The regulation's
 * own text governs; an exemption that turns on judgement (is the AI "obvious to
 * a reasonably well-informed person"?) is an input here, never a conclusion
 * this code reaches on its own. Where an input is missing, the obligation goes
 * to `needsReview` rather than being resolved by guesswork.
 */

/** Who carries an obligation. The article splits them deliberately. */
export type Bearer = "provider" | "deployer";

/**
 * A yes, a no, or an admission that nobody has answered yet. "unknown" is not
 * a "no": it sends the obligation to `needsReview` instead of settling it.
 */
export type Answer = boolean | "unknown";

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
 * this library records — not something it detects. An omitted field is a no; a
 * field set to "unknown" is a question the caller still owes an answer to.
 */
export type SystemProfile = {
  /** Which side you are on. "both" answers for a self-hosted own system. */
  role: Bearer | "both";
  /** Interacts directly with natural persons — a chatbot, a voice agent. */
  interactsWithPeople?: Answer;
  /** Generates or manipulates synthetic audio, image, video or text. */
  generatesSyntheticContent?: Answer;
  /** The generated content depicts real people, places or events. */
  deepfake?: Answer;
  emotionRecognition?: Answer;
  biometricCategorisation?: Answer;

  /* Exemptions the article recognises. Each one is a claim the operator makes
   * and must be able to defend, which is why they are recorded in the log. */

  /** Art. 50(1): obvious to a reasonably well-informed, observant person. */
  obviousFromContext?: Answer;
  /** Art. 50(2): assistive standard editing that does not substantially alter the input. */
  assistiveEditingOnly?: Answer;
  /** Art. 50(4): artistic, creative, satirical or fictional work. */
  artisticOrSatirical?: Answer;
  /** Art. 50(4): text published to inform the public on matters of public interest. */
  publicInterestText?: Answer;
  /** Art. 50(4): a person holds editorial responsibility and reviewed the text. */
  humanEditorialReview?: Answer;
  /** Authorised by law to detect, prevent, investigate or prosecute criminal offences. */
  lawEnforcementAuthorised?: Answer;
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

/** An obligation that cannot be settled until a person answers a question. */
export type Review = {
  readonly obligation: Obligation;
  readonly question: string;
};

export type Assessment = {
  readonly applies: readonly Applied[];
  readonly excluded: readonly Exclusion[];
  /** Nothing here is safe to ship: each entry is an unanswered question. */
  readonly needsReview: readonly Review[];
};

/**
 * Assess a profile. Obligations addressed to a role you do not hold are left
 * out of every list: they are not your exemptions, they are someone else's
 * duties.
 */
export function assess(profile: SystemProfile): Assessment {
  const applies: Applied[] = [];
  const excluded: Exclusion[] = [];
  const needsReview: Review[] = [];

  const holds = (bearer: Bearer) => profile.role === "both" || profile.role === bearer;

  type Trigger = { readonly question: string; readonly yes: boolean; readonly unknown: boolean };

  // A single yes settles a trigger; without one, a single unknown blocks it.
  const trigger = (question: string, ...answers: readonly (Answer | undefined)[]): Trigger => ({
    question,
    yes: answers.some((a) => a === true),
    unknown: !answers.some((a) => a === true) && answers.some((a) => a === "unknown"),
  });

  type Outcome = { exempt: string } | { adapted: string } | { undecided: string };

  const claim = (
    answer: Answer | undefined,
    question: string,
    because: string,
  ): Outcome | undefined => {
    if (answer === "unknown") return { undecided: question };
    if (answer === true) return { exempt: because };
    return undefined;
  };

  const decide = (
    obligation: Obligation,
    t: Trigger,
    outcome?: Outcome,
    unresolvedManner?: string,
  ) => {
    if (!holds(obligation.bearer)) return;
    if (t.unknown) {
      needsReview.push({ obligation, question: t.question });
      return;
    }
    if (!t.yes) return;
    if (outcome && "undecided" in outcome) {
      needsReview.push({ obligation, question: outcome.undecided });
      return;
    }
    if (outcome && "exempt" in outcome) {
      excluded.push({ obligation, because: outcome.exempt });
      return;
    }
    applies.push({
      obligation,
      note: outcome && "adapted" in outcome ? outcome.adapted : undefined,
    });
    if (unresolvedManner !== undefined) {
      needsReview.push({ obligation, question: unresolvedManner });
    }
  };

  // The law-enforcement carve-out is the one exemption that reaches several
  // obligations at once, so it is checked first and named the same way in each.
  const lawEnforcement = claim(
    profile.lawEnforcementAuthorised,
    "whether the system is authorised by law for the detection, prevention, investigation or prosecution of criminal offences",
    "authorised by law for the detection, prevention, investigation or prosecution of criminal offences",
  );

  decide(
    OBLIGATIONS["art50-1"],
    trigger(
      "whether the system interacts directly with natural persons",
      profile.interactsWithPeople,
    ),
    lawEnforcement ??
      claim(
        profile.obviousFromContext,
        "whether the use of an AI system is obvious to a reasonably well-informed, observant person",
        "recorded as obvious to a reasonably well-informed, observant person",
      ),
  );

  decide(
    OBLIGATIONS["art50-2"],
    trigger(
      "whether the system generates or manipulates synthetic audio, image, video or text",
      profile.generatesSyntheticContent,
    ),
    lawEnforcement ??
      claim(
        profile.assistiveEditingOnly,
        "whether the system performs only assistive standard editing that does not substantially alter the input data",
        "recorded as assistive standard editing that does not substantially alter the input data",
      ),
  );

  decide(
    OBLIGATIONS["art50-3"],
    trigger(
      "whether the system performs emotion recognition or biometric categorisation",
      profile.emotionRecognition,
      profile.biometricCategorisation,
    ),
    lawEnforcement,
  );

  // An artistic work does not lose the duty — the article changes how it must
  // be met. Filing this as an exemption would be the library's most damaging
  // possible mistake, so it is an adaptation instead; and while the answer is
  // missing the duty still stands, with only the manner left open.
  decide(
    OBLIGATIONS["art50-4-deepfake"],
    trigger(
      "whether the content depicts real people, places or events as a deep fake",
      profile.deepfake,
    ),
    profile.artisticOrSatirical === true
      ? {
          adapted:
            "artistic, creative or satirical work: disclose in an appropriate manner that does not hamper the display or enjoyment of the work",
        }
      : undefined,
    profile.artisticOrSatirical === "unknown"
      ? "whether the work is artistic, creative, satirical or fictional, which decides the manner of disclosure but not the duty"
      : undefined,
  );

  decide(
    OBLIGATIONS["art50-4-text"],
    trigger(
      "whether the text is published to inform the public on matters of public interest",
      profile.publicInterestText,
    ),
    claim(
      profile.humanEditorialReview,
      "whether a natural or legal person holds editorial responsibility and reviewed the text",
      "a natural or legal person holds editorial responsibility and the text was reviewed",
    ),
  );

  return { applies, excluded, needsReview };
}

/** The measures a profile has to implement, deduplicated. */
export function measures(assessment: Assessment): readonly Measure[] {
  return [...new Set(assessment.applies.map((a) => a.obligation.measure))];
}
