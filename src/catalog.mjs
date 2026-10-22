import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readCatalog(root) {
  const catalog = JSON.parse(await readFile(join(root, 'registry/catalog.json'), 'utf8'));
  if (catalog.schemaVersion !== 1) throw new Error('Unsupported catalog schemaVersion');
  for (const name of ['projects', 'sources', 'capabilities', 'tools', 'probes']) {
    if (!Array.isArray(catalog[name])) throw new Error(`Catalog ${name} must be an array`);
    const ids = catalog[name].map(value => value.id);
    if (ids.some(id => !/^[a-z][a-z0-9-]*$/.test(id)) || new Set(ids).size !== ids.length) throw new Error(`Invalid or duplicate ${name} ID`);
  }
  for (const capability of catalog.capabilities) {
    if (!capability.sources.every(id => catalog.sources.some(source => source.id === id))) throw new Error(`Unknown source for ${capability.id}`);
    if (!catalog.probes.some(probe => probe.id === capability.probe)) throw new Error(`Unknown probe for ${capability.id}`);
  }
  return catalog;
}
