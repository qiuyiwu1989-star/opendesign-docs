import {describe,it,expect} from 'vitest';
import {loadLibrary,LEGACY_KEY,WORKSPACE_KEY,createWork,duplicatePage,movePage,restoreCopy,validateLibrary} from './thinking-workspace';
describe('thinking workspaces',()=>{
 it('migrates without overwriting the original',()=>{const raw=JSON.stringify({elements:[],files:{},appState:{viewBackgroundColor:'#fff'}});const data=new Map([[LEGACY_KEY,raw]]);const result=loadLibrary({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});expect(result.works[0]!.name).toBe('我的画布');expect(data.get(LEGACY_KEY)).toBe(raw);expect(data.get(LEGACY_KEY+'-migration-backup')).toBe(raw);expect(data.has(WORKSPACE_KEY)).toBe(false);});
 it('fails closed for corrupt saved data',()=>{expect(()=>loadLibrary({getItem:()=>'{bad',setItem:()=>{throw Error('must not write');}})).toThrow();});
 it('duplicates independently and reorders without losing pages',()=>{const w=createWork();const copy=duplicatePage(w,w.activePage);copy.pages[1]!.scene.appState.viewBackgroundColor='#000';expect(w.pages[0]!.scene.appState.viewBackgroundColor).toBe('#ffffff');expect(copy.pages[1]!.id).not.toBe(w.activePage);expect(movePage(copy,copy.activePage,0).pages[0]!.id).toBe(copy.activePage);expect(copy.pages).toHaveLength(2);});
 it('restores as a separate work and retains original',()=>{const w=createWork();const l={version:2 as const,activeWork:w.id,works:[w]};const r=restoreCopy(l,JSON.stringify(l));expect(r.works).toHaveLength(2);expect(r.works[0]).toBe(w);expect(r.activeWork).not.toBe(w.id);expect(()=>validateLibrary({...l,activeWork:'missing'})).toThrow();});
});
