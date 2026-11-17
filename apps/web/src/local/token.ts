// The tokens of the local mode: the browser picks a user and roles (client.tsx) and sends
// `Authorization: Bearer local.<base64url of {"sub","roles"}>`; the local Worker reads them
// (identity.ts). Unsigned: they mean something only to the Worker of the local mode.

export interface LocalUser {
  sub: string;
  roles: string[];
}

export function localToken(user: LocalUser): string {
  const json = JSON.stringify({ sub: user.sub, roles: user.roles });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `local.${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function readLocalToken(token: string): LocalUser {
  if (!token.startsWith("local.")) throw new Error("Not a token of the local mode.");
  const b64 = token.slice("local.".length).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<LocalUser>;
  if (typeof parsed.sub !== "string" || !parsed.sub) throw new Error("The token has no subject.");
  const roles = Array.isArray(parsed.roles)
    ? parsed.roles.filter((r): r is string => typeof r === "string")
    : [];
  return { sub: parsed.sub, roles };
}
