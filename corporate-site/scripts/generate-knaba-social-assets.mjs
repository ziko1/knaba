/** Raster exports of the existing approved localized wordmark, not new artwork.
 * Uses the Sharp image engine already pinned by Astro in package-lock.json.
 * Run: node scripts/generate-knaba-social-assets.mjs
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SUPPORTED_LOCALES,render3dLogo} from './generate-knaba-3d-assets.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=new URL('../',import.meta.url);
const receipt={
  scope:'Existing approved four-language SVG branding exported as opaque raster social cards',
  width:1200,height:630,type:'image/png',background:'#FBFCF7',
  renderer:{sharp:sharp.versions.sharp,vips:sharp.versions.vips},locales:[],
};
for(const locale of SUPPORTED_LOCALES){
  const suffix=locale==='de'?'':'-'+locale;
  const sourcePath=`public/images/knaba-3d-header${suffix}.svg`;
  const imagePath=`public/images/knaba-social-${locale}.png`;
  const source=await readFile(new URL(sourcePath,root));
  if(source.toString('utf8')!==render3dLogo('header',false,locale))
    throw new Error(`The ${locale} source logo differs from the approved brand generator`);
  const logo=await sharp(source).resize({width:1080}).png().toBuffer();
  const image=await sharp({create:{width:1200,height:630,channels:3,background:'#FBFCF7'}})
    .composite([{input:logo,gravity:'centre'}]).removeAlpha()
    .png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();
  await writeFile(new URL(imagePath,root),image);
  receipt.locales.push({locale,sourcePath,imagePath,sourceSha256:digest(source),imageSha256:digest(image),bytes:image.length});
}
const evidence=new URL('docs/evidence/requirements-followup-20261028/',root);
await mkdir(evidence,{recursive:true});
await writeFile(new URL('social-assets.json',evidence),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({locales:receipt.locales.length,width:receipt.width,height:receipt.height,bytes:receipt.locales.reduce((total,item)=>total+item.bytes,0)}));
