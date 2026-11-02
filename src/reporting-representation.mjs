import { AsyncLocalStorage } from 'node:async_hooks';
const accounting = new AsyncLocalStorage();
function stringSize(value) {
  let size=2;
  for(let index=0;index<value.length;index++) {const code=value.charCodeAt(index);if(code===34||code===92||[8,9,10,12,13].includes(code))size+=2;else if(code<32)size+=6;else if(code>=0xd800&&code<=0xdbff&&index+1<value.length&&value.charCodeAt(index+1)>=0xdc00&&value.charCodeAt(index+1)<=0xdfff){size+=4;index++;}else if(code>=0xd800&&code<=0xdfff)size+=6;else size+=code<128?1:code<2048?2:3;}
  return size;
}
export function serializedSize(value) {
  if(value===null)return 4;if(typeof value==='string')return stringSize(value);if(typeof value==='boolean')return value?4:5;if(typeof value==='number')return Number.isFinite(value)?Buffer.byteLength(String(value)):4;
  if(Array.isArray(value))return 2+Math.max(0,value.length-1)+Array.from(value).reduce((sum,item)=>sum+serializedSize(item??null),0);
  if(value instanceof Date)return Number.isFinite(value.getTime())?(value.getUTCFullYear()>=0&&value.getUTCFullYear()<=9999?26:29):4;
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||typeof value.toJSON==='function')throw new Error('Only plain JSON evidence values are supported');
  const entries=Object.entries(value).filter(([,item])=>item!==undefined);return 2+Math.max(0,entries.length-1)+entries.reduce((sum,[key,item])=>sum+stringSize(key)+1+serializedSize(item),0);
}
export const withReportingAccounting=(job,operation)=>accounting.run(job,operation);
export function chargeReportingJSON(value) {accounting.getStore()?.diagnostic(serializedSize(value),'serialized');}
export function chargeReportingBytes(size,category='generated') {accounting.getStore()?.diagnostic(size,category);}
