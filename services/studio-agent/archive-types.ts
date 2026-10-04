import type { StoredProject } from './projects';
import type { JobRecord } from './jobs';
import type { Principal } from './access';
/** Private data only. The signing secret is intentionally not included. */
export type ArchiveJob = {owner:Principal;record:JobRecord};
export type StudioArchivePayload = {
 format:'opendesign-studio-archive';version:1;createdAt:string;
 sessionKeyHash:string;projects:StoredProject[];jobs:ArchiveJob[];
};
export type StudioArchive = {payload:StudioArchivePayload;sha256:string};
