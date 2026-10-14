import {WORKSPACE_KEY,type ThinkingLibrary} from './thinking-workspace';
export class ThinkingSaveConflict extends Error {}
/** Reject stale whole-library writes. A caller must serialize concurrent async writers separately. */
export function guardedSave(storage:Pick<Storage,'getItem'|'setItem'>,expected:string|null,library:ThinkingLibrary,recoveryKey:string):string {
 const next=JSON.stringify(library),actual=storage.getItem(WORKSPACE_KEY);
 if(actual!==expected&&actual!==next){
  storage.setItem(recoveryKey,next);
  throw new ThinkingSaveConflict('其他窗口已修改此作品。已保留本窗口恢复副本，暂停写入以防覆盖；请先备份本窗口。');
 }
 storage.setItem(WORKSPACE_KEY,next);return next;
}
