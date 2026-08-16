/**
 * A wrapper that attaches the disclosure to what a service already returns.
 *
 * Built on the Web Request and Response, so it works anywhere those exist —
 * Hono, Next.js route handlers, Bun, Deno, Cloudflare Workers, or a plain
 * fetch-style server — without this package knowing about any of them.
 */

import { disclose, DISCLOSURE_HEADER, type Disclosure, type DisclosureOptions } from "./disclosure.ts";
import type { EvidenceLog } from "./log.ts";
import type { SystemProfile } from "./policy.ts";

export type Handler = (request: Request) => Response | Promise<Response>;

export type MiddlewareOptions = DisclosureOptions & {
  /** Records every disclosure served, for the day someone asks. */
  readonly log?: EvidenceLog;
  /**
   * Adds the statement to JSON responses under this key. Off by default: a
   * response body belongs to the service, and silently reshaping it would be
   * the kind of surprise that gets a library removed.
   */
  readonly injectJsonKey?: string;
};

/**
 * Wrap a handler so its responses carry the disclosure.
 *
 * The header goes on every response; the body is touched only when
 * `injectJsonKey` says so. Nothing here marks content — see `Marker` — so a
 * profile that needs machine-readable marking still needs a marker wired up,
 * and the disclosure reports that in `unmetByStatement`.
 */
export function withDisclosure(
  handler: Handler,
  profile: SystemProfile,
  options: MiddlewareOptions = {},
): Handler {
  const disclosure = disclose(profile, options);
  options.log?.append("assessment", {
    obligations: disclosure.obligations,
    unmetByStatement: disclosure.unmetByStatement,
    notes: disclosure.notes,
  });

  return async (request: Request): Promise<Response> => {
    const response = await handler(request);
    if (disclosure.obligations.length === 0) return response;

    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(disclosure.machineReadable)) {
      headers.set(name, value);
    }

    let body: BodyInit | null = response.body;
    if (options.injectJsonKey && isJSON(response)) {
      const payload = await response.clone().json();
      body = JSON.stringify(inject(payload, options.injectJsonKey, disclosure.statement));
      headers.delete("content-length");
    }

    options.log?.append("disclosure-shown", {
      path: new URL(request.url).pathname,
      obligations: disclosure.obligations,
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/** The disclosure a wrapped handler will serve, for tests and for rendering it in a UI. */
export function disclosureFor(profile: SystemProfile, options: DisclosureOptions = {}): Disclosure {
  return disclose(profile, options);
}

export { DISCLOSURE_HEADER };

function isJSON(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("application/json");
}

function inject(payload: unknown, key: string, statement: string): unknown {
  // Only an object can carry an extra key. An array or a bare value is returned
  // untouched rather than wrapped in a shape the caller never agreed to.
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return { ...(payload as Record<string, unknown>), [key]: statement };
}
