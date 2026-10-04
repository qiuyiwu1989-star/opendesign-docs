import { findRemoteRecord, saveRemoteRecord, type RemoteProject } from './studio-remote-store';
import type { StudioTask } from './studio-store';

/** Call only with a fresh, authorized projects/read response. No server writes. */
export async function recoverCloudProject(project: RemoteProject): Promise<StudioTask> {
  const previous = await findRemoteRecord(project.id);
  const taskId = previous?.taskId ?? `cloud-${project.id}`;
  if (!previous?.pending) {
    await saveRemoteRecord({
      taskId, projectId: project.id, project, pending: null,
      candidate: previous?.candidate?.proposal.baseId === project.headRevision ? previous.candidate : null,
    }, previous?.revision ?? 0);
  }
  // A display handle only: do not invent a local task or overwrite the original draft.
  return { id: taskId, revision: 0, updatedAt: project.revisions.at(-1)!.createdAt,
    draft: { brief: { title: `云端作品 ${project.id.slice(0, 8)}`, audience: '', goal: '', materials: '' }, outline: [], versions: [] } };
}
