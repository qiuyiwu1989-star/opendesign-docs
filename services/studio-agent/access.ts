/** Pure authorization contract. Session verification must happen in server middleware.
 * Never call principalFromVerifiedSession with a request body or unverified cookie.
 * This module does not implement login, cookie verification, membership or persistence.
 */
export type Principal = Readonly<{ kind: 'anonymous'; id: string } | { kind: 'user'; id: string }>;
export type ProjectAccess = Readonly<{ id: string; owner: Principal }>;
export type JobBinding = Readonly<{ owner: Principal; projectId: string; baseRevision: string }>;
export class StudioAccessError extends Error {
  constructor() { super('无权访问此项目或任务，或访问参数无效。'); this.name = 'StudioAccessError'; }
}
const deny = (): never => { throw new StudioAccessError(); };
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) return deny();
  return value;
};
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return deny();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) return deny();
  return record;
}
function principal(value: unknown): Principal {
  const record = object(value, ['kind', 'id']);
  if (record.kind !== 'anonymous' && record.kind !== 'user') return deny();
  return Object.freeze({ kind: record.kind, id: identifier(record.id) });
}
const sameOwner = (a: Principal, b: Principal): boolean => a.kind === b.kind && a.id === b.id;

/** Input comes exclusively from a successfully verified server session. */
export function principalFromVerifiedSession(session: unknown): Principal {
  if (!session || typeof session !== 'object') return deny();
  const kind = (session as { kind?: unknown }).kind;
  if (kind === 'anonymous') {
    const record = object(session, ['kind', 'sessionId']);
    return principal({ kind, id: record.sessionId });
  }
  if (kind === 'user') {
    const record = object(session, ['kind', 'userId']);
    return principal({ kind, id: record.userId });
  }
  return deny();
}

/** Project must be loaded from server storage, never from the request body. */
export function assertProjectAccess(actor: Principal, storedProject: unknown): ProjectAccess {
  const trustedActor = principal(actor), record = object(storedProject, ['id', 'owner']);
  const project = { id: identifier(record.id), owner: principal(record.owner) };
  if (!sameOwner(trustedActor, project.owner)) return deny();
  return Object.freeze(project);
}

/** Narrow start payload excludes owner. The server stamps owner after authorization.
 * The caller must also verify baseRevision exists in this project in its repository.
 */
export function bindJob(actor: Principal, storedProject: unknown, input: unknown): JobBinding {
  const project = assertProjectAccess(actor, storedProject);
  const record = object(input, ['projectId', 'baseRevision']);
  const projectId = identifier(record.projectId), baseRevision = identifier(record.baseRevision);
  if (projectId !== project.id) return deny();
  return Object.freeze({ owner: project.owner, projectId, baseRevision });
}

/** Check a stored job against authorized project and server-resolved revision.
 * expectedBaseRevision must not be copied from the candidate being checked.
 */
export function assertJobAccess(actor: Principal, storedProject: unknown, storedJob: unknown, expectedBaseRevision: string): JobBinding {
  const project = assertProjectAccess(actor, storedProject);
  const record = object(storedJob, ['owner', 'projectId', 'baseRevision']);
  const owner = principal(record.owner), projectId = identifier(record.projectId), baseRevision = identifier(record.baseRevision);
  if (!sameOwner(project.owner, owner) || projectId !== project.id || baseRevision !== identifier(expectedBaseRevision)) return deny();
  return Object.freeze({ owner, projectId, baseRevision });
}
