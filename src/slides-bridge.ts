// Trusted fixed-page interaction bridge. Imported scripts never run.
import { gesturePlacement } from "./slide-geometry";
import { composingKey } from "./editing-keys";
// Runtime notes live outside the template so they do not enlarge iframe payloads.
// Known active-class decks need their normal flex/grid rules on every page.
// Paint micro-adjustments immediately; parent acknowledgements can arrive
// after newer keys or after the next pointer gesture has already started.
// Match the persistence contract: positions are rounded to 0.1px and scale
// to 0.001 by validatePlacement before the parent echoes the accepted edit.
// Selection-only consumers never install editing, pointer or text handlers.
// Do not prevent the initial down: double-click still enters text editing.
export function slideBridge(channel: string, pageId: string, selectionOnly = false) {
  return `(() => {
    const gesturePlacement=${gesturePlacement.toString()};
    const composingKey=${composingKey.toString()};
    const channel=${JSON.stringify(channel)}, pageId=${JSON.stringify(pageId)}, selectionOnly=${selectionOnly};
    const send=(type,extra={})=>parent.postMessage({channel,type,...extra},'*');
    const page=[...document.querySelectorAll('[data-doc-slide]')].find(n=>n.getAttribute('data-doc-slide')===pageId);
    if(!page)return;
    const deckPages=[...document.querySelectorAll('[data-doc-slide]')];
    if(deckPages.some(n=>n.classList?.contains('active'))){deckPages.forEach(n=>n.classList.remove('active'));page.classList.add('active');}
    const original=getComputedStyle(page);
    if(original.display==='none')page.style.setProperty('display','block','important');
    const w=page.offsetWidth>100?page.offsetWidth:1280;
    const h=page.offsetHeight>100?page.offsetHeight:720;
    let ancestor=page;
    while(ancestor.parentElement){
      [...ancestor.parentElement.children].forEach(n=>{if(n!==ancestor&&!['STYLE','SCRIPT','HEAD'].includes(n.tagName))n.style.setProperty('display','none','important');});
      ancestor=ancestor.parentElement;
      if(ancestor===document.body)break;
      ancestor.style.setProperty('display','contents','important');
      ancestor.style.setProperty('transform','none','important');
    }
    document.body.style.cssText+=';margin:0!important;overflow:hidden!important;';
    document.documentElement.style.cssText+=';margin:0!important;overflow:hidden!important;';
    page.style.cssText+=';box-sizing:border-box!important;position:absolute!important;margin:0!important;max-width:none!important;max-height:none!important;width:'+w+'px!important;height:'+h+'px!important;transform-origin:0 0!important;translate:none!important;scale:none!important;rotate:none!important;visibility:visible!important;opacity:1!important;';
    const freeze=document.createElement('style');freeze.textContent='*{animation:none!important;transition:none!important}[contenteditable]{white-space:pre-wrap!important}';document.head.append(freeze);
    let zoom=1, selected=null, active=null, before='', gesture=null, composing=false, settling=false, pendingBlur=false, compositionEpoch=0;
    document.addEventListener('compositionstart',e=>{if(e.target===active){composing=true;compositionEpoch++;}});
    document.addEventListener('compositionend',e=>{if(e.target!==active)return;composing=false;settling=true;const epoch=compositionEpoch;setTimeout(()=>{if(epoch!==compositionEpoch)return;settling=false;if(pendingBlur)finishText();},0);});
    const pendingPlacements=[];
    function paint(node,p){node.style.setProperty('translate',p.x+'px '+p.y+'px','important');node.style.setProperty('scale',String(p.scale),'important');outline();}
    function commitPlacement(node,p){const id=node.getAttribute('data-doc-object');pendingPlacements.push({id,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,scale:Math.round(p.scale*1000)/1000});if(pendingPlacements.length>256)pendingPlacements.shift();send('placement',{id,placement:p});}
    const box=document.createElement('div');
    box.style.cssText='all:initial;position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #257563;z-index:2147483647;display:none';
    const handle=document.createElement('button');handle.type='button';handle.textContent='↘';handle.title='等比缩放：拖动或方向键，Shift 加快';handle.setAttribute('aria-label','等比缩放：拖动或方向键，Shift 加快');
    handle.style.cssText='all:initial;position:absolute;right:-8px;bottom:-8px;background:#fff;color:#246858;border:2px solid #246858;border-radius:3px;width:14px;height:14px;cursor:nwse-resize;pointer-events:auto;text-align:center;font:12px sans-serif';
    box.append(handle);document.documentElement.append(box);
    function placement(node){
      const s=getComputedStyle(node),t=s.translate==='none'?['0px','0px']:s.translate.split(/\\s+/),v=s.scale==='none'?['1']:s.scale.split(/\\s+/);
      let parentCompatible=true;
      for(let n=node;n;n=n.parentElement){const a=getComputedStyle(n);if((a.zoom&&a.zoom!=='1'&&a.zoom!=='normal')||(a.offsetPath&&a.offsetPath!=='none'))parentCompatible=false;if(n===page)break;if(n!==node&&(a.transform!=='none'||a.rotate!=='none'||(a.scale!=='none'&&a.scale!=='1')))parentCompatible=false;}
      const valid=parentCompatible&&s.display!=='inline'&&t.length<=2&&t.every(n=>/^-?[\\d.]+px$/.test(n)||n==='0')&&v.every(n=>Number.isFinite(Number(n)))&&(v.length===1||v[0]===v[1])&&s.transform==='none'&&s.rotate==='none';
      const x=parseFloat(t[0])||0,y=parseFloat(t[1]||'0')||0,scale=Number(v[0]);
      return {x,y,scale,editable:valid&&[x,y,scale].every(Number.isFinite)&&Math.abs(x)<=10000&&Math.abs(y)<=10000&&scale>=.1&&scale<=5};
    }
    function outline(){
      if(!selected){box.style.display='none';return;}
      const r=selected.getBoundingClientRect();Object.assign(box.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
      const p=placement(selected);handle.style.display=p.editable&&!selectionOnly?'block':'none';
      const label='等比缩放 '+Number((p.scale*100).toFixed(1))+'%：拖动或方向键，Shift 加快';
      handle.title=label;handle.setAttribute('aria-label',label);
    }
    function select(node){selected=node;outline();if(node){
      const s=getComputedStyle(node),p=placement(node),r=node.getBoundingClientRect(),pr=page.getBoundingClientRect();
      let aligned=p.editable;
      for(let n=node;n;n=n.parentElement){const st=getComputedStyle(n);if((st.zoom&&st.zoom!=='1'&&st.zoom!=='normal')||(st.offsetPath&&st.offsetPath!=='none'))aligned=false;if(n===page)break;}
      const pseudo=['::before','::after'].some(p=>{const st=getComputedStyle(node,p);return st.content!=='none'&&st.content!=='normal'&&st.backgroundImage!=='none';});
      send('object-select',{id:node.getAttribute('data-doc-object'),placement:p,
        ...(aligned?{geometry:{left:(r.left-pr.left)/zoom,top:(r.top-pr.top)/zoom,width:r.width/zoom,height:r.height/zoom,pageWidth:w,pageHeight:h}}:{}),
        backgroundImage:pseudo?'':s.backgroundImage,
        ...(node.tagName==='IMG'?{imageSize:{width:parseFloat(s.width),height:parseFloat(s.height)}}:{})});}else send('object-clear');}
    document.addEventListener('load',e=>{if(e.target===selected&&selected?.tagName==='IMG')select(selected);},true);
    function fit(){endGesture(true);zoom=Math.min((innerWidth-40)/w,(innerHeight-40)/h,1);zoom=Math.max(.05,zoom);page.style.setProperty('left',Math.max(20,(innerWidth-w*zoom)/2)+'px','important');page.style.setProperty('top',Math.max(20,(innerHeight-h*zoom)/2)+'px','important');page.style.setProperty('transform','scale('+zoom+')','important');outline();}
    if(selectionOnly){
      let enabled=true;
      const choose=e=>{if(e.target instanceof Element&&e.target.closest('a'))e.preventDefault();if(!enabled)return;const node=objectForSelection(e);select(node&&page.contains(node)?node:null);};
      const objectForSelection=e=>e.target instanceof Element?e.target.closest('[data-doc-object]'):null;
      document.addEventListener('click',choose);
      document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e);}});
      document.addEventListener('submit',e=>e.preventDefault());
      document.addEventListener('dragstart',e=>e.preventDefault());
      window.addEventListener('message',e=>{
        if(e.source!==parent||e.data?.channel!==channel)return;
        if(e.data.type==='request-ready')send('slide-ready',{width:w,height:h});
        if(e.data.type==='selection-enabled')enabled=e.data.enabled===true;
        if(e.data.type==='select-object')select([...page.querySelectorAll('[data-doc-object]')].find(n=>n.getAttribute('data-doc-object')===e.data.id)||null);
      });
      window.addEventListener('resize',fit);fit();send('slide-ready',{width:w,height:h});return;
    }
    function finishText(){if(!active)return;if(composing||settling){pendingBlur=true;return;}pendingBlur=false;const node=active;active=null;node.removeAttribute('contenteditable');if(node.textContent!==before)send('edit',{id:node.getAttribute('data-doc-text'),text:node.textContent});outline();send('ended');}
    document.addEventListener('input',()=>{if(active)outline();});
    const object=e=>e.target instanceof Element?e.target.closest('[data-doc-object]'):null;
    document.addEventListener('click',e=>{if(e.target instanceof Element&&e.target.closest('a'))e.preventDefault();if(e.target===handle||active)return;const node=object(e);if(node)select(node);else select(null);});
    document.addEventListener('dblclick',e=>{const node=e.target instanceof Element?e.target.closest('[data-doc-text]'):null;if(!node||!page.contains(node)||composing||settling)return;finishText();active=node;before=node.textContent;node.setAttribute('contenteditable','plaintext-only');node.focus();send('editing');});
    document.addEventListener('focusout',e=>{if(e.target===active)finishText();});
    document.addEventListener('beforeinput',e=>{
      if(!active||!['insertParagraph','insertLineBreak'].includes(e.inputType))return;e.preventDefault();
      const selection=window.getSelection();if(!selection?.rangeCount||!active.contains(selection.anchorNode))return;
      const range=selection.getRangeAt(0);range.deleteContents();const newline=document.createTextNode('\\n');range.insertNode(newline);range.setStartAfter(newline);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
    });
    function begin(e,resize){
      if(e.button!==0||active||gesture||e.isPrimary===false)return;
      const node=resize?selected:object(e);if(!node)return;select(node);
      const p=placement(node);if(!p.editable){send('layout-locked');return;}
      if(!resize && e.detail>1)return;
      const origin=getComputedStyle(node).transformOrigin.split(/\\s+/).map(parseFloat);
      const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
      const styles=['translate','scale'].map(key=>({key,value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)}));
      gesture={node,x:e.clientX,y:e.clientY,before:p,styles,resize,width:rect.width/zoom,height:rect.height/zoom,originX:origin[0]||0,originY:origin[1]||0,moved:false,pointerId:e.pointerId};
      try{node.setPointerCapture(e.pointerId);}catch{}
    }
    document.addEventListener('pointerdown',e=>begin(e,e.target===handle),true);
    document.addEventListener('pointermove',e=>{
      if(!gesture||e.pointerId!==gesture.pointerId)return;const g=gesture,dx=(e.clientX-g.x)/zoom,dy=(e.clientY-g.y)/zoom;
      if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<4&&!g.moved)return;e.preventDefault();g.moved=true;
      const p=gesturePlacement({...g.before,width:g.width,height:g.height,originX:g.originX,originY:g.originY},dx,dy,g.resize);
      g.next=p;paint(g.node,p);
    });
    function endGesture(cancel){if(!gesture)return;const g=gesture;gesture=null;try{g.node.releasePointerCapture(g.pointerId);}catch{}const changed=g.moved&&(g.next.x!==g.before.x||g.next.y!==g.before.y||g.next.scale!==g.before.scale);if(cancel||!changed){g.styles.forEach(s=>{if(s.value)g.node.style.setProperty(s.key,s.value,s.priority);else g.node.style.removeProperty(s.key);});outline();}else commitPlacement(g.node,g.next);}
    document.addEventListener('pointerup',e=>{if(e.pointerId===gesture?.pointerId)endGesture(false);});document.addEventListener('pointercancel',e=>{if(e.pointerId===gesture?.pointerId)endGesture(true);});
    document.addEventListener('lostpointercapture',e=>{if(e.pointerId===gesture?.pointerId)endGesture(true);});
    document.addEventListener('keydown',e=>{
      if(composing||settling||composingKey(e))return;
      if(active){if(e.key==='Escape'){active.textContent=before;active.blur();}if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();active.blur();}return;}
      if(e.key==='Escape'){endGesture(true);select(null);return;}
      if(gesture)return;
      if(e.key==='Enter'){const node=object(e)||selected;if(node)select(node);return;}
      const node=selected;if(!node)return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const p=placement(node);if(!p.editable){send('layout-locked');return;}const n=e.shiftKey?10:1;
      let next={x:Math.min(10000,Math.max(-10000,p.x+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0))),y:Math.min(10000,Math.max(-10000,p.y+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0))),scale:p.scale};
      if(e.target===handle){
        const rect=node.getBoundingClientRect(),origin=getComputedStyle(node).transformOrigin.split(/\\s+/).map(parseFloat);
        if(rect.width<=0||rect.height<=0)return;
        next=gesturePlacement({...p,width:rect.width/zoom,height:rect.height/zoom,originX:origin[0]||0,originY:origin[1]||0},e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0,e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0,true);
      }
      if(next.x===p.x&&next.y===p.y&&next.scale===p.scale)return;
      paint(node,next);commitPlacement(node,next);
    });
    document.addEventListener('submit',e=>e.preventDefault());document.addEventListener('dragstart',e=>e.preventDefault());
    window.addEventListener('message',e=>{
      if(e.source!==parent||e.data?.channel!==channel||e.data.type!=='apply-placement')return;
      const p=e.data.placement;
      if(!p||![p.x,p.y,p.scale].every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(p.x)>10000||Math.abs(p.y)>10000||p.scale<.1||p.scale>5)return;
      const node=[...page.querySelectorAll('[data-doc-object]')].find(n=>n.getAttribute('data-doc-object')===e.data.id);
      if(!node||!placement(node).editable)return;
      const ack=pendingPlacements.findIndex(q=>q.id===e.data.id&&q.x===p.x&&q.y===p.y&&q.scale===p.scale);
      if(ack>=0){pendingPlacements.splice(ack,1);if(gesture?.node===node||pendingPlacements.some(q=>q.id===e.data.id))return;}
      else if(gesture?.node===node)endGesture(true);
      paint(node,p);if(ack<0||selected===node)select(node);
    });
    window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==channel)return;if(e.data.type==='request-ready')send('slide-ready',{width:w,height:h});if(e.data.type==='flush'){if(composing||settling){send('flush-blocked');return;}finishText();endGesture(false);send('flushed');}if(e.data.type==='select-object')select([...page.querySelectorAll('[data-doc-object]')].find(n=>n.getAttribute('data-doc-object')===e.data.id)||null);});
    window.addEventListener('blur',()=>endGesture(true));
    window.addEventListener('resize',fit);fit();send('slide-ready',{width:w,height:h});
  })();`;
}
