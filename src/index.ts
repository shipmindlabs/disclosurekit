/**
 * disclosurekit — the transparency obligations of Article 50 of the EU AI Act,
 * as code you can run: what applies, what to say, what was not covered, and a
 * record that it happened.
 *
 * It does not mark content and it is not legal advice. See README.md.
 */

export {
  assess,
  measures,
  OBLIGATIONS,
  type Applied,
  type Assessment,
  type Bearer,
  type Exclusion,
  type Measure,
  type Obligation,
  type SystemProfile,
} from "./policy.ts";

export {
  disclose,
  DISCLOSURE_HEADER,
  type Disclosure,
  type DisclosureOptions,
} from "./disclosure.ts";

export {
  UnmarkedContent,
  type Marker,
  type MarkResult,
  type MarkTarget,
} from "./marker.ts";

export {
  EvidenceLog,
  GENESIS,
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
