import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [source,method,input,pause]=process.argv.slice(2);
let paused=false;globalThis.__ownerTurnGate=async(phase,path)=>{if(phase!==pause||paused)return;paused=true;process.send({phase,path,pid:process.pid});await new Promise(resolve=>process.once('message',resolve));};
try{const api=await import(pathToFileURL(source));const result=await api[method](JSON.parse(await readFile(input,'utf8')));process.send({result});}catch(error){process.send({error:error.message});process.exitCode=1;}
process.disconnect();
