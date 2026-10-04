import { createHash } from 'node:crypto';
import { principalFromVerifiedSession, type Principal } from './access';
import type { LocalSessionCodec } from './session';

/** Trusted server adapter only. Never construct this result from request identity headers. */
export type VerifiedIdentity = Readonly<{ principal: Principal; setCookie?: string }>;
export type IdentityResolver = (cookie?: string) => VerifiedIdentity | Promise<VerifiedIdentity>;

export function anonymousIdentityResolver(codec: LocalSessionCodec): IdentityResolver {
  return cookie => {
    const session = codec.resolve(cookie);
    return { principal: principalFromVerifiedSession({ kind: 'anonymous', sessionId: session.scope }),
      ...(session.setCookie ? { setCookie: session.setCookie } : {}) };
  };
}

/** Validate and copy a trusted adapter result; this is not credential verification. */
export function validatedPrincipal(identity: VerifiedIdentity): Principal {
  const principal = identity.principal;
  return principalFromVerifiedSession(principal.kind === 'anonymous'
    ? { kind: principal.kind, sessionId: principal.id }
    : { kind: principal.kind, userId: principal.id });
}

export function principalKey(principal: Principal): string { return `${principal.kind}:${principal.id}`; }
/** Retain the historical anonymous directory; account jobs occupy a separate namespace. */
export function localJobsDirectory(root: string, principal: Principal): string[] {
  if (principal.kind === 'anonymous') {
    // Only signed anonymous IDs have ever been used on disk. Reject non-codec scopes.
    if (!/^[a-f0-9]{64}$/.test(principal.id)) throw new Error('Invalid anonymous scope');
    return [root, 'sessions', principal.id];
  }
  return [root, 'users', createHash('sha256').update(`studio-user-jobs-v1:${principalKey(principal)}`).digest('hex')];
}
