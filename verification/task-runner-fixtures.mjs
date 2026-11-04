import { mkdir, readFile, readdir, writeFile, realpath, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { taskCallerLauncher } from '../src/task-runner.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function sourceInventory(root, relative = '') {
  const files = [];
  for (const row of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = join(relative, row.name);
    if (row.isDirectory()) files.push(...await sourceInventory(root, path));
    else { const bytes = await readFile(join(root, path)); files.push({ path, sha256: hash(bytes), bytes: bytes.length }); }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function fixtureTarget(root, name, home, { sourceRoot, source, revision = '1'.repeat(40) } = {}) {
  const directory = join(root, name); await mkdir(directory); await mkdir(join(directory, 'src'));
  if (sourceRoot) {
    for (const path of ['src', 'scripts', 'registry', 'docs', '.agents', 'procedures', 'package.json']) await cp(join(sourceRoot, path), join(directory, path), { recursive: true });
  } else {
    await mkdir(join(directory, 'scripts'));
    await writeFile(join(directory, 'scripts/agent.mjs'), source ?? 'process.stdout.write(JSON.stringify({synthetic:true,accepted:false,args:process.argv.slice(2)}));\n');
    for (const path of ['package.json', 'registry/catalog.json', 'docs/cli.md', 'docs/catalog.md', 'docs/verification-index.json', 'docs/briefing-guidance.json', 'docs/operating-brief.md', 'docs/briefing.md', '.agents/skills/verify/features/README.md', '.agents/skills/sign-in/SKILL.md']) {
      await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), path === 'package.json' ? '{"type":"module"}' : 'synthetic fixture');
    }
  }
  const manifest = { schemaVersion: 1, revision, privateHome: home, files: await sourceInventory(directory) };
  const sourceManifest = join(root, `${name}-manifest.json`); const bytes = Buffer.from(JSON.stringify(manifest)); await writeFile(sourceManifest, bytes);
  const runtime = await realpath(process.execPath);
  return { sourceRoot: directory, sourceManifest, sourceManifestSha256: hash(bytes), revision, runtime, runtimeSha256: hash(await readFile(runtime)) };
}
export async function fixtureCaller(root, sourceRoot, baseline) {
  const home = join(root, 'home'); await mkdir(home, { recursive: true });
  const binding = join(root, 'task-caller.json'); await writeFile(binding, JSON.stringify({ schemaVersion: 1, privateHome: home, baseline }));
  const launcher = join(root, 'run-task-agent');
  await writeFile(launcher, taskCallerLauncher({ runtime: await realpath(process.execPath), caller: join(sourceRoot, 'scripts/task-agent.mjs'), binding }), { mode: 0o700 });
  return { home, binding, launcher, selection: join(home, 'task-runner.json') };
}
