import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('../scripts/check-markdown-links.mjs', import.meta.url));

function fixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'emmy-markdown-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    execFileSync('git', ['add', '.'], { cwd: root });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function check(root, args = ['--root', root]) {
  return spawnSync(process.execPath, [checker, ...args], { cwd: tmpdir(), encoding: 'utf8' });
}

test('CLI accepts tracked local links and indexes rendered heading text', () => {
  fixture({
    'README.md': '# Home\n\n[relative](docs/guide.markdown#hello-world)\n\n[root](/docs/guide.markdown#foo-1-1)\n\n[same](#home) [query](?view=1#home) [top](#) [empty]()\n\n[encoded](docs/guide%20one.md#caf%C3%A9-%E4%B8%AD%E6%96%87)\n\n[reference][guide]\n\n[guide]: docs/guide.markdown#setext-heading\n\n![asset](assets/diagram.svg) [directory](docs/) [repository](./)\n\n[special](docs/a%23b%3Fc+%2520.md#once)\n\n[asset fragment](assets/diagram.svg#shape)\n',
    'docs/guide.markdown': '# Hello, *World*!\n\n# Foo\n# Foo\n# Foo-1\n# Foo\n\nSetext **heading**\n---\n\n# API `check()` & notes\n# [Label](#label-alt) ![Alt](../assets/diagram.svg)\n# !!!\n# !!!\n# Two  spaces_ okay\n\n[code](#api-check--notes) [label](#label-alt) [empty duplicate](#-1) [spaces](#two--spaces_-okay)\n',
    'docs/guide one.md': '# Café 中文\n',
    'docs/a#b?c+%20.md': '# Once\n',
    'assets/diagram.svg': '<svg/>',
    '.hidden/Guide.MD': '# Hidden\n\n[home](../README.md#home)\n',
  }, root => {
    const result = check(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Markdown links passed/);
  });
});

test('CLI ignores external schemes, raw HTML, code, and untracked Markdown sources', () => {
  fixture({ 'README.md': [
    '# Examples', '',
    '[https](https://does-not-exist.invalid/missing#bad) [mail](mailto:nobody@example.invalid)',
    '[custom](plugin://unavailable/missing) [network](//does-not-exist.invalid/missing)',
    '[data](data:text/plain,missing) [arbitrary](other+scheme:missing)', '',
    '`[inline](missing.md)`', '',
    '```md', '[fenced](missing.md)', '```', '',
    '    [indented](missing.md)', '',
    '<a href="missing.md">HTML</a>', '',
    '[unused]: missing.md', '[unresolved][unknown]', '',
  ].join('\n') }, root => {
    writeFileSync(join(root, 'untracked.md'), '[broken](missing.md)\n');
    const result = check(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

test('CLI checks current working bytes rather than staged Markdown content', () => {
  fixture({ 'README.md': '[target](target.md#current)\n', 'target.md': '# Staged\n' }, root => {
    writeFileSync(join(root, 'target.md'), '# Current\n');
    const result = check(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

for (const [name, destination, reason] of [
  ['missing file', 'missing.md', /missing tracked file/],
  ['bad anchor', 'target.md#gone', /missing heading "#gone"/],
  ['wrong case', 'Target.md', /exact case required/],
  ['malformed escape', 'target%FF.md', /invalid percent escape/],
  ['outside root', '../outside.md', /escapes repository root/],
  ['directory anchor', 'docs/#gone', /directory fragments are unsupported/],
  ['fragment case', 'target.md#Present', /missing heading/],
]) {
  test(`CLI reports ${name} with the source block and destination`, () => {
    fixture({
      'README.md': `# Source\n\nParagraph starts here\n[broken](${destination})\n`,
      'target.md': '# Present\n',
      'docs/other.md': '# Other\n',
    }, root => {
      const result = check(root);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /README\.md:3:/);
      assert.ok(result.stderr.includes(JSON.stringify(destination)), result.stderr);
      assert.match(result.stderr, reason);
      assert.match(result.stderr, /link block lines 3-4/);
    });
  });
}

test('CLI reports reference link use sites and sorts findings deterministically', () => {
  fixture({
    'z.md': '[last](z-missing.md)\n',
    'a.md': '# A\n\n[ref][broken] [first](a-missing.md)\n\n[broken]: b-missing.md\n',
  }, root => {
    const result = check(root);
    assert.equal(result.status, 1, result.stderr);
    const lines = result.stderr.trim().split('\n');
    assert.match(lines[0], /^a\.md:3: "a-missing\.md"/);
    assert.match(lines[1], /^a\.md:3: "b-missing\.md"/);
    assert.match(lines[2], /^z\.md:1: "z-missing\.md"/);
  });
});

test('CLI rejects existing untracked targets and deleted tracked assets', () => {
  fixture({ 'README.md': '[target](asset.txt)\n', 'asset.txt': 'tracked' }, root => {
    rmSync(join(root, 'asset.txt'));
    const deleted = check(root);
    assert.equal(deleted.status, 1, deleted.stderr);
    assert.match(deleted.stderr, /README\.md:1: "asset\.txt".*unavailable.*ENOENT/);
    execFileSync('git', ['rm', '--cached', '--quiet', 'asset.txt'], { cwd: root });
    writeFileSync(join(root, 'asset.txt'), 'untracked');
    const untracked = check(root);
    assert.equal(untracked.status, 1, untracked.stderr);
    assert.match(untracked.stderr, /README\.md:1: "asset\.txt".*missing tracked file/);
  });
});

test('CLI refuses deleted tracked Markdown sources operationally', () => {
  fixture({ 'README.md': '# Source\n' }, root => {
    rmSync(join(root, 'README.md'));
    const result = check(root);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /README\.md: cannot read tracked Markdown source.*ENOENT/);
  });
});

test('CLI refuses symlink targets and symlinked source directories before reading them', () => {
  fixture({ 'README.md': '[asset](asset.txt)\n', 'asset.txt': 'content', 'docs/source.md': '# Source\n' }, root => {
    rmSync(join(root, 'asset.txt'));
    symlinkSync('README.md', join(root, 'asset.txt'));
    const target = check(root);
    assert.equal(target.status, 1, target.stderr);
    assert.match(target.stderr, /"asset\.txt".*symbolic links are unsupported/);
    rmSync(join(root, 'docs'), { recursive: true });
    symlinkSync(tmpdir(), join(root, 'docs'));
    const source = check(root);
    assert.equal(source.status, 2, source.stderr);
    assert.match(source.stderr, /docs\/source\.md: cannot read tracked Markdown source.*symbolic links are unsupported/);
  });
});

test('CLI rejects missing option values and unknown options', () => {
  fixture({ 'README.md': '# Source\n' }, root => {
    for (const args of [['--root'], ['--unknown'], ['--root', root, '--root', root]]) {
      const result = check(root, args);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage:/);
    }
  });
});
