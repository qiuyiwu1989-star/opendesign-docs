import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createPreview, inspectHtml } from './html';
import { addThread, reviewMessage, updateThread } from './review';
import { reviewMarkerScript } from './bento-review-markers';

describe('adapted Bento marker bridge', () => {
  it('authenticates updates, opens saved threads and retains resolved/missing markers', () => {
    const handlers: Record<string, (e: any) => void> = {};
    const sent: any[] = [], buttons: any[] = [];
    const make = (tag: string): any => ({tag, style:{}, attrs:{}, hidden:false,
      setAttribute(k:string,v:string){this.attrs[k]=v;},
      toggleAttribute(k:string,on:boolean){if(on)this.attrs[k]='';else delete this.attrs[k];},
      attachShadow:()=>({appendChild(n:any){if(n.tag==='button')buttons.push(n);}}),
      addEventListener(k:string,fn:any){this[k]=fn;}, remove(){this.removed=true;},
    });
    const target = {textContent:'Text',getAttribute:()=>inspectHtml('<p>Text</p>').targets[0]!.id,
      getBoundingClientRect:()=>({right:200,top:60,width:180,height:30})};
    const parent = {postMessage:(m:any)=>sent.push(m)};
    const win = {innerWidth:800,innerHeight:600,scrollX:0,scrollY:0,scrollTo(){},addEventListener(k:string,fn:any){handlers[k]=fn;}};
    const html = createPreview('<p>Text</p>', 'test-channel-123', false, 0, true, undefined, reviewMarkerScript);
    const runtime = html.match(/<script nonce="test-channel-123">([\s\S]*?)<\/script>/)![1]!;
    new Script(runtime).runInContext(createContext({parent,window:win,Element:class {},requestAnimationFrame:(fn:any)=>fn(),
      document:{createElement:make,documentElement:{appendChild(){},append(){}},querySelectorAll:()=>[target],addEventListener(){}}}));
    const anchor={kind:'text' as const,id:target.getAttribute(),quote:'Text'};
    let review=addThread({id:'d',revision:0,threads:[]},'v',anchor,reviewMessage('R','Check this'));
    const send=(data:any, source=parent)=>handlers.message!({source,data:{channel:'test-channel-123',...data}});
    send({type:'review-markers',threads:review.threads}, {} as typeof parent);
    send({type:'review-markers',threads:review.threads,channel:'wrong'});
    expect(buttons).toHaveLength(0);
    send({type:'request-ready'}); expect(sent.at(-1).type).toBe('ready');
    send({type:'review-markers',threads:review.threads});
    expect(buttons[0].style.left).toBe('188px');
    expect(buttons[0].textContent).toBe('1');
    buttons[0].click({stopPropagation(){}});
    expect(sent.at(-1)).toMatchObject({type:'review-open',id:review.threads[0]!.id});
    expect(buttons[0].attrs['data-active']).toBe('');
    review=updateThread(review,review.threads[0]!.id,true);
    send({type:'review-markers',threads:review.threads});
    expect(buttons[1].className).toContain('resolved');
    const region={kind:'region' as const,x:20,y:30,width:100,height:60,viewportWidth:900};
    const regionReview=addThread(review,'v',region,reviewMessage('R','region'));
    send({type:'review-markers',threads:regionReview.threads});
    expect(buttons.slice(2).map(button => button.textContent)).toEqual(['1','2']);
    expect(buttons[3].title).toContain('位置待定位');
    expect(buttons[3].style.top).toBe('8px');
    buttons[3].click({stopPropagation(){}});
    expect(sent.at(-1)).toMatchObject({type:'review-open',id:regionReview.threads[1]!.id});
  });
});
