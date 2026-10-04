import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { inspectHtml, type TextTarget } from './html';
import { inspectSlides } from './slides';
export type StudioPage = {id:string;title:string;targets:TextTarget[]};
/** Map using offsets in the original document; never reparse sliced page HTML. */
export function studioPages(source:string):StudioPage[]{
 const pages=inspectSlides(source), targets=inspectHtml(source).targets;
 const ends=new Map<number,number>();
 const visit=(node:DefaultTreeAdapterMap['node'])=>{
   if('tagName' in node&&node.sourceCodeLocation)ends.set(node.sourceCodeLocation.startOffset,node.sourceCodeLocation.endOffset);
   if('childNodes' in node)node.childNodes.forEach(visit);
 };
 visit(parse(source,{sourceCodeLocationInfo:true}));
 return pages.map(page=>({id:page.id,title:page.title,targets:targets.filter(t=>t.start>=page.start&&t.end<=(ends.get(page.start)??page.start))}));
}
