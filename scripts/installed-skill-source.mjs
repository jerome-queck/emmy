import { lstat, readFile } from 'node:fs/promises';
import { join, resolve, parse } from 'node:path';
import { canonical } from '../src/content.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
export async function resolveInstalledSources(policy, listing, codexHome) {
  need(Array.isArray(listing?.installed), 'Complete installed plugin list required');
  const bindings = {}, evidence = [];
  for (const source of policy.sources) {
    need(source.refresh === 'installed' && /^[a-z0-9-]+$/.test(source.marketplace) && source.pluginId === `${source.package}@${source.marketplace}`, 'Approved installed identity required');
    const rows = listing.installed.filter(row => row.pluginId === source.pluginId);
    need(rows.length === 1, `Ambiguous or missing installed source: ${source.id}`);
    const row = rows[0];
    need(row.installed === true && row.enabled === true && row.name === source.package && row.marketplaceName === source.marketplace && row.marketplaceSource?.sourceType === 'git' && row.marketplaceSource.source === `${source.origin}.git` && typeof row.version === 'string' && /^[a-zA-Z0-9_.-]+$/.test(row.version) && !['.', '..'].includes(row.version), `Disabled or inconsistent installed source: ${source.id}`);
    const root = resolve(codexHome, 'plugins/cache', source.marketplace, source.package, row.version);
    let path = parse(root).root;
    for (const component of root.slice(path.length).split('/')) {
      path = join(path, component);
      const stat = await lstat(path);
      need(stat.isDirectory() && !stat.isSymbolicLink(), 'Ordinary installed cache path required');
    }
    const manifestPath = join(root, source.metadata);
    let manifestParent = root;
    for (const component of source.metadata.split('/')) {
      need(component && component !== '.' && component !== '..', 'Safe manifest path required');
      manifestParent = join(manifestParent, component);
      need(!(await lstat(manifestParent)).isSymbolicLink(), 'Symlink manifest refused');
    }
    const stat = await lstat(manifestPath);
    need(stat.isFile() && stat.size <= 1024 * 1024, 'Bounded ordinary manifest required');
    const bytes = await readFile(manifestPath);
    need(bytes.length === stat.size, 'Complete manifest read required');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    need(manifest.name === source.package && manifest.version === row.version && manifest.repository === source.origin && manifest.license === source.license, `Installed manifest identity/version/licence differs: ${source.id}`);
    bindings[source.id] = root;
    evidence.push({ id: source.id, plugin: row, manifest, root });
  }
  return { bindings, evidence, identity: canonical(evidence) };
}
