import {it,expect} from 'vitest';
import {pageBounds} from './thinking-page-bounds';
it('retains whole page bounds for a small title',()=>{const bounds={x:0,y:0,width:1600,height:900};expect(pageBounds({pageBounds:bounds,elements:[{x:600,y:300,width:200,height:50}]})).toEqual(bounds);});
it('legacy content gets a full 16:9 page with whitespace',()=>{const b=pageBounds({elements:[{x:600,y:300,width:200,height:50}]});expect(b.width).toBe(1600);expect(b.height).toBe(900);expect(b.x).toBe(-100);});
