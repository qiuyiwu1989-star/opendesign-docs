import { describe,it,expect } from 'vitest';
import { studioPages } from './studio-pages';
import { inspectHtml } from './html';
import { applyProposal,proposeText } from './studio-model';
describe('Studio page selection mapping',()=>{
 it('preserves whole-document target identity and excludes text outside pages',()=>{
  const source='<p>outside</p><section class="slide"><h1>第一页</h1><p>正文</p></section><section class="slide"><h1>第二页</h1></section><footer>after</footer>';
  const pages=studioPages(source);expect(pages).toHaveLength(2);
  expect(pages.map(p=>p.targets.map(t=>t.text))).toEqual([['第一页','正文'],['第二页']]);
  const target=pages[1]!.targets[0]!;expect(inspectHtml(source).targets.find(t=>t.id===target.id)?.text).toBe('第二页');
  const v={id:'v1',label:'test',source};expect(applyProposal(v,proposeText(v,target.id,'新标题'))).toBe(source.replace('第二页','新标题'));
 });
 it('recomputes offsets after text length changes without changing source',()=>{
  const source='<section class="slide"><h1>短</h1></section><section class="slide"><p>保留</p></section>';
  expect(studioPages(source.replace('短','很长的新标题'))[1]!.targets[0]!.text).toBe('保留');
 });
});
