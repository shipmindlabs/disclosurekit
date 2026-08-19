# disclosurekit

The transparency rules of Article 50 of the EU AI Act, as code you can run.

Since 2 August 2026 a chatbot has to say it is a chatbot, a deep fake has to be
disclosed, and synthetic media has to carry a machine-readable mark. The rules
themselves are short. What takes the time is working out which of them apply to
your system, saying so in the right place, and being able to show months later
that you did.

This package does the first, the second and the third. It does **not** mark
content, and it is **not** legal advice.

## What a run looks like

```console
$ npm run demo
Obligations that apply:
  Article 50(1)    People must be informed they are interacting with an AI system.
  Article 50(2)    Synthetic audio, image, video or text must be marked in a machine-readable format and detectable as artificially generated or manipulated.
  Article 50(4)    Deep fake content must be disclosed as artificially generated or manipulated.

What the person is told:
  "You are interacting with an AI system. This content was generated or altered by an AI system."

Not covered by saying it:
  mark-machine-readable — needs a marker; none is configured

One request through the middleware:
  AI-Disclosure: art50-1, art50-2, art50-4-deepfake
  body: {"answer":"The office opens at nine.","disclosure":"You are interacting with an AI system. This content was generated or altered by an AI system."}

Evidence log:
  #0 assessment 844da3ce804b…
  #1 disclosure-shown cc9f9d07e825…
  chain verifies: true
```

That third block is the one that matters. Telling someone in words that content
is AI-generated does not embed a machine-readable mark, and Article 50(2) asks
for both. A library that reported "compliant" there would be worse than no
library.

## Use

```ts
import { withDisclosure, EvidenceLog } from "disclosurekit";

const log = new EvidenceLog();

export default withDisclosure(
  handler,
  { role: "provider", interactsWithPeople: true },
  { log },
);
```

Built on the Web `Request` and `Response`, so it works in Hono, Next.js route
handlers, Bun, Deno, Cloudflare Workers, or anything else fetch-shaped. The
header rides on every response; the body is only touched if you name a key with
`injectJsonKey`, because a response body belongs to the service.

Ask directly when you want to render the disclosure yourself:

```ts
import { assess, disclose } from "disclosurekit";

const profile = { role: "deployer", deepfake: true, artisticOrSatirical: true } as const;

assess(profile).applies[0].note;
// "artistic, creative or satirical work: disclose in an appropriate manner that
//  does not hamper the display or enjoyment of the work"
```

## What it will not do

**It does not decide your exemptions.** Whether the AI is "obvious to a
reasonably well-informed person", whether editing is "assistive standard
editing", whether a human held editorial responsibility — those are judgements
you make. They go in as inputs, they come back out in the record with the reason
attached, and they are never inferred.

**It does not mark content.** Machine-readable marking means C2PA Content
Credentials or a watermark, and the Content Authenticity Initiative maintains
implementations already (`c2pa-rs`, `c2pa-node`, `c2pa-js`). Writing a fourth
one here would be worse than using theirs, and a marker that merely appears to
sign is the most dangerous thing this package could ship. There is a `Marker`
interface to plug one in, and the default one reports plainly that nothing was
marked.

**It does not tell you an obligation is someone else's problem in a way you can
lean on.** Article 50 splits duties between provider and deployer; obligations
addressed to a role you did not claim appear in neither list, because they are
not your exemptions.

**It is not legal advice.** This is a map of the article's structure. The text
of Regulation (EU) 2024/1689 governs.

## The evidence log

Meeting an obligation and being able to show you met it are different problems,
and the second arrives with a letter months later. Entries are chained by hash,
so a removed or edited entry is detectable and the check names which one:

```ts
log.verify();
// { ok: false, brokenAt: 1, reason: "contents do not match the recorded hash" }
```

This does not stop anyone from editing the file — no library can — it makes the
edit show.

## Install

Node 22.18 or newer, which runs the TypeScript sources directly. No runtime
dependencies.

```bash
npm install disclosurekit
```

## Status

Early. Article 50 is covered; the rest of the AI Act is not, and the parts below
are honest gaps rather than oversights.

| | |
|---|---|
| Covered | Article 50(1)–(5): interaction, synthetic content, emotion recognition and biometric categorisation, deep fakes, public-interest text |
| Disclosure | statement, `AI-Disclosure` header, optional JSON key |
| Evidence | hash-chained append-only log, JSON round trip |
| Not yet | ready-made UI components, marker adapters for C2PA, transform-survival checks, other articles of the Act |

The `AI-Disclosure` header is this package's own convention. No standard header
exists — the regulation says what must be communicated, not how — and it is a
machine-readable hint alongside the human-readable statement, never a substitute
for it.

## Development

```bash
npm test        # node --test, no dependencies needed
npm run demo    # the transcript above
npm run typecheck   # needs: npm i -D typescript
```

## License

MIT

Maintained by [Shipmind Labs](https://shipmindlabs.com).
