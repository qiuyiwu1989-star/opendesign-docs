import type {PageBounds} from './thinking-page-bounds';
export function pageCenterOffset(bounds:PageBounds,selection:readonly [number,number,number,number],axis:'x'|'y'){
 const [x1,y1,x2,y2]=selection;
 return {dx:axis==='x'?bounds.x+bounds.width/2-(x1+x2)/2:0,dy:axis==='y'?bounds.y+bounds.height/2-(y1+y2)/2:0};
}
