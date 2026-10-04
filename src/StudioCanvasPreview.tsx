import { useEffect, useMemo, useRef, useState } from 'react';
import { studioPages } from './studio-pages';
import { createThumbnailFactory } from './thumbnail-preview';
import './studio-canvas.css';
export function StudioCanvasPreview({source,previewSource,selectedId,onSelect,disabled}:{source:string;previewSource:string;selectedId:string;onSelect:(id:string)=>void;disabled:boolean}){
 const pages=useMemo(()=>studioPages(source),[source]);
 const [pageId,setPageId]=useState('page-0');
 const selectedPage=pages.find(p=>p.targets.some(t=>t.id===selectedId));
 useEffect(()=>{if(selectedPage)setPageId(selectedPage.id);},[selectedPage?.id]);
 const page=pages.find(p=>p.id===pageId)??pages[0];
 const factory=useMemo(()=>createThumbnailFactory(previewSource),[previewSource]);
 const srcDoc=useMemo(()=>page?factory(page.id):'',[factory,page?.id]);
 const viewport=useRef<HTMLDivElement>(null),[width,setWidth]=useState(640);
 useEffect(()=>{const node=viewport.current;if(!node)return;const observer=new ResizeObserver(()=>setWidth(node.clientWidth));observer.observe(node);setWidth(node.clientWidth);return()=>observer.disconnect();},[]);
 if(!page)return <p>当前文档没有可识别的演示页，可在 Docs 中继续编辑。</p>;
 return <section className="studio-canvas-workspace" aria-label="作品页面预览">
  <nav aria-label="Studio 页面" className="studio-page-list">{pages.map((p,i)=><button key={p.id} disabled={disabled} aria-current={p.id===page.id?'page':undefined} onClick={()=>{setPageId(p.id);onSelect('');}}>{i+1}. {p.title}</button>)}
   <h4>本页文字</h4>{page.targets.map(t=><button key={t.id} disabled={disabled} aria-pressed={selectedId===t.id} onClick={()=>onSelect(t.id)}>{t.text.slice(0,60)}</button>)}
  </nav>
  <div className="studio-canvas-column"><p>{previewSource===source?'已保存版本预览':'候选预览 · 尚未应用'} · 第 {pages.indexOf(page)+1} / {pages.length} 页</p>
   <div ref={viewport} className="studio-preview-viewport" style={{height:width*720/1280}}><iframe title={`Studio 第 ${pages.indexOf(page)+1} 页预览`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} tabIndex={-1} style={{width:1280,height:720,transform:`scale(${width/1280})`}}/></div>
   <p>从左侧选择文字，在下方修改或交给 AI。自由排版可继续转入 Docs。</p>
  </div>
 </section>;
}
