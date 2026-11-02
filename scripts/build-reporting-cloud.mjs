import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['reporting-representation', 'bounded-json', 'reporting-privacy', 'improvement-report', 'automation-reporting-outcome', 'automation-reporting-expectations', 'automation-reporting', 'automation-reporting-binding', 'automation-reporting-capture', 'automation-reporting-discovery', 'automation-reporting-bounded'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = [];
let bundle = '#!/usr/bin/env node\n// Generated from the exact product modules. Do not edit.\nconst modules = {};\n';
for (const name of names) {
  const path = `src/${name}.mjs`;
  const bytes = await readFile(join(root, path));
  let source = bytes.toString('utf8');
  const exported = [];
  source = source.replace(/^import \{ ([A-Za-z0-9_, ]+) \} from '([^']+)';\n/gm, (_, members, specifier) => {
    if (!members.split(',').every(member => /^\s*[A-Za-z_$][\w$]*\s*$/.test(member))) throw new Error('Unsupported import members');
    if (specifier.startsWith('node:')) return `const { ${members} } = await import('${specifier}');\n`;
    const dependency = specifier.match(/^\.\/([a-z-]+)\.mjs$/)?.[1];
    if (!names.slice(0, names.indexOf(name)).includes(dependency)) throw new Error('Unsupported module dependency');
    return `const { ${members} } = modules['${dependency}'];\n`;
  });
  source = source.replace(/^export (async )?(function|const) ([A-Za-z_$][\w$]*)/gm, (_, asyncWord = '', kind, symbol) => { exported.push(symbol); return `${asyncWord}${kind} ${symbol}`; });
  if (/^\s*(?:import|export)\b/m.test(source)) throw new Error(`Unsupported module syntax in ${path}`);
  bundle += `modules['${name}'] = await (async () => {\n${source}\nreturn { ${exported.join(', ')} };\n})();\n`;
  let committedBytes = null;
  try { committedBytes = execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, stdio: ['ignore','pipe','pipe'] }); } catch {}
  const sourceState = committedBytes !== null && sha256(committedBytes) === sha256(bytes) ? 'committed' : 'working-tree';
  sources.push({ path, sha256: sha256(bytes), bytes: bytes.length, sourceState, commit: sourceState === 'committed' ? execFileSync('git', ['log', '-1', '--format=%H', '--', path], { cwd: root, encoding: 'utf8' }).trim() : null });
}
bundle += String.raw`
const { open: cloudOpen, lstat: cloudLstat, realpath: cloudRealpath, unlink: cloudUnlink } = await import('node:fs/promises');
const { constants: cloudConstants } = await import('node:fs');
const { isAbsolute: cloudAbsolute, resolve: cloudResolve, dirname: cloudDirname, parse: cloudParse } = await import('node:path');
const { createHash: cloudHash } = await import('node:crypto');
const cloudNeed = (ok, message) => { if (!ok) throw new Error(message); };
async function cloudRead(path, limit = 32769, raw = false) {
  const handle = await cloudOpen(path, cloudConstants.O_RDONLY | cloudConstants.O_NOFOLLOW | cloudConstants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    cloudNeed(stat.isFile() && stat.size <= limit, 'Expected bounded ordinary input');
    const bytes = Buffer.alloc(limit + 1); let count = 0;
    while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
    cloudNeed(count <= limit, 'Input exceeds byte bound');
    return raw ? bytes.subarray(0, count) : new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}
async function cloudOutput(path, bytes) {
  cloudNeed(cloudAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'Output requires absolute path without traversal');
  const selected = cloudResolve(path); let current = cloudDirname(selected);
  while (true) {
    cloudNeed((await cloudLstat(current)).isDirectory(), 'Output ancestry must contain ordinary directories');
    if (current === cloudParse(current).root) break;
    current = cloudDirname(current);
  }
  cloudNeed(await cloudRealpath(cloudDirname(selected)) === cloudDirname(selected), 'Symlinked output ancestry refused');
  let handle;
  try { handle = await cloudOpen(selected, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = await cloudLstat(selected);
    cloudNeed(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600, 'Existing output must be an ordinary private file');
    cloudNeed(await cloudRead(selected) === bytes, 'Output exists with different bytes');
    return 'identical';
  }
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close(); await cloudUnlink(selected); throw error; }
  await handle.close();
  cloudNeed(await cloudRead(selected) === bytes, 'Output readback mismatch');
  return 'prepared';
}
async function cloudMain(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('history-bounded begin|advance|next|respond|recover|retry-read --file ABSOLUTE_REQUEST runs one experimental bounded local history step without provider calls. discover-metadata --file ABSOLUTE_PROVIDER_RESPONSE normalizes retained actual Drive metadata without provider calls or writes. discover-plan --scope FILE --capture FILE [--checkpoint FILE]; discover-consume --scope FILE --capture FILE --action status|inspect|list|get --evaluated-at UTC [--checkpoint FILE and consume filters]. Plans exact metadata first then raw file-reference fetch; no provider calls. consume --scope FILE --capture FILE --action status|inspect|list|get --evaluated-at UTC [--namespace NS --automation-id ID --id SHA256 --query TEXT --cursor SHA256 --limit N --max-age-seconds N --finding-cursor TEXT]. Reads already acquired bounded history; no provider calls. Node 24+ standard libraries only. prepare --namespace OWN --automation-id ID --file INPUT --to ABSOLUTE_OUTPUT; verify --namespace OWN --automation-id ID --file CANONICAL --id SHA256. bind --namespace OWN --automation-id ID --control-namespace CONTROL --control-automation-id ID --file MANIFEST --to PRIVATE_OUTPUT [--scheduled-for EXACT_UTC --nominal-slot-evidence REF]. Binding is a bounded reported control snapshot, not authentication or global latest history. prepare/verify validate schema, time, identity and export privacy only. Namespace history, native publication, delivery and underlying work require independent evidence.'); return;
  }
  cloudNeed(Number(process.versions.node.split('.')[0]) >= 24, 'Node 24+ required; runtime unavailable is a blocker');
  const [command, ...flags] = args;
  if (command === 'history-bounded') {
    cloudNeed(flags.length===3 && flags[1]==='--file' && cloudAbsolute(flags[2]),'Expected history-bounded ACTION --file ABSOLUTE_REQUEST');
    console.log(JSON.stringify(await modules['automation-reporting-bounded'].runBoundedHistoryFile(flags[0],flags[2])));return;
  }
  if (command === 'discover-metadata') {
    cloudNeed(flags.length === 2 && flags[0] === '--file' && cloudAbsolute(flags[1]), 'Expected discover-metadata --file ABSOLUTE_PROVIDER_RESPONSE');
    const consumer = modules['automation-reporting-discovery', 'automation-reporting-bounded']; const limit = modules['automation-reporting-capture'].CAPTURE_LIMITS.inventoryBytes;
    console.log(JSON.stringify(consumer.normalizeDriveMetadata(consumer.historyDecode(await cloudRead(flags[1],limit,true),limit))));return;
  }
  if (['discover-plan','discover-consume'].includes(command)) {
    const options={}; const allowed=['--scope','--capture','--checkpoint','--action','--evaluated-at','--namespace','--automation-id','--id','--query','--cursor','--limit','--max-age-seconds','--finding-cursor'];
    cloudNeed(flags.length % 2 === 0,'Expected paired discovery options');
    for(let at=0;at<flags.length;at+=2) {cloudNeed(allowed.includes(flags[at]) && !Object.hasOwn(options,flags[at]) && flags[at+1]?.length>0,'Invalid discovery option');options[flags[at]]=flags[at+1];}
    cloudNeed(options['--scope'] && options['--capture'],'Discovery scope and acquisition packet required');
    const consumer=modules['automation-reporting-discovery', 'automation-reporting-bounded']; const limits=modules['automation-reporting-capture'].CAPTURE_LIMITS;
    const scope=await cloudRead(options['--scope'],limits.scopeBytes,true);const packet=await cloudRead(options['--capture'],limits.packetBytes,true);
    const checkpoint=options['--checkpoint'] ? consumer.historyDecode(await cloudRead(options['--checkpoint'],limits.scopeBytes,true),limits.scopeBytes) : null;
    if(command==='discover-plan') {cloudNeed(Object.keys(options).every(key=>['--scope','--capture','--checkpoint'].includes(key)),'Planning accepts scope/capture/checkpoint only');console.log(JSON.stringify(consumer.planDiscovery(scope,packet,{checkpoint})));return;}
    cloudNeed(options['--action'] && options['--evaluated-at'],'Discovery read action and evaluation clock required');
    const names={'--action':'action','--namespace':'namespace','--automation-id':'automationId','--id':'id','--query':'query','--cursor':'cursor','--limit':'limit','--max-age-seconds':'maxAgeSeconds','--finding-cursor':'findingCursor'};const request={};
    for(const [flag,key] of Object.entries(names)) if(options[flag]!==undefined) {if(['limit','maxAgeSeconds'].includes(key)) cloudNeed(/^(?:0|[1-9][0-9]*)$/.test(options[flag]),'Expected bounded integer option');request[key]=['limit','maxAgeSeconds'].includes(key)?Number(options[flag]):options[flag];}
    console.log(JSON.stringify(consumer.consumeDiscovery(scope,packet,request,{evaluatedAt:options['--evaluated-at'],checkpoint})));return;
  }
  if (command === 'consume') {
    const options = {};
    const required = ['--scope', '--capture', '--action', '--evaluated-at'];
    const optional = { '--namespace': 'namespace', '--automation-id': 'automationId', '--id': 'id', '--query': 'query', '--cursor': 'cursor', '--limit': 'limit', '--max-age-seconds': 'maxAgeSeconds', '--finding-cursor': 'findingCursor' };
    cloudNeed(flags.length % 2 === 0, 'Expected paired consume options');
    for (let at = 0; at < flags.length; at += 2) {
      cloudNeed([...required, ...Object.keys(optional)].includes(flags[at]) && !Object.hasOwn(options, flags[at]) && flags[at + 1]?.length > 0, 'Invalid or duplicate consume option');
      options[flags[at]] = flags[at + 1];
    }
    cloudNeed(required.every(key => Object.hasOwn(options, key)), 'Missing scope, capture, action or evaluation time');
    const request = { action: options['--action'] };
    for (const [flag, key] of Object.entries(optional)) if (Object.hasOwn(options, flag)) {
      if (['limit', 'maxAgeSeconds'].includes(key)) cloudNeed(/^(?:0|[1-9][0-9]*)$/.test(options[flag]), 'Expected bounded integer option');
      request[key] = ['limit', 'maxAgeSeconds'].includes(key) ? Number(options[flag]) : options[flag];
    }
    const consumer = modules['automation-reporting-capture'];
    const scope = await cloudRead(options['--scope'], consumer.CAPTURE_LIMITS.scopeBytes, true);
    const capture = await cloudRead(options['--capture'], consumer.CAPTURE_LIMITS.packetBytes, true);
    console.log(JSON.stringify(consumer.consumeCapture(scope, capture, request, { evaluatedAt: options['--evaluated-at'] }))); return;
  }
  if (command === 'bind') {
    const options = {};
    const required = ['--namespace','--automation-id','--control-namespace','--control-automation-id','--file','--to'];
    const allowed = [...required,'--scheduled-for','--nominal-slot-evidence'];
    cloudNeed(flags.length % 2 === 0, 'Expected paired bind options');
    for (let at = 0; at < flags.length; at += 2) {
      cloudNeed(allowed.includes(flags[at]) && !Object.hasOwn(options,flags[at]) && flags[at+1]?.length > 0, 'Invalid or duplicate bind option');
      options[flags[at]] = flags[at+1];
    }
    cloudNeed(required.every(key => Object.hasOwn(options,key)), 'Missing known binding identities, input or output');
    const input = await cloudRead(options['--file'],131072);
    const result = modules['automation-reporting-binding'].bindExpectedOccurrence(modules['bounded-json'].strictJson(input), {namespace:options['--namespace'],automationId:options['--automation-id'],controlNamespace:options['--control-namespace'],controlAutomationId:options['--control-automation-id'],scheduledFor:options['--scheduled-for'] ?? null,nominalSlotEvidenceRef:options['--nominal-slot-evidence'] ?? null,evaluatedAt:new Date().toISOString()});
    cloudNeed(await cloudRead(options['--file'],131072) === input, 'Binding pointer changed during read');
    const bytes = modules['automation-reporting'].canonical(result)+'\n';
    const output = await cloudOutput(options['--to'],bytes);
    console.log(JSON.stringify({...result,output})); return;
  }
  cloudNeed(['prepare', 'verify'].includes(command) && flags.length === 8, 'Expected prepare or verify and four exact named options; use --help');
  const options = {};
  for (let at = 0; at < flags.length; at += 2) {
    const key = flags[at];
    cloudNeed(['--namespace', '--automation-id', '--file', command === 'prepare' ? '--to' : '--id'].includes(key) && !Object.hasOwn(options, key) && typeof flags[at + 1] === 'string' && flags[at + 1].length > 0, 'Invalid or duplicate option');
    options[key] = flags[at + 1];
  }
  const input = await cloudRead(options['--file']);
  const record = modules['bounded-json'].strictJson(input);
  const core = modules['automation-reporting'];
  core.validateRecord(record);
  modules['reporting-privacy'].assertExportSafe(record);
  cloudNeed(record.namespace === options['--namespace'] && record.automationId === options['--automation-id'], 'Producer namespace or automation identity mismatch');
  const bytes = core.canonical(record) + '\n';
  const id = core.recordDigest(record);
  let output;
  if (command === 'verify') {
    cloudNeed(input === bytes, 'Verify requires exact canonical bytes with final newline');
    cloudNeed(/^[a-f0-9]{64}$/.test(options['--id']) && options['--id'] === id, 'Record digest mismatch');
  } else output = await cloudOutput(options['--to'], bytes);
  console.log(JSON.stringify({ id, byteSha256: cloudHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes), ...(output ? { output } : { writes: false }), validation: 'schema/privacy; ancestry requires namespace history', nativePublication: 'pending', userDelivery: 'pending', assurance: 'reported' }));
}
try { await cloudMain(process.argv.slice(2)); }
catch (error) { console.error(JSON.stringify({ error: 'Cloud record refused', reason: error instanceof SyntaxError ? 'Invalid JSON syntax' : ['ENOENT', 'EACCES', 'ELOOP', 'ENOTDIR'].includes(error.code) ? 'Input/output path unavailable or unsafe' : error.code ? 'Local file operation failed' : error.message })); process.exitCode = 1; }
`;
const directory = join(root, '.local/reporting-cloud');
await mkdir(directory, { recursive: true, mode: 0o700 });
const artifact = 'automation-reporting-cloud-v2.mjs';
await writeFile(join(directory, artifact), bundle, { mode: 0o600 });
const schemaBytes = await readFile(join(root, 'schemas/automation-reporting-v1.schema.json'));
await writeFile(join(directory, 'automation-reporting-v1.schema.json'), schemaBytes, { mode: 0o600 });
const controlSchemaBytes = await readFile(join(root, 'schemas/automation-reporting-v2.schema.json'));
await writeFile(join(directory, 'automation-reporting-v2.schema.json'), controlSchemaBytes, { mode: 0o600 });
const outcomeSchemaBytes = await readFile(join(root, 'schemas/automation-reporting-v3.schema.json'));
await writeFile(join(directory, 'automation-reporting-v3.schema.json'), outcomeSchemaBytes, { mode: 0o600 });
const captureSchemaNames = ['automation-reporting-read-scope-v1', 'automation-reporting-capture-v1', 'automation-reporting-history-inventory-v1'];
const captureSchemas = [];
for (const name of captureSchemaNames) {
  const path = `schemas/${name}.schema.json`; const bytes = await readFile(join(root, path));
  await writeFile(join(directory, `${name}.schema.json`), bytes, { mode: 0o600 });
  captureSchemas.push({ path, sha256: sha256(bytes), bytes: bytes.length });
}
const discoverySchemas = [];
for (const name of ['automation-reporting-discovery-scope-v2','automation-reporting-discovery-anchor-v1','automation-reporting-history-inventory-v2']) {
  const path = `schemas/${name}.schema.json`; const bytes = await readFile(join(root,path));
  await writeFile(join(directory,`${name}.schema.json`),bytes,{mode:0o600});
  discoverySchemas.push({path,sha256:sha256(bytes),bytes:bytes.length});
}
const manifest = { discoverySchemas, captureSchemas, schemaVersion: 2, sourceState: sources.every(source => source.sourceState === 'committed') ? 'committed' : 'working-tree', artifact, sha256: sha256(bundle), bytes: Buffer.byteLength(bundle), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sources, schema: { path: 'schemas/automation-reporting-v1.schema.json', sha256: sha256(schemaBytes), bytes: schemaBytes.length }, controlSchema: { path: 'schemas/automation-reporting-v2.schema.json', sha256: sha256(controlSchemaBytes), bytes: controlSchemaBytes.length }, outcomeSchema: { path: 'schemas/automation-reporting-v3.schema.json', sha256: sha256(outcomeSchemaBytes), bytes: outcomeSchemaBytes.length }, supportedOutcomeVersions: [1, 2], capabilities: ['Experimental bounded single-owner capture and publication with exact ticket ledgers; operational admission remains separate.', 'Exact-ID registered anchor discovery planning and full immutable admitted-history generation lineage validation with optional persisted checkpoint.', 'Supported read-only consume of separately approved scope and complete raw-byte history capture.', 'Readable scheduled-unbound outcomes with explicit original evidence and generation provenance.', 'Legacy prepare/verify schema and privacy validation.', 'Exact nominal-slot binding to a bounded reported control snapshot.'], limitations: ['Consume validates supplied history and exact bytes; provider authentication and globally latest history are not established.', 'Actual complete acquisition mechanism and cloud runtime require separate acceptance.', 'Legacy readers and tools refuse nested outcome version 2; install compatible readers first.', 'Runtime must provide Node 24+ standard libraries.', 'Prepare/verify are schema/privacy only; producer ancestry requires namespace history.', 'Binding validates supplied control closure only, not authentication or globally latest unseen history.', 'No native publication, delivery or underlying-work verification.'] };
await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ artifact: '.local/reporting-cloud/' + artifact, sha256: manifest.sha256, bytes: manifest.bytes }));
