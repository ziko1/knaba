/** Export the approved website glyph for native packaging; no new artwork or dependency. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(new URL('../../erp/package.json',import.meta.url));
const sharp=require('sharp');
const root=new URL('../../',import.meta.url);
const sourcePath='corporate-site/public/favicon.svg';
const source=readFileSync(new URL(sourcePath,root),'utf8');
assert.match(source,/viewBox="-16 -65 448 448"/,'Review changed canonical icon geometry');
assert.ok(!/<(?:image|use|text|circle|polygon|polyline|ellipse|clipPath|mask|filter|script|foreignObject)\b|\b(?:transform|href)=/i.test(source),'Review unsupported SVG constructs before exporting');
const paths=[...source.matchAll(/<path\b[^>]*\/>/g)].map(match=>Object.fromEntries([...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(attribute=>[attribute[1],attribute[2]])));
assert.ok(paths.length>20,'Canonical three-building paths are missing');
const android='erp/apps/mobile-android/app/src/main/res/';
const ios='erp/apps/mobile-ios/Resources/Assets.xcassets/';
const files=new Map();
const png=await sharp(Buffer.from(source),{density:288}).resize(1024,1024).flatten({background:'#ffffff'}).removeAlpha().png({compressionLevel:9}).toBuffer();
files.set(ios+'AppIcon.appiconset/AppIcon.png',png);
const foreground=await sharp(Buffer.from(source),{density:288}).resize(660,660).extend({top:210,bottom:210,left:210,right:210,background:{r:255,g:255,b:255,alpha:0}}).png({compressionLevel:9}).toBuffer();
files.set(android+'drawable-nodpi/knaba_launcher_foreground.png',foreground);
files.set(android+'drawable/ic_knaba_foreground.xml','<?xml version="1.0" encoding="utf-8"?>\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/knaba_launcher_foreground" android:gravity="fill" />\n');
const outline=paths.map(path=>{
 const attributes=[`android:pathData="${path.d}"`,`android:fillColor="${path.fill==='none'?'#00000000':'#FFFFFFFF'}"`];
 if(path.stroke&&path.stroke!=='none')attributes.push('android:strokeColor="#FFFFFFFF"',`android:strokeWidth="${path['stroke-width']??1}"`);
 if(path['stroke-linejoin'])attributes.push(`android:strokeLineJoin="${path['stroke-linejoin']}"`);
 if(path['stroke-linecap'])attributes.push(`android:strokeLineCap="${path['stroke-linecap']}"`);
 return '        <path '+attributes.join(' ')+' />';
}).join('\n');
files.set(android+'drawable/ic_knaba_monochrome.xml',`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="1080" android:viewportHeight="1080">
    <!-- Exact canonical paths, placed inside the adaptive icon safe area. -->
    <group android:translateX="210" android:translateY="210">
      <group android:scaleX="${660/448}" android:scaleY="${660/448}">
        <group android:translateX="16" android:translateY="65">
${outline}
        </group>
      </group>
    </group>
</vector>
`);
for(const version of [26,33])files.set(android+`mipmap-anydpi-v${version}/ic_launcher.xml`,`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@android:color/white" />
    <foreground android:drawable="@drawable/ic_knaba_foreground" />
${version===33?'    <monochrome android:drawable="@drawable/ic_knaba_monochrome" />\n':''}</adaptive-icon>
`);
const wordmarkSourcePath='corporate-site/public/images/knaba-3d-mobile-header.svg';
const wordmarkSource=readFileSync(new URL(wordmarkSourcePath,root),'utf8');
assert.match(wordmarkSource,/viewBox="0 0 1140 280"/,'Review changed canonical compact wordmark geometry');
assert.ok(!/<(?:image|script|foreignObject)\b|\b(?:href|onload)=/i.test(wordmarkSource),'Wordmark export must remain self-contained');
const wordmark=await sharp(Buffer.from(wordmarkSource),{density:144}).resize(1140,280).png({compressionLevel:9}).toBuffer();
files.set(android+'drawable-nodpi/knaba_wordmark.png',wordmark);
files.set(ios+'BrandWordmark.imageset/BrandWordmark.png',wordmark);
const info={author:'KNABA',version:1};
files.set(ios+'BrandWordmark.imageset/Contents.json',JSON.stringify({images:[{filename:'BrandWordmark.png',idiom:'universal'}],info},null,2)+'\n');
files.set(ios+'Contents.json',JSON.stringify({info},null,2)+'\n');
files.set(ios+'AppIcon.appiconset/Contents.json',JSON.stringify({images:[{filename:'AppIcon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info},null,2)+'\n');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={canonicalSource:sourcePath,canonicalSha256:sha256(source),wordmarkSource:wordmarkSourcePath,wordmarkSourceSha256:sha256(wordmarkSource),renderer:{sharp:sharp.versions.sharp,librsvg:sharp.versions.rsvg},androidSafeArea:{canvas:1080,sourceSquare:660,inset:210},files:[...files].map(([path,bytes])=>({path,sha256:sha256(bytes)}))};
files.set('docs/mobile/BRAND_ASSETS.json',JSON.stringify(manifest,null,2)+'\n');
const check=process.argv.includes('--check');
for(const [path,bytes] of files){
 const target=new URL(path,root);
 if(check)assert.deepEqual(readFileSync(target),Buffer.from(bytes),`Regenerate stale native brand asset: ${path}`);
 else {mkdirSync(dirname(fileURLToPath(target)),{recursive:true});writeFileSync(target,bytes);}
}
console.log(`${check?'Verified':'Exported'} ${files.size} native brand inputs from the canonical three-building SVG.`);
