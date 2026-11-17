import type { IdentityResolver } from "../worker/identity.ts";
import { readLocalToken } from "./token.ts";

// The sign-in of the local mode, on the Worker's side: the user of a token of token.ts. No Auth0,
// no signature: this file is only reachable from the local entry (src/local/worker.ts).

/** Anonymous without a header; the user of a local token; 401 for anything else. */
export const localIdentity: IdentityResolver = async (request) => {
  const header = request.headers.get("authorization");
  if (header === null) return { kind: "anonymous" };
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) throw new Error("The Authorization header is not a bearer token.");
  const user = readLocalToken(match[1]);
  return { kind: "user", userId: user.sub, roles: user.roles };
};
