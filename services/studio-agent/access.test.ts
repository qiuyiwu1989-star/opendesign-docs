import { describe, expect, it } from 'vitest';
import { assertJobAccess, assertProjectAccess, bindJob, principalFromVerifiedSession, StudioAccessError, type Principal } from './access';
const user = principalFromVerifiedSession({ kind: 'user', userId: 'owner-a' });
const anonymous = principalFromVerifiedSession({ kind: 'anonymous', sessionId: 'owner-a' });
const project = { id: 'project-a', owner: user };
const input = { projectId: project.id, baseRevision: 'revision-1' };

describe('Studio owner/project/revision authorization contract', () => {
  it('derives separate anonymous and user principals from verified server sessions', () => {
    expect(user).toEqual({ kind: 'user', id: 'owner-a' });
    expect(anonymous).toEqual({ kind: 'anonymous', id: 'owner-a' });
    expect(Object.isFrozen(user)).toBe(true);
    expect(assertProjectAccess(user, project)).toEqual(project);
    expect(assertProjectAccess(anonymous, { ...project, owner: anonymous }).owner).toEqual(anonymous);
  });
  it.each([undefined, null, {}, { kind: 'admin', userId: 'x' }, { kind: 'user', id: 'x' }, { kind: 'user', userId: '' }, { kind: 'anonymous', sessionId: '../other' }, { kind: 'user', userId: 'a', owner: 'b' }])('denies unknown or malformed sessions %#', value => {
    expect(() => principalFromVerifiedSession(value)).toThrow(StudioAccessError);
  });
  it('denies cross-user access and anonymous/login collision with the same id', () => {
    const other = principalFromVerifiedSession({ kind: 'user', userId: 'owner-b' });
    for (const actor of [other, anonymous]) {
      expect(() => assertProjectAccess(actor, project)).toThrow(StudioAccessError);
      expect(() => bindJob(actor, project, input)).toThrow(StudioAccessError);
      expect(() => assertJobAccess(actor, project, { owner: user, ...input }, input.baseRevision)).toThrow(StudioAccessError);
    }
    expect(() => assertProjectAccess(user, { ...project, owner: anonymous })).toThrow(StudioAccessError);
  });
  it('binds owner from the authorized project and rejects body-supplied owner fields', () => {
    expect(bindJob(user, project, input)).toEqual({ owner: user, ...input });
    for (const extra of [{ owner: user }, { ownerId: user.id }, { principal: user }]) {
      expect(() => bindJob(user, project, { ...input, ...extra })).toThrow(StudioAccessError);
    }
  });
  it('denies a different project even when the same user owns both', () => {
    expect(() => bindJob(user, project, { ...input, projectId: 'project-b' })).toThrow(StudioAccessError);
    expect(() => assertJobAccess(user, project, { owner: user, ...input, projectId: 'project-b' }, input.baseRevision)).toThrow(StudioAccessError);
  });
  it('requires matching job owner, project and expected base revision', () => {
    const job = bindJob(user, project, input);
    expect(assertJobAccess(user, project, job, input.baseRevision)).toEqual(job);
    expect(() => assertJobAccess(user, project, { ...job, owner: anonymous }, input.baseRevision)).toThrow(StudioAccessError);
    expect(() => assertJobAccess(user, project, job, 'revision-2')).toThrow(StudioAccessError);
  });
  it.each(['', ' ', '../x', 'a/b', 'x\n', 'a'.repeat(129), 1, null])('rejects invalid project/revision/owner fields %#', value => {
    expect(() => bindJob(user, project, { ...input, baseRevision: value })).toThrow(StudioAccessError);
    expect(() => bindJob(user, project, { ...input, projectId: value })).toThrow(StudioAccessError);
    expect(() => assertProjectAccess(user, { ...project, owner: { kind: 'user', id: value } })).toThrow(StudioAccessError);
    expect(() => assertJobAccess(user, project, { owner: user, ...input, baseRevision: value }, input.baseRevision)).toThrow(StudioAccessError);
  });
  it('fails closed on untyped malformed actors and records', () => {
    for (const value of [null, {}, [], { kind: 'unknown', id: user.id }]) {
      expect(() => assertProjectAccess(value as Principal, project)).toThrow(StudioAccessError);
      expect(() => assertProjectAccess(user, value)).toThrow(StudioAccessError);
      expect(() => assertJobAccess(user, project, value, input.baseRevision)).toThrow(StudioAccessError);
    }
  });
  it('returns detached frozen bindings that cannot be changed through inputs', () => {
    const mutableProject = { id: project.id, owner: { kind: 'user' as const, id: user.id } };
    const job = bindJob(user, mutableProject, input);
    mutableProject.owner.id = 'other';
    expect(job.owner.id).toBe(user.id);
    expect(Object.isFrozen(job)).toBe(true); expect(Object.isFrozen(job.owner)).toBe(true);
  });
});
