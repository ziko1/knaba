/**
 * Reuse the approved KNABA three-building glyph; do not redraw the brand.
 * Run after npm ci: node scripts/generate-favicons.mjs
 * sharp is already pinned in the Astro dependency tree; no runtime dependency is added.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';

const source=readFileSync(new URL('../public/images/knaba-3d-header.svg',import.meta.url),'utf8');
const defs=source.match(/  <defs>[\s\S]*?  <\/defs>/)?.[0];
const start=source.indexOf('  <g aria-hidden="true">');
const end=source.indexOf('  <g font-family=',start);
assert.ok(defs&&start>=0&&end>start,'Approved logo structure changed; review the glyph extraction');
const mark=source.slice(start,end).trim();
assert.ok(!/<(?:text|image|script|foreignObject)\b/.test(mark),'Favicon must contain only the approved vector glyph');

// A square white field keeps the dark teal legible on light/dark search surfaces.
// The original paths retain their coordinates, with space for circular masking.
const svg=[
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-16 -65 448 448" role="img" aria-labelledby="knaba-favicon-title knaba-favicon-desc">',
  '<title id="knaba-favicon-title">KNABA</title>',
  '<desc id="knaba-favicon-desc">Drei geometrische Bauwerke in Türkis mit limettengrüner Basis</desc>',
  defs,
  '<rect x="-16" y="-65" width="448" height="448" fill="#fff"/>',
  mark,
  '</svg>',
  ''
].join('\n');
const publicFile=name=>new URL('../public/'+name,import.meta.url);
writeFileSync(publicFile('favicon.svg'),svg);
const raster=size=>sharp(Buffer.from(svg),{density:288}).resize(size,size).png().toBuffer();
writeFileSync(publicFile('favicon.png'),await raster(192));

// ICO directory followed by PNG-compressed frames (supported by modern browsers).
const sizes=[16,32,48,64];
const frames=await Promise.all(sizes.map(raster));
const directory=Buffer.alloc(6+16*sizes.length);
directory.writeUInt16LE(1,2);
directory.writeUInt16LE(sizes.length,4);
let offset=directory.length;
for(let i=0;i<sizes.length;i++){
  const entry=6+16*i;
  directory[entry]=sizes[i]; directory[entry+1]=sizes[i];
  directory.writeUInt16LE(1,entry+4); directory.writeUInt16LE(32,entry+6);
  directory.writeUInt32LE(frames[i].length,entry+8); directory.writeUInt32LE(offset,entry+12);
  offset+=frames[i].length;
}
writeFileSync(publicFile('favicon.ico'),Buffer.concat([directory,...frames]));
console.log('Generated KNABA SVG, 192x192 PNG and 16/32/48/64 ICO from the approved building glyph.');
