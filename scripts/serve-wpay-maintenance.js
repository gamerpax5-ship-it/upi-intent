'use strict';
const http=require('node:http');
// Explicit isolated staging maintenance process: no application/database imports.
function createServer(){return http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Retry-After','120');
 if(req.method==='GET'&&req.url==='/maintenance-healthz'){res.writeHead(200);res.end(JSON.stringify({maintenance:true}));return;}
 res.writeHead(503);res.end(JSON.stringify({ready:false,maintenance:true,message:'WPay staging maintenance. Please try again shortly.'}));
});}
function main(){
 if(process.env.RAILWAY_PROJECT_ID!=='a491d4fe-ef8e-478d-b446-2e6d9df9a2e9'||process.env.RAILWAY_SERVICE_ID!=='28376855-0819-4b0b-93b0-2facc814f81e'||!/^[1-9][0-9]{0,4}$/.test(process.env.PORT||'')||Number(process.env.PORT)>65535)throw Error('WPAY_MAINTENANCE_TARGET_INVALID');
 const server=createServer();server.listen(Number(process.env.PORT),'0.0.0.0');const stop=()=>{server.close();server.closeAllConnections();};process.once('SIGTERM',stop);process.once('SIGINT',stop);return server;
}
if(require.main===module){try{main();}catch{console.error('WPAY_MAINTENANCE_UNAVAILABLE');process.exitCode=1;}}
module.exports={createServer,main};
