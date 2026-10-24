import {describe,expect,it} from 'vitest';
import {rectangleFromDrag,validRectangle} from './redactionGeometry';
describe('manual client-copy pixel coverage',()=>{
 it('covers every dragged subpixel after responsive scaling',()=>{expect(rectangleFromDrag({x:11.1,y:21.1},{x:19.2,y:27.2},{left:10,top:20,width:120,height:80},{width:240,height:160})).toEqual({x:2,y:2,width:17,height:13});});
 it('supports reverse drag and clips to image boundaries',()=>{expect(rectangleFromDrag({x:500,y:500},{x:-50,y:-20},{left:0,top:0,width:120,height:80},{width:240,height:160})).toEqual({x:0,y:0,width:240,height:160});});
 it('rejects a click, invalid dimensions and nonfinite pointers',()=>{const display={left:0,top:0,width:100,height:100},image={width:200,height:200};expect(rectangleFromDrag({x:1,y:1},{x:1,y:1},display,image)).toBeUndefined();expect(rectangleFromDrag({x:NaN,y:1},{x:10,y:10},display,image)).toBeUndefined();expect(rectangleFromDrag({x:1,y:1},{x:10,y:10},{...display,width:0},image)).toBeUndefined();});
 it('accepts integral edge masks and rejects out-of-bounds or transparent-size masks',()=>{const image={width:240,height:160};expect(validRectangle({x:239,y:159,width:1,height:1},image)).toBe(true);expect(validRectangle({x:239,y:159,width:2,height:1},image)).toBe(false);expect(validRectangle({x:0.1,y:0,width:10,height:10},image)).toBe(false);expect(validRectangle({x:0,y:0,width:0,height:10},image)).toBe(false);});
});
