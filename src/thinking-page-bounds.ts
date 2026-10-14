export type PageBounds={x:number;y:number;width:number;height:number};
export function pageBounds(scene:{pageBounds?:PageBounds;elements:readonly {x:number;y:number;width:number;height:number;isDeleted?:boolean}[]}):PageBounds {
 if(scene.pageBounds)return scene.pageBounds;
 const items=scene.elements.filter(e=>!e.isDeleted);
 if(!items.length)return{x:0,y:0,width:1600,height:900};
 const left=Math.min(...items.map(e=>e.x)),top=Math.min(...items.map(e=>e.y));
 const right=Math.max(...items.map(e=>e.x+e.width)),bottom=Math.max(...items.map(e=>e.y+e.height));
 const width=Math.max(1600,(right-left)*1.2,(bottom-top)*1.2*16/9),height=width*9/16;
 return{x:(left+right-width)/2,y:(top+bottom-height)/2,width,height};
}
