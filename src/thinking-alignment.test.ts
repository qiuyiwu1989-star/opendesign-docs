import {it,expect} from 'vitest';
import {pageCenterOffset} from './thinking-alignment';
it('centers selection horizontally without changing vertical position',()=>expect(pageCenterOffset({x:0,y:0,width:1600,height:900},[100,200,500,300],'x')).toEqual({dx:500,dy:0}));
it('centers against migrated page origin',()=>expect(pageCenterOffset({x:-500,y:-200,width:1600,height:900},[100,200,500,300],'y')).toEqual({dx:0,dy:0}));
