import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { briefingGuidance, commands, subsystemEvidence, verification } from './metadata.mjs';
import { digest } from './content.mjs';

// Parse and link only; never evaluate the inventoried modules.
function moduleInterfaces(root, files, exportModules) {
  const script = `import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const {root,files,exportModules}=JSON.parse(input); const result={};
for (const file of files) { const source=await readFile(root+'/'+file,'utf8'); let m=new SourceTextModule(source); const imports=m.dependencySpecifiers;
  if (exportModules.includes(file)) { const names=[]; for (;;) { try { await m.link(async()=>new SyntheticModule(names,()=>{})); break; }
    catch (error) { const missing=error.message.match(/does not provide an export named '([^']+)'/); if (!missing || names.includes(missing[1]) || names.length>=256) throw error; names.push(missing[1]); m=new SourceTextModule(source); } }
    result[file]={imports,exports:Object.getOwnPropertyNames(m.namespace)}; }
  else result[file]={imports}; }
process.stdout.write(JSON.stringify(result));`;
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '--input-type=module', '-e', script], { input: JSON.stringify({ root, files, exportModules }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (child.status !== 0 || child.error || child.signal) throw new Error(`Subsystem inventory: module parsing failed: ${child.error?.message ?? child.stderr}`);
  return JSON.parse(child.stdout);
}

async function coverageInventory(root, inventory, generated) {
  const need = (value, message) => { if (!value) throw new Error(`Subsystem inventory: ${message}`); };
  need(inventory.schemaVersion === 1 && inventory.foundationReady === false && Array.isArray(inventory.subsystems), 'invalid schema or readiness');
  const paths = new Set(); const ids = new Set(); const entries = new Map(); const owners = [];
  const records = new Map();
  for (const binding of Object.values(subsystemEvidence)) for (const path of binding.coverageRecords) {
    if (!records.has(path)) records.set(path, JSON.parse(await readFile(join(root, path), 'utf8')));
  }
  const registry = records.get('verification/coverage.json');
  const metadata = digest(await readFile(join(root, 'src/metadata.mjs')));
  need(metadata === digest(await readFile(new URL('./metadata.mjs', import.meta.url))) && registry?.files?.['src/metadata.mjs'] === metadata, 'unreviewed evidence registry');
  for (const area of inventory.subsystems) {
    need(typeof area.id === 'string' && !ids.has(area.id), 'duplicate or missing subsystem'); ids.add(area.id);
    need(!['drivers','skills','replay','coverageRecords','graph','model','skillStatus'].some(key => Object.hasOwn(area,key)), `duplicate evidence binding in ${area.id}`);
    const binding = subsystemEvidence[area.id];
    need(binding && area.stateOwner && area.classification && area.bounds && area.gap && binding.drivers?.length && area.files?.length && area.ownerRefs?.length && area.scenarios?.length && Array.isArray(area.properties), `incomplete ${area.id}`);
    need(['empirical-only', 'finite-predicates', 'reachable-reducer', 'finite-assessment', 'hand-mapped-await'].includes(binding.model), `unsupported model in ${area.id}`);
    need(['maintained', 'missing', 'not-applicable'].includes(binding.skillStatus), `missing skill classification in ${area.id}`);
    need(binding.model === 'empirical-only' ? binding.skillStatus !== 'maintained' : binding.skillStatus !== 'not-applicable' && binding.replay.length && area.properties.length && binding.coverageRecords.length && (binding.skillStatus === 'missing' || binding.skills.length), `missing formal evidence in ${area.id}`);
    need(['reachable-reducer', 'finite-assessment', 'hand-mapped-await'].includes(binding.model) ? binding.graph?.kind === binding.model : !binding.graph, `missing or unsupported graph in ${area.id}`);
    for (const owner of area.ownerRefs) {
      need(typeof owner.path === 'string' && !owner.path.startsWith('/') && !owner.path.split('/').includes('..'), `invalid owner in ${area.id}`);
      need(owner.kind === 'ingress' ? owner.path.startsWith('scripts/') && !Object.hasOwn(owner, 'symbol') : typeof owner.symbol === 'string' && owner.symbol.length > 0 && !Object.hasOwn(owner, 'kind'), `invalid owner in ${area.id}`);
      await readFile(join(root, owner.path)); owners.push(owner);
    }
    for (const path of [...binding.drivers, ...binding.skills, ...binding.replay, ...binding.coverageRecords]) {
      need(typeof path === 'string' && !path.startsWith('/') && !path.split('/').includes('..'), `unsafe reference in ${area.id}`);
      await readFile(join(root, path));
    }
    for (const path of [...binding.drivers, ...binding.skills]) {
      const registered = binding.coverageRecords.map(record => records.get(record)).map(record => ({ ...record.files, ...record.sourceFiles, ...record.verificationFiles })[path]).filter(Boolean);
      const actual = digest(await readFile(join(root, path)));
      need(registered.includes(actual), `unregistered evidence ${path} in ${area.id}`);
    }
    if (binding.graph) {
      const graph = binding.graph; const record = records.get(graph.record);
      need(binding.coverageRecords.includes(graph.record) && record?.verificationFiles?.[graph.path] === digest(await readFile(join(root, graph.path))) && record?.verificationFiles?.[graph.checker] === digest(await readFile(join(root, graph.checker))), `unregistered graph or checker in ${area.id}`);
    }
    for (const entry of area.files) {
      need(typeof entry.path === 'string' && !paths.has(entry.path) && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.callers?.length, `invalid mapping in ${area.id}`);
      need(!entry.path.startsWith('/') && !entry.path.split('/').includes('..'), `unsafe source in ${area.id}`);
      paths.add(entry.path);
      entries.set(entry.path, entry);
      const reviewedBytes = generated.has(entry.path) ? generated.get(entry.path) : await readFile(join(root, entry.path));
      need(digest(reviewedBytes) === entry.sha256, `stale mapping ${entry.path}`);
      for (const caller of entry.callers) {
        need(caller === 'executable ingress' || caller === 'public configuration' || caller === 'verification input' || typeof caller === 'string' && !caller.startsWith('/') && !caller.split('/').includes('..'), `invalid caller ${entry.path}`);
        need(!entry.path.startsWith('src/') || !['executable ingress', 'public configuration', 'verification input'].includes(caller), `missing source caller ${entry.path}`);
        need(caller !== 'verification input' || /^(verification|test)\//.test(entry.path), `invalid verification input ${entry.path}`);
        if (!['executable ingress', 'public configuration', 'verification input'].includes(caller)) await readFile(join(root, caller));
      }
    }
  }
  const scan = async (directory, pattern) => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await scan(path, pattern);
      else if (path !== 'verification/subsystems.json' && pattern.test(entry.name)) need(paths.has(path), `unmapped ${path}`);
    }
  };
  for (const directory of ['src', 'scripts']) await scan(directory, /\.(?:[cm]?js|ts)$/);
  for (const directory of ['procedures', 'registry', '.github', '.codex']) await scan(directory, /\.(json|ya?ml|toml)$/);
  for (const directory of ['verification', 'test']) await scan(directory, /\.(?:[cm]?js|ts|tla|cfg|mmd|json)$/);
  await scan('docs', /\.json$/);
  for (const path of ['package.json', 'package-lock.json', '.codex/config.toml', 'docs/briefing-guidance.json', 'docs/verification-index.json']) need(paths.has(path), `unmapped ${path}`);
  need(Object.keys(subsystemEvidence).every(id => ids.has(id)), 'orphan evidence binding');
  const callers = new Set([...paths].filter(path => /^(src|scripts)\/.*\.mjs$/.test(path)));
  for (const entry of entries.values()) if (/^(src|scripts)\/.*\.mjs$/.test(entry.path)) for (const caller of entry.callers) if (caller !== 'executable ingress') callers.add(caller);
  const graphs = Object.values(subsystemEvidence).map(x => x.graph).filter(graph => graph && graph.kind !== 'hand-mapped-await');
  for (const graph of graphs) { callers.add(graph.path); callers.add(graph.checker); }
  for (const owner of owners) { need(entries.has(owner.path), `unmapped owner ${owner.path}`); if (owner.kind !== 'ingress') callers.add(owner.path); }
  const exportModules = [...new Set([...graphs.map(graph => graph.path), ...owners.filter(owner => owner.kind !== 'ingress').map(owner => owner.path)])];
  const interfaces = moduleInterfaces(root, [...callers], exportModules);
  const targets = caller => interfaces[caller].imports.filter(specifier => specifier.startsWith('.')).map(specifier => relative(root, resolve(root, dirname(caller), specifier)).split(sep).join('/'));
  for (const graph of graphs) need(targets(graph.checker).includes(graph.path) && graph.exports.every(name => interfaces[graph.path].exports.includes(name)), `invalid graph interface ${graph.path}`);
  for (const owner of owners.filter(owner => owner.kind !== 'ingress')) need(interfaces[owner.path].exports.includes(owner.symbol), `missing exported owner ${owner.symbol}`);
  for (const entry of entries.values()) if (/^(src|scripts)\/.*\.mjs$/.test(entry.path)) for (const caller of entry.callers) if (caller !== 'executable ingress') need(targets(caller).includes(entry.path), `stale caller ${caller} for ${entry.path}`);
  for (const caller of [...callers].filter(path => /^(src|scripts)\/.*\.mjs$/.test(path))) for (const target of targets(caller)) if (/^(src|scripts)\//.test(target) && entries.has(target)) need(entries.get(target).callers.includes(caller), `unmapped caller ${caller} for ${target}`);
  return inventory;
}

export function generatedFiles(catalog, guidanceDocuments, inventory) {
  for (const command of commands) {
    const feature = verification.features.find(value => value.id === command.feature);
    if (!feature?.commands.includes(command.name)) throw new Error(`Unmapped command ${command.name}`);
  }
  for (const feature of verification.features) {
    if (!feature.scenarios.length || feature.commands.some(name => !commands.some(command => command.name === name && command.feature === feature.id))) throw new Error(`Invalid feature mapping ${feature.id}`);
    if (feature.properties.some(id => !verification.properties.some(property => property.id === id))) throw new Error(`Unknown property in ${feature.id}`);
  }
  const cli = `# Agent CLI reference\n\nGenerated by \`npm run agent -- maintain --write\` from \`src/metadata.mjs\`. Every command prints one JSON object. Use \`node scripts/agent.mjs\` when piping JSON. npm also prints its script banner.\n\nGlobal options are \`--root <public-source>\`, \`--home <private-state>\`, and \`--json\`. Default root is this checkout. Default home is its ignored \`.local/\`. JSON is always the output format.\n\n| Command | Options | Purpose | Feature |\n| --- | --- | --- | --- |\n${commands.map(command => `| ${command.name} | ${command.options.map(option => `\`--${option.name}${option.flag ? '' : ' <value>'}\`${option.required ? ' required' : ''}`).join(', ') || 'none'} | ${command.description} | ${command.feature} |`).join('\n')}\n\nExit 0 means the command completed and its applicable checks passed. Exit 2 means invalid input, corrupt storage, or an operational error. Exit 3 means actionable findings, definition conflict, restored suspension, generated reference drift, or advisory revision/degradation. These exit codes do not report native task execution.\n\n\`maintain\` requires exactly one of \`--check\` and \`--write\`. \`probe\` omits optional cloud delegation by default; select it with \`--id cloud-delegation\`. Other probes can be selected when \`--id\` names one. \`reconcile\` reviews one responsibility with \`--id\`, or all when omitted. Imports are optional immutable bundles. Local checks require separately scoped execution authority. Restore always needs a new destination and fresh observations in its new epoch.\n\n\`briefing\` without a file loads verified local guidance when explicitly pinned, otherwise canonical public-main guidance. With \`--file <draft.json>\`, it returns advisory checked/revise/degraded results and exact rendered Markdown when usable. Revision has no normal body. Cached guidance retains its original successful main-check time. Global \`--root\` does not change the canonical guidance origin. See [the briefing procedure](briefing.md). No command installs native invocation.\n\n\`calendar --file <private-envelope.json>\` checks declared saved fields, current bindings, complete inventory, source budgets, full morning windows, conflicts, and retained attempts. It reads one regular UTF-8 file of at most 2 MiB and writes no journal or native request. Exit 0 means all declared checks pass, 3 retains mismatches or missing evidence, and 2 rejects malformed input. Standard JSON parsing uses the last duplicate key value. See [the calendar contract](calendar.md).\n`;
  const catalogDoc = `# Public catalog\n\nGenerated from \`registry/catalog.json\`. Project registration and public repository observations do not establish Dot access. Private bindings can add other projects.\n\n## Projects\n\n| ID | Project | Group | Public repository | Basis |\n| --- | --- | --- | --- | --- |\n${catalog.projects.map(project => `| ${project.id} | ${project.label} | ${project.group} | ${project.repository ? `[Repository](${project.repository})` : 'Unverified'} | ${project.basis} |`).join('\n')}\n\n## Capabilities\n\n| ID | Capability | Account status | Source | Proposed probe |\n| --- | --- | --- | --- | --- |\n${catalog.capabilities.map(capability => `| ${capability.id} | ${capability.label} | ${capability.accountStatus} | ${capability.sources.map(id => { const source = catalog.sources.find(value => value.id === id); return `[${id}](${source.url})`; }).join(', ')} | ${capability.probe} |`).join('\n')}\n\n## Tool priorities\n\n${catalog.tools.map(tool => `- ${tool.id}. Priority ${tool.priority}. ${tool.use} Recommendation ${tool.basis}. Dot access ${tool.dotAccess}.`).join('\n')}\n\n## Source claims\n\n${catalog.sources.map(source => `- [${source.id}](${source.url}). Reviewed ${source.reviewedAt}. ${source.statement} Basis ${source.basis}.`).join('\n')}\n`;
  const index = `# Emmy feature map\n\nGenerated from \`src/metadata.mjs\`. Read [the driver skill](../SKILL.md) before a change. Run \`npm run verify:behavior\` to drive every mapped scenario.\n\n| Feature | Commands | Scenarios | Bounded properties |\n| --- | --- | --- | --- |\n${verification.features.map(feature => `| [${feature.title}](${feature.id}.md) | ${feature.commands.join(', ')} | ${feature.scenarios.join(', ')} | ${feature.properties.join(', ') || 'Public derivation is exercised behaviorally'} |`).join('\n')}\n\nThe [subsystem inventory](../../../../docs/subsystem-inventory.md) records coverage and remaining gaps. Structural admission does not establish foundation readiness.\n\nFeature instructions are maintained prose. This index and the command reference are derived. Maintenance does not independently read behavior or review formal assumptions. Briefing scenarios are behavioral checks; the existing bounded properties do not prove advisory policy. Calendar scenarios check declared evidence through the CLI; finite calendar claims require their own reviewed mapping.\n`;
  const areas = `# Subsystem inventory\n\nGenerated from \`verification/subsystems.json\`. Structural admission is not semantic proof. Caller admission uses parsed static relative imports in production files; dynamic and external callers still need source review. Whole-repository foundation readiness: **incomplete**.\n\n| Subsystem | State owner | Classification | Remaining gap |\n| --- | --- | --- | --- |\n${inventory.subsystems.map(area => `| ${area.id} | ${area.stateOwner} | ${area.classification} | ${area.gap} |`).join('\n')}\n`;
  return new Map([
    ['docs/cli.md', cli],
    ['docs/catalog.md', catalogDoc],
    ['.agents/skills/verify/features/README.md', index],
    ['docs/verification-index.json', `${JSON.stringify({ commands, ...verification }, null, 2)}\n`],
    ['docs/subsystem-inventory.md', areas],
    [briefingGuidance.path, `${JSON.stringify({ schemaVersion: briefingGuidance.schemaVersion, checkerVersion: briefingGuidance.checkerVersion, documents: guidanceDocuments, digest: digest(guidanceDocuments) }, null, 2)}\n`]
  ]);
}

export async function maintain(root, catalog, write) {
  const drift = [];
  const inventory = JSON.parse(await readFile(join(root, 'verification/subsystems.json'), 'utf8'));
  const mapped = new Set((inventory.subsystems ?? []).flatMap(area => (area.files ?? []).map(file => file.path)));
  for (const path of briefingGuidance.paths) if (!mapped.has(path)) throw new Error(`Subsystem inventory: unmapped guidance input ${path}`);
  const guidanceDocuments = await Promise.all(briefingGuidance.paths.map(async path => {
    const text = await readFile(join(root, path), 'utf8');
    return { path, bytes: Buffer.byteLength(text), sha256: digest(text), text };
  }));
  const generated = generatedFiles(catalog, guidanceDocuments, inventory);
  await coverageInventory(root, inventory, generated);
  for (const [path, expected] of generated) {
    let actual;
    try { actual = await readFile(join(root, path), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (actual !== expected) {
      drift.push(path);
      if (write) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), expected);
      }
    }
  }
  return { status: write || !drift.length ? 'current' : 'drift', changed: write ? drift : [], drift: write ? [] : drift, reviewRecordsChanged: false };
}
