import {newElementWith,restoreElements} from '@excalidraw/excalidraw';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
/** Only HTML line-break tags; the ordinary abbreviation BR stays intact. */
export const normalizeDiagramBreaks=(text:string)=>text.replace(/(?:<br\s*\/?\s*>|&lt;br\s*\/?\s*&gt;)/gi,'\n');
export function repairDiagram(elements:readonly ExcalidrawElement[],referenceStyle=false){
 const changed=elements.map(e=>{
  if(e.isDeleted||e.type==='image')return e;
  const style=referenceStyle?{roughness:0,strokeWidth:1,strokeColor:e.type==='text'?'#d3b5f5':e.type==='arrow'||e.type==='line'?'#999999':'#49315f',...(e.type==='rectangle'?{backgroundColor:'#301b4b',fillStyle:'solid' as const,roundness:{type:3 as const}}:{}),...(e.type==='text'?{fontFamily:2}: {})}:{};
  if(e.type==='text'){const originalText=normalizeDiagramBreaks(e.originalText||e.text);if(originalText!==e.originalText||referenceStyle)return newElementWith(e,{...style,text:originalText,originalText,autoResize:true});}
  return referenceStyle?newElementWith(e,style):e;
 });
 return restoreElements(changed,null,{refreshDimensions:true,repairBindings:true});
}
