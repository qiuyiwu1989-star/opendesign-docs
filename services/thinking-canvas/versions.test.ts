import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveVersion} from './versions';
import {createWork} from '../../src/thinking-workspace';
it('persists immutable parent and child, rejects foreign parents and changed page order',async()=>{const root=await mkdtemp(join(tmpdir(),'canvas-version-'));try{const work=createWork();const original=await saveVersion(root,work.id,{source:work});const before=await readFile(join(root,work.id,original.id+'.json'),'utf8');const child=await saveVersion(root,work.id,{source:work,parentId:original.id,html:'<!doctype html><p>test</p>'});expect(child.parentId).toBe(original.id);expect(await readFile(join(root,work.id,original.id+'.json'),'utf8')).toBe(before);await expect(saveVersion(root,work.id,{source:work,parentId:'../outside',html:'<!doctype html>'})).rejects.toThrow();const changed=structuredClone(work);changed.pages[0]!.id='changed';changed.activePage='changed';await expect(saveVersion(root,work.id,{source:changed,parentId:original.id,html:'<!doctype html>'})).rejects.toThrow('Page order changed');}finally{await rm(root,{recursive:true,force:true});}});
