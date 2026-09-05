/**
 * disclosurekit — the transparency obligations of Article 50 of the EU AI Act,
 * as code you can run: what applies, what a notice must contain and where it
 * goes, what was not covered, and a record that it happened.
 *
 * It does not write your disclosure, it does not mark content, and it is not
 * legal advice. See README.md.
 */

export {
  assess,
  inputsOf,
  measures,
  OBLIGATIONS,
  RULES_VERSION,
  type Answer,
  type Applied,
  type Assessment,
  type Bearer,
  type Exclusion,
  type Measure,
  type Obligation,
  type Review,
  type StatedInput,
  type SystemProfile,
} from "./policy.ts";

export {
  disclose,
  requirements,
  DISCLOSURE_HEADER,
  ELEMENTS,
  IncompleteDisclosure,
  type Disclosure,
  type Element,
  type ElementId,
  type Notice,
  type Placement,
  type Requirement,
} from "./disclosure.ts";

export {
  UnmarkedContent,
  type Marker,
  type MarkResult,
  type MarkTarget,
} from "./marker.ts";

export {
  recordDecision,
  EvidenceLog,
  EVIDENCE_FORMAT,
  GENESIS,
  HASH_ALGORITHM,
  type Entry,
  type EventKind,
  type VerifyResult,
} from "./log.ts";

export {
  disclosureFor,
  withDisclosure,
  type Handler,
  type MiddlewareOptions,
} from "./middleware.ts";
