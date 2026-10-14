/** The brief belongs to the work. Confirmation records agreement, not generation. */
export type ProjectBrief = {
  intent: string;
  requirements: string;
  outline: string;
  intentConfirmedAt?: string;
  outlineConfirmedAt?: string;
  linkedDocumentIds: string[];
  outlineDocumentId?: string;
};

export type ProjectStage = 'intent' | 'outline' | 'ready';
export type ProjectBriefPatch = Partial<Pick<ProjectBrief,
  'intent' | 'requirements' | 'outline' | 'linkedDocumentIds' | 'outlineDocumentId'>>;

export function defaultBrief(): ProjectBrief {
  return {intent: '', requirements: '', outline: '', linkedDocumentIds: []};
}

/** Use at the persistence boundary; malformed confirmations must not unlock generation. */
export function validateBrief(value: unknown): value is ProjectBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const brief = value as Record<string, unknown>;
  if (typeof brief.intent !== 'string' || typeof brief.requirements !== 'string' || typeof brief.outline !== 'string') return false;
  if (!Array.isArray(brief.linkedDocumentIds) || !brief.linkedDocumentIds.every(id => typeof id === 'string' && id.trim().length > 0)) return false;
  if (brief.outlineDocumentId !== undefined && (typeof brief.outlineDocumentId !== 'string' || !brief.outlineDocumentId.trim())) return false;
  for (const key of ['intentConfirmedAt', 'outlineConfirmedAt']) {
    if (brief[key] !== undefined && (typeof brief[key] !== 'string' || !Number.isFinite(Date.parse(brief[key] as string)))) return false;
  }
  if (brief.intentConfirmedAt && (!brief.intent.trim() || !brief.requirements.trim())) return false;
  if (brief.outlineConfirmedAt && (!brief.intentConfirmedAt || !brief.outline.trim())) return false;
  return true;
}

export function updateBrief(brief: ProjectBrief, patch: ProjectBriefPatch): ProjectBrief {
  const next = {...brief, ...patch, linkedDocumentIds: [...(patch.linkedDocumentIds ?? brief.linkedDocumentIds)]};
  if (next.intent !== brief.intent || next.requirements !== brief.requirements) {
    delete next.intentConfirmedAt;
    delete next.outlineConfirmedAt;
  } else if (next.outline !== brief.outline) {
    delete next.outlineConfirmedAt;
  }
  return next;
}

export function confirmIntent(brief: ProjectBrief, now = new Date().toISOString()): ProjectBrief {
  if (!brief.intent.trim() || !brief.requirements.trim()) throw new Error('请先填写表达意图和 PPT 要求，再确认。');
  if (!Number.isFinite(Date.parse(now))) throw new Error('确认时间无效。');
  return {...brief, linkedDocumentIds: [...brief.linkedDocumentIds], intentConfirmedAt: now};
}

export function confirmOutline(brief: ProjectBrief, now = new Date().toISOString()): ProjectBrief {
  if (!brief.intentConfirmedAt || !brief.intent.trim() || !brief.requirements.trim()) throw new Error('请先确认表达意图和 PPT 要求。');
  if (!brief.outline.trim()) throw new Error('请先填写逐页提纲，再确认。');
  if (!Number.isFinite(Date.parse(now))) throw new Error('确认时间无效。');
  return {...brief, linkedDocumentIds: [...brief.linkedDocumentIds], outlineConfirmedAt: now};
}

export function projectStage(brief: ProjectBrief): ProjectStage {
  if (!validateBrief(brief) || !brief.intentConfirmedAt) return 'intent';
  return brief.outlineConfirmedAt ? 'ready' : 'outline';
}
