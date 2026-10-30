export type PixelRectangle={x:number;y:number;width:number;height:number};
export type ImageSize={width:number;height:number};
/** Cover the complete dragged area in the decoded, orientation-normalized image. */
export function rectangleFromDrag(start:{x:number;y:number},end:{x:number;y:number},display:{left:number;top:number;width:number;height:number},image:ImageSize):PixelRectangle|undefined{
 if(![start.x,start.y,end.x,end.y,display.left,display.top,display.width,display.height,image.width,image.height].every(Number.isFinite)||display.width<=0||display.height<=0||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<=0||image.height<=0)return undefined;
 const point=(p:{x:number;y:number})=>({x:Math.max(0,Math.min(image.width,(p.x-display.left)*image.width/display.width)),y:Math.max(0,Math.min(image.height,(p.y-display.top)*image.height/display.height))});
 const a=point(start),b=point(end);if(Math.abs(a.x-b.x)<0.5||Math.abs(a.y-b.y)<0.5)return undefined;
 const x=Math.floor(Math.min(a.x,b.x)),y=Math.floor(Math.min(a.y,b.y)),right=Math.ceil(Math.max(a.x,b.x)),bottom=Math.ceil(Math.max(a.y,b.y));return {x,y,width:right-x,height:bottom-y};
}
export function validRectangle(rect:PixelRectangle,image:ImageSize){return [rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=image.width&&rect.y+rect.height<=image.height;}
