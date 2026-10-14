import {describe,it,expect} from 'vitest';
import {presentationHtml} from './thinking-versions';
import {createWork} from './thinking-workspace';
describe('faithful presentation',()=>{it('keeps page count, labels and order and escapes supplied names',()=>{const w=createWork('<script>alert(1)</script>');w.pages.push({...structuredClone(w.pages[0]!),id:'second',name:'second'});const html=presentationHtml(w,['data:image/svg+xml;base64,first','data:image/svg+xml;base64,second']);expect(html.match(/<section class="page"/g)).toHaveLength(2);expect(html.indexOf('base64,first')).toBeLessThan(html.indexOf('base64,second'));expect(html).toContain('&lt;script&gt;');expect(()=>presentationHtml(w,[])).toThrow('页面渲染不完整');});});
