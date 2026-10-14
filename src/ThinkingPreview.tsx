import {useEffect,useState} from 'react';
import {exportToSvg,getCommonBounds} from '@excalidraw/excalidraw';
import {pageBounds} from './thinking-page-bounds';
import type {Scene} from './thinking-workspace';
export function ThinkingPreview({scene,label}:{scene:Scene;label:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let disposed=false;let resource='';if(!scene.elements.some(e=>!e.isDeleted)){setUrl('');return;}
 void exportToSvg({elements:scene.elements.filter(e=>!e.isDeleted),files:scene.files,appState:{...scene.appState,exportWithDarkMode:false},exportPadding:30}).then((svg:SVGSVGElement)=>{if(disposed)return;const bounds=pageBounds(scene);const [left,top]=getCommonBounds(scene.elements.filter(e=>!e.isDeleted));svg.setAttribute('viewBox',`${bounds.x-left+30} ${bounds.y-top+30} ${bounds.width} ${bounds.height}`);svg.setAttribute('width',String(bounds.width));svg.setAttribute('height',String(bounds.height));svg.style.background=scene.appState.viewBackgroundColor;resource=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));setUrl(resource);}).catch(()=>setUrl(''));return()=>{disposed=true;if(resource)URL.revokeObjectURL(resource);};},[scene]);
 return <div className="thinking-thumbnail">{url?<img src={url} alt={label}/>:<span>{scene.elements.length?'预览暂不可用':'空白页'}</span>}</div>;
}
