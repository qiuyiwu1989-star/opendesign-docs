import {it,expect} from 'vitest';
import {guardedSave,ThinkingSaveConflict} from './thinking-storage';
import {createWork,WORKSPACE_KEY} from './thinking-workspace';
it('preserves newer disk content and saves stale edits separately',()=>{const w=createWork();const l={version:2 as const,works:[w],activeWork:w.id};const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};const first=guardedSave(storage,null,l,'recovery');const newer={...l,works:[{...w,name:'newer'}]};const second=guardedSave(storage,first,newer,'other');expect(()=>guardedSave(storage,first,l,'recovery')).toThrow(ThinkingSaveConflict);expect(data.get(WORKSPACE_KEY)).toBe(second);expect(data.get('recovery')).toBe(first);});
