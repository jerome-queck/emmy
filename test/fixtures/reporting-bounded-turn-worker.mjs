import { readFile,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [source,method,input,pause]=process.argv.slice(2);let paused=false;
async function gate(phase,detail={}){if(phase!==pause||paused)return;paused=true;process.send({phase,pid:process.pid,...detail});await new Promise(resolve=>process.once('message',resolve));}
globalThis.__ownerTurnGate=async(phase,path,turn)=>gate(phase,{path,turn});
globalThis.__receiptGate=async(phase,job,detail={})=>gate(phase,{open:job.receiptAttempt?.open,deadline:job.deadline,actuals:job.actuals(),...detail});
globalThis.__receiptWrite=detail=>process.send({write:detail});
globalThis.__expireAfterBody=method==='runFileExpire';
globalThis.__marginPressure=async(job,required)=>{if(!method.startsWith('runFileMargin'))return;const delta=method.endsWith('Below')?1:0;const size=job.limit-job.charged-required-8192-job.retentionBytes+delta;if(size<1)throw Error('Pressure control cannot fit');const path=input+'.pressure';await writeFile(path,Buffer.alloc(size,120));const before=job.actuals();await job.read(path);process.send({margin:{delta,size,required,before,after:job.actuals(),expectedTotal:job.charged+required+8192+job.retentionBytes}});};
try{const api=await import(pathToFileURL(source));const request=JSON.parse(await readFile(input,'utf8'));const result=method.startsWith('runFile')?await api.runBoundedHistoryFile(request.action,request.file,{launch:request.launch}):await api[method](request);process.send({result});}catch(error){process.send({error:error.message});process.exitCode=1;}
process.disconnect();
