/**
 * Refresh the four localized social previews from KNABA's approved SVG logo art.
 * Run after npm ci: node scripts/generate-social-cards.mjs
 * Uses Astro's existing locked Sharp dependency; no third-party imagery or tracking.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';

const variants = {
  de: {heading: 'Baureinigung & BauService', region: 'Berlin & Brandenburg · Bauhelfer'},
  en: {heading: 'Construction cleaning & site support', region: 'Berlin & Brandenburg'},
  uk: {heading: 'Будівельний клінінг та BauService', region: 'Берлін і Бранденбург'},
  ru: {heading: 'Строительный клининг и BauService', region: 'Берлин и Бранденбург'},
};
const escapeXml = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const W=1200, H=630;
for (const [locale, text] of Object.entries(variants)) {
  const suffix=locale==='de'?'':'-'+locale;
  const source=resolve('public/images/knaba-3d-header'+suffix+'.svg');
  const target=resolve('public/images/knaba-social'+suffix+'.png');
  const logo=await sharp(await readFile(source)).resize({width:1040}).png().toBuffer();
  const background=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="1200" height="630" fill="#f0f8f4"/>
    <rect width="1200" height="13" fill="#c5ef69"/>
    <rect x="79" y="434" width="92" height="6" rx="3" fill="#0b8388"/>
    <text x="79" y="507" font-family="Arial,DejaVu Sans,sans-serif" font-size="41" font-weight="700" fill="#102f38">${escapeXml(text.heading)}</text>
    <text x="79" y="565" font-family="Arial,DejaVu Sans,sans-serif" font-size="27" fill="#335b59">${escapeXml(text.region)}</text>
  </svg>`);
  const png=await sharp(background).composite([{input:logo,left:79,top:45}])
    .png({compressionLevel:9,effort:10,palette:true,colours:256}).toBuffer();
  const info=await sharp(png).metadata();
  if(info.width!==W || info.height!==H || info.format!=='png')throw Error('Invalid PNG output: '+locale);
  await writeFile(target,png);
  console.log(JSON.stringify({locale,target,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')}));
}
