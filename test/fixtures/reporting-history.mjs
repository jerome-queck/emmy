import { readFile, writeFile } from 'node:fs/promises';
import { historyBytes, historyHash } from '../../src/automation-reporting-discovery.mjs';
import { fixture } from './reporting-capture.mjs';
export function historyScope(records) {
  return {schemaVersion:2,kind:'automation-reporting-discovery-scope',recordScope:fixture(records).scope,owners:[{owner:'producer',anchor:{id:'anchor-one',parentId:'config-folder',name:'producer-history.json'},inventoryParentId:'config-folder',namespaces:['own'],singleWriter:true}]};
}
export function emptyPacket() {return {schemaVersion:1,kind:'automation-reporting-discovery-capture',anchorsBefore:[],anchorsAfter:[],inventories:[],objects:[]};}
export class FakeDrive {
  constructor(scope) {this.files=new Map();this.calls=[];this.counter=0;const owner=scope.owners[0]; this.files.set(owner.anchor.id,{id:owner.anchor.id,name:owner.anchor.name,parentId:owner.anchor.parentId,bytesBase64:historyBytes({schemaVersion:1,kind:'automation-reporting-discovery-anchor',owner:owner.owner,generation:0,inventory:null}).toString('base64')});}
  async save(path) {await writeFile(path,JSON.stringify({files:[...this.files],calls:this.calls,counter:this.counter}));}
  static async load(path) {const data=JSON.parse(await readFile(path)); const drive=Object.create(FakeDrive.prototype); Object.assign(drive,data,{files:new Map(data.files)});return drive;}
  async uploadImmutable(args) {this.calls.push({method:'uploadImmutable',args});const id='remote-'+(++this.counter);this.files.set(id,{...args,id}); return {id,raw:{synthetic:true,id}};}
  async getMetadata({id}) {this.calls.push({method:'getMetadata',id});const file=this.files.get(id);if(!file) throw new Error('missing exact ID');return {id,name:file.name,parents:[file.parentId],size:Buffer.from(file.bytesBase64,'base64').length,mimeType:'application/json',trashed:false,raw:{synthetic:true,id}};}
  async downloadRaw({id}) {this.calls.push({method:'downloadRaw',id});return {id,complete:true,bytesBase64:this.files.get(id).bytesBase64,acquisition:{mode:'file-reference',reference:'synthetic-file-reference-'+id},raw:{synthetic:true,id}};}
  async updatePointer(args) {this.calls.push({method:'updatePointer',args});this.files.set(args.id,{...args});return {id:args.id,raw:{synthetic:true,id:args.id}};}
  async readback(id) {return {metadata:await this.getMetadata({id}),download:await this.downloadRaw({id})};}
  async packet(scope) {const packet=emptyPacket();const anchor=scope.owners[0].anchor.id;packet.anchorsBefore.push(await this.readback(anchor));packet.anchorsAfter.push(await this.readback(anchor));let value=JSON.parse(Buffer.from(this.files.get(anchor).bytesBase64,'base64'));let ref=value.inventory; while(ref!==null) {packet.inventories.push(await this.readback(ref.id));value=JSON.parse(Buffer.from(this.files.get(ref.id).bytesBase64,'base64'));if(packet.objects.length===0) for(const namespace of value.namespaces) for(const entry of namespace.entries) packet.objects.push(await this.readback(entry.id));ref=value.previous?.inventory??null;}return packet;}
}
export const referenceFor = file => ({id:file.id,parentId:file.parentId,name:file.name,size:Buffer.from(file.bytesBase64,'base64').length,sha256:historyHash(Buffer.from(file.bytesBase64,'base64'))});
