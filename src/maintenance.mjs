import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { briefingGuidance, commands, verification } from './metadata.mjs';
import { digest } from './content.mjs';

// These are supported model kinds, not a claim that a named model is complete.
const graphOwners = {
  'local-assurance': ['reachable-reducer', 'verification/local-assurance/graph.mjs', 'assuranceTransition'],
  'local-delivery': ['reachable-reducer', 'verification/delivery/graph.mjs', 'deliveryTransition'],
  'planning-policy': ['finite-assessment', 'verification/planning-policy/graph.mjs', 'evaluateCase'],
  dispatch: ['finite-assessment', 'verification/direct-dispatch/graph.mjs', 'evaluateCase'],
  publication: ['hand-mapped-await', 'verification/publication/RecordPublication.tla', 'MODULE RecordPublication'],
  briefing: ['hand-mapped-await', 'verification/briefing-slot/BriefingSlot.tla', 'MODULE BriefingSlot']
};

async function coverageInventory(root, inventory, generated) {
  const need = (value, message) => { if (!value) throw new Error(`Subsystem inventory: ${message}`); };
  need(inventory.schemaVersion === 1 && inventory.foundationReady === false && Array.isArray(inventory.subsystems), 'invalid schema or readiness');
  const paths = new Set(); const ids = new Set();
  for (const area of inventory.subsystems) {
    need(typeof area.id === 'string' && !ids.has(area.id), 'duplicate or missing subsystem'); ids.add(area.id);
    need(area.stateOwner && area.classification && area.bounds && area.gap && area.drivers?.length && area.files?.length && area.ownerRefs?.length && area.scenarios?.length && Array.isArray(area.properties) && Array.isArray(area.skills) && Array.isArray(area.replay) && Array.isArray(area.coverageRecords), `incomplete ${area.id}`);
    need(['empirical-only', 'finite-predicates', 'reachable-reducer', 'finite-assessment', 'hand-mapped-await'].includes(area.model), `unsupported model in ${area.id}`);
    need(['maintained', 'missing', 'not-applicable'].includes(area.skillStatus), `missing skill classification in ${area.id}`);
    need(area.model === 'empirical-only' ? area.skillStatus !== 'maintained' : area.skillStatus !== 'not-applicable' && area.replay.length && area.properties.length && area.coverageRecords.length && (area.skillStatus === 'missing' || area.skills.length), `missing formal evidence in ${area.id}`);
    need(['reachable-reducer', 'finite-assessment', 'hand-mapped-await'].includes(area.model) ? area.graph?.kind === area.model : !area.graph, `missing or unsupported graph in ${area.id}`);
    for (const owner of area.ownerRefs) {
      need(typeof owner.path === 'string' && !owner.path.startsWith('/') && !owner.path.split('/').includes('..') && typeof owner.symbol === 'string' && owner.symbol.length > 0, `invalid owner in ${area.id}`);
      need((await readFile(join(root, owner.path), 'utf8')).includes(owner.symbol), `missing owner ${owner.symbol}`);
    }
    for (const path of [...area.drivers, ...area.skills, ...area.replay, ...area.coverageRecords]) {
      need(typeof path === 'string' && !path.startsWith('/') && !path.split('/').includes('..'), `unsafe reference in ${area.id}`);
      await readFile(join(root, path));
    }
    if (area.graph) {
      const owner = graphOwners[area.id];
      need(owner && owner[0] === area.graph.kind && owner[1] === area.graph.path, `unsupported graph in ${area.id}`);
      const graph = await readFile(join(root, area.graph.path), 'utf8');
      need(graph.includes(owner[2]), `invalid graph in ${area.id}`);
    }
    for (const entry of area.files) {
      need(typeof entry.path === 'string' && !paths.has(entry.path) && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.callers?.length, `invalid mapping in ${area.id}`);
      need(!entry.path.startsWith('/') && !entry.path.split('/').includes('..'), `unsafe source in ${area.id}`);
      paths.add(entry.path);
      const reviewedBytes = generated.has(entry.path) ? generated.get(entry.path) : await readFile(join(root, entry.path));
      need(digest(reviewedBytes) === entry.sha256, `stale mapping ${entry.path}`);
      for (const caller of entry.callers) {
        need(caller === 'executable ingress' || caller === 'public configuration' || caller === 'verification input' || typeof caller === 'string' && !caller.startsWith('/') && !caller.split('/').includes('..'), `invalid caller ${entry.path}`);
        need(!entry.path.startsWith('src/') || !['executable ingress', 'public configuration', 'verification input'].includes(caller), `missing source caller ${entry.path}`);
        need(caller !== 'verification input' || /^(verification|test)\//.test(entry.path), `invalid verification input ${entry.path}`);
        if (!['executable ingress', 'public configuration', 'verification input'].includes(caller)) {
          const callerSource = await readFile(join(root, caller), 'utf8');
          need(callerSource.includes(entry.path.split('/').at(-1)), `stale caller ${caller} for ${entry.path}`);
        }
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
  const areas = `# Subsystem inventory\n\nGenerated from \`verification/subsystems.json\`. Structural admission is not semantic proof. Whole-repository foundation readiness: **incomplete**.\n\n| Subsystem | State owner | Classification | Remaining gap |\n| --- | --- | --- | --- |\n${inventory.subsystems.map(area => `| ${area.id} | ${area.stateOwner} | ${area.classification} | ${area.gap} |`).join('\n')}\n`;
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
