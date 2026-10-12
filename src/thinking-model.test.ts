import {describe,it,expect} from 'vitest';
import {assertProposalCurrent,validateProposal,thoughtsHtml,sceneRevision} from './thinking-model';
describe('thinking canvas',()=>{
 it('rejects stale suggestions after manual edits',()=>{const p={id:'1',baseRevision:'a',message:'test',notes:[]};expect(()=>assertProposalCurrent(p,'b')).toThrow('画布已变化');});
 it('validates bounded note coordinates and text',()=>{expect(()=>validateProposal({id:'1',baseRevision:'a',message:'ok',notes:[{id:'n',text:'a',x:Infinity,y:0}]})).toThrow();});
 it('exports text without executing markup',()=>{expect(thoughtsHtml(['<script>alert(1)</script>'])).toContain('&lt;script&gt;');expect(()=>thoughtsHtml([])).toThrow();});
 it('tracks deletions and object versions',()=>{const a={id:'x',version:1,isDeleted:false};expect(sceneRevision([a])).not.toBe(sceneRevision([{...a,isDeleted:true}]));});
});
