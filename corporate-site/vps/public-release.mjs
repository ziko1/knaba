/** Public delivery metadata: allowlisted presentation fields only, never secrets. */
export const releaseLanguages=Object.freeze(['de','en','pl','lt','ru','uk']);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
function https(value){
  if(typeof value!=='string'||value.length>1200)return null;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port?u:null;}catch{return null;}
}
export function publicRelease(env={},origin='https://knaba.de'){
  const site=https(origin),working=https(env.KNABA_WORKING_ORIGIN);
  const workingOrigin=working&&working.pathname==='/'&&!working.search&&env.KNABA_WORKING_ORIGIN_VERIFIED==='true'?working.origin:null;
  const number=String(env.KNABA_VERIFIED_WHATSAPP_NUMBER??'');
  const username=String(env.KNABA_VERIFIED_TELEGRAM_BOT??'');
  const android=https(env.KNABA_ANDROID_APK_URL),androidSha=sha(env.KNABA_ANDROID_APK_SHA256);
  const androidMode=['prototype','release'].includes(env.KNABA_ANDROID_DISTRIBUTION)?env.KNABA_ANDROID_DISTRIBUTION:null;
  const allowedHosts=new Set(['knaba.de','www.knaba.de','kneba.vsp.rest',site?.hostname,working?.hostname]);
  const androidUrl=android&&allowedHosts.has(android.hostname)&&!android.search&&/^\/downloads\/[A-Za-z0-9._-]+\.apk$/.test(android.pathname)&&androidSha&&androidMode?android.href:null;
  const ios=https(env.KNABA_IOS_INSTALL_URL);
  const iosUrl=ios&&!ios.search&&((ios.hostname==='testflight.apple.com'&&/^\/join\/[a-zA-Z0-9]{5,24}$/.test(ios.pathname))||(ios.hostname==='apps.apple.com'&&/^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+\/?$/.test(ios.pathname)))?ios.href:null;
  const erp=https(env.KNABA_ERP_PUBLIC_ORIGIN);
  return {
    schemaVersion:1,defaultLanguage:'de',languages:[...releaseLanguages],
    stage:env.KNABA_RELEASE_STAGE==='production'?'production':'prototype',
    migration:{state:workingOrigin?'configured':'pending',workingOrigin},
    android:{status:androidUrl?'available':'pending',url:androidUrl,sha256:androidUrl?androidSha:null,distribution:androidUrl?androidMode:null,version:androidUrl&&/^[0-9][A-Za-z0-9.+_-]{0,39}$/.test(env.KNABA_ANDROID_VERSION??'')?env.KNABA_ANDROID_VERSION:null},
    ios:{status:iosUrl?'available':'pending',url:iosUrl},
    channels:{
      whatsapp:{status:/^[1-9][0-9]{7,14}$/.test(number)?'configured':'pending',url:/^[1-9][0-9]{7,14}$/.test(number)?'https://wa.me/'+number:null},
      telegram:{status:/^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i.test(username)&&username.length<=32?'configured':'pending',url:/^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i.test(username)&&username.length<=32?'https://t.me/'+username+'?start=website':null}
    },
    erpOrigin:erp&&erp.pathname==='/'&&!erp.search?erp.origin:null
  };
}
