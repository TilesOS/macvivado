const {execFileSync}=require('node:child_process');
const path=require('node:path');
exports.default=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-','--entitlements',path.resolve('resources/entitlements.mac.plist'),path.join(context.appOutDir,'MacVivado.app')],{stdio:'inherit'});
};
