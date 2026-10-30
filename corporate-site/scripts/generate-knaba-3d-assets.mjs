/** KNABA 3D wordmark: deterministic first-party transparent SVG exports.
 * Original three chevron buildings, site-lime A and official KNABA slogan.
 * Palette corporate-site/src/styles/global.css (#102F38 #13B8B4 #D8F779).
 * To regenerate: node scripts/generate-knaba-3d-assets.mjs
 */
import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

// One approved, version-controlled source for both rendered logos and HTML metadata.
const COPY=JSON.parse(readFileSync(new URL('../src/data/brand-messages.json',import.meta.url),'utf8'));
export const SUPPORTED_LOCALES=Object.freeze(Object.keys(COPY));
export const SLOGANS=Object.freeze(Object.fromEntries(SUPPORTED_LOCALES.map(code=>[code,COPY[code].slogan])));
export const BRAND_DESCRIPTIONS=Object.freeze(Object.fromEntries(SUPPORTED_LOCALES.map(code=>[code,COPY[code].svgDescription])));

function building(cx,top,count,halfWidth) {
  return Array.from({length:count},(_,n)=>{
    const y=top+27*n,left=cx-halfWidth,right=cx+halfWidth;
    return `<g>
      <path d="M${left} ${y+27} ${cx-4} ${y} V${y+17} L${left} ${y+44} Z" fill="url(#buildingLeft)" stroke="#0A343E" stroke-width="1.2"/>
      <path d="M${cx+4} ${y} ${right} ${y+27} V${y+44} L${cx+4} ${y+17} Z" fill="url(#buildingRight)" stroke="#0A343E" stroke-width="1.2"/>
      <path d="M${left+4} ${y+28} ${cx-5} ${y+5} M${cx+5} ${y+5} ${right-4} ${y+28}" fill="none" stroke="#6DE3DC" stroke-opacity=".65" stroke-width="2.3"/>
    </g>`;
  }).join('');
}

export function render3dLogo(surface,compact=false,locale='de') {
  if(!SUPPORTED_LOCALES.includes(locale))throw new TypeError('Unsupported KNABA logo locale');
  if(surface!=='header'&&surface!=='footer')throw new TypeError('Unknown KNABA logo surface');
  const light=surface==='header';
  const face1=light?'#102F38':'#F6FFFA',face2=light?'#087C81':'#BDEFE7';
  const depth=light?'#061F28':'#47666A',slogan=light?'#102F38':'#F6FFFA';
  const viewHeight=compact?280:350;
  const desktopTagline=compact?'':`<text x="24" y="333" textLength="1086" lengthAdjust="spacingAndGlyphs" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="400" fill="${slogan}">${SLOGANS[locale]}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1140 ${viewHeight}" role="img" aria-labelledby="knaba-title knaba-desc">
  <title id="knaba-title">KNABA</title>
  <desc id="knaba-desc">${BRAND_DESCRIPTIONS[locale]}${compact?'':', '+SLOGANS[locale]}</desc>
  <defs>
    <linearGradient id="buildingLeft" x1="0" x2=".9" y1=".15" y2="1"><stop stop-color="#13B8B4"/><stop offset=".32" stop-color="#087C81"/><stop offset=".72" stop-color="#102F38"/><stop offset="1" stop-color="#164F5A"/></linearGradient>
    <linearGradient id="buildingRight" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#007B89"/><stop offset=".42" stop-color="#102F38"/><stop offset="1" stop-color="#0C646F"/></linearGradient>
    <linearGradient id="metalInk" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${face2}"/><stop offset=".2" stop-color="${face1}"/><stop offset=".72" stop-color="${face1}"/><stop offset="1" stop-color="${face2}"/></linearGradient>
    <linearGradient id="limeAccent" x1="0" x2=".45" y1="0" y2="1"><stop stop-color="#F3FFC6"/><stop offset=".24" stop-color="#D8F779"/><stop offset=".7" stop-color="#9DBD51"/><stop offset="1" stop-color="#EAFFA6"/></linearGradient>
    <linearGradient id="limeBase" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#F3FFC6"/><stop offset=".35" stop-color="#D8F779"/><stop offset="1" stop-color="#688456"/></linearGradient>
  </defs>
  <g aria-hidden="true">
    ${building(92,91,6,56)}
    ${building(208,37,8,62)}
    ${building(324,91,6,56)}
    <rect x="34" y="266" width="347" height="13" rx="2.5" fill="url(#limeBase)"/>
    <path d="M34 266H381" fill="none" stroke="#EAF5C3" stroke-width="2" opacity=".88"/>
  </g>
  <g font-family="Arial,Helvetica,sans-serif" font-size="206" font-weight="800" letter-spacing="-4" aria-hidden="true">
    <text x="396" y="256" textLength="728" lengthAdjust="spacingAndGlyphs" fill="${depth}" stroke="${depth}" stroke-width="6" transform="translate(3 5)">KNABA</text>
    <text x="396" y="256" textLength="728" lengthAdjust="spacingAndGlyphs" fill="url(#metalInk)" stroke="${depth}" stroke-width="2.5" paint-order="stroke fill">KN<tspan fill="url(#limeAccent)" stroke="${light?'#102F38':'#BDEFE7'}" stroke-width="2">A</tspan>BA</text>
  </g>
${desktopTagline}
</svg>\n`;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
 const out=resolve(dirname(fileURLToPath(import.meta.url)),'../public/images');
 for(const locale of SUPPORTED_LOCALES) {
   const suffix=locale==='de'?'':'-'+locale;
   for(const [surface,compact,filename] of [
     ['header',false,'knaba-3d-header'+suffix+'.svg'],
     ['footer',false,'knaba-3d-footer'+suffix+'.svg'],
     ['header',true,'knaba-3d-mobile-header'+suffix+'.svg'],
     ['footer',true,'knaba-3d-mobile-footer'+suffix+'.svg']
   ]) writeFileSync(resolve(out,filename),render3dLogo(surface,compact,locale),'utf8');
 }
}
