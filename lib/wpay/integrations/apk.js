"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),{createHash}=require("node:crypto");
const {AuthError}=require("../auth/runtime/errors");
const ROOT=path.resolve(__dirname,"../../..");
class ApkArtifact {
  constructor(root=ROOT){this.root=root;}
  async inspect(download=false){
    try{
      const [bytes,source,evidence]=await Promise.all([
        fs.readFile(path.join(this.root,"public/downloads/WPAY-Agent.apk")),
        fs.readFile(path.join(this.root,"public/downloads/WPAY-Agent.json"),"utf8").then(JSON.parse),
        fs.readFile(path.join(this.root,"docs/wpay-apk-evidence.json"),"utf8").then(JSON.parse)
      ]);
      const sha256=createHash("sha256").update(bytes).digest("hex");
      if(bytes.readUInt32LE(0)!==0x04034b50 || sha256!==evidence.sha256 || bytes.length!==evidence.bytes ||
         source.version!==evidence.versionName || evidence.signatureVerified!==true ||
         !/^[0-9a-f]{40}$/.test(source.commit) || !Number.isFinite(Date.parse(source.builtAt))) throw Error();
      if(download)return bytes;
      return {available:true,version:source.version,build:evidence.versionCode,package:evidence.package,
        minimumAndroidApi:evidence.minimumAndroidApi,targetAndroidApi:evidence.targetAndroidApi,
        bytes:bytes.length,sha256,builtAt:source.builtAt,sourceCommit:source.commit,
        signing:{verified:true,scheme:evidence.signatureScheme,identity:evidence.signer,sha256:evidence.signerSha256},
        refreshedAt:new Date().toISOString(),source:"Existing APK and JSON, reconciled with hash-bound Android SDK inspection",
        downloadPath:"/wpay-auth/apk/download"};
    }catch{throw new AuthError("UNAVAILABLE");}
  }
}
module.exports={ApkArtifact};
