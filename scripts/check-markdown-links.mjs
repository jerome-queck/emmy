#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'commonmark';

const markdown = /\.(?:md|markdown)$/i;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function rootOption(args) {
  if (args.length === 0) return resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.length === 2 && args[0] === '--root' && args[1] && !args[1].startsWith('--')) {
    return resolve(args[1]);
  }
  throw new Error('Usage: node scripts/check-markdown-links.mjs [--root <directory>]');
}

function localKind(root, target) {
  const parts = target === '.' ? [] : target.split('/');
  let current = root;
  let stat = lstatSync(current);
  if (stat.isSymbolicLink()) throw new Error('symbolic links are unsupported');
  for (const part of parts) {
    current = join(current, part);
    stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('symbolic links are unsupported');
  }
  return stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
}

function parseDocument(text, parser) {
  const ast = parser.parse(text);
  const headings = new Set();
  const links = [];
  const walker = ast.walker();
  let event;
  while ((event = walker.next())) {
    if (!event.entering) continue;
    const node = event.node;
    if (node.type === 'heading') {
      let text = '';
      const children = node.walker();
      let child;
      while ((child = children.next())) {
        if (!child.entering) continue;
        if (child.node.type === 'text' || child.node.type === 'code') text += child.node.literal;
        if (child.node.type === 'softbreak' || child.node.type === 'linebreak') text += ' ';
      }
      const base = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
      let id = base;
      for (let suffix = 1; headings.has(id); suffix += 1) id = `${base}-${suffix}`;
      headings.add(id);
    }
    if (node.type === 'link' || node.type === 'image') {
      let block = node;
      while (!block.sourcepos) block = block.parent;
      links.push({ destination: node.destination, line: block.sourcepos[0][0], lineEnd: block.sourcepos[1][0] });
    }
  }
  return { ast, headings, links };
}

function localDestination(source, destination) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination) || destination.startsWith('//')) return null;
  const hash = destination.indexOf('#');
  const pathQuery = hash < 0 ? destination : destination.slice(0, hash);
  const query = pathQuery.indexOf('?');
  const path = decodeURIComponent(query < 0 ? pathQuery : pathQuery.slice(0, query));
  const fragment = hash < 0 ? '' : decodeURIComponent(destination.slice(hash + 1));
  if (/[\0\\]/.test(path)) throw new Error('local paths cannot contain NUL or backslash');
  const target = (path === '' ? source : posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(source), path))).replace(/\/+$/, '') || '.';
  if (target === '..' || target.startsWith('../')) throw new Error('local path escapes repository root');
  return { target, fragment };
}

function main() {
  const root = rootOption(process.argv.slice(2));
  const files = new Set(execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean));
  const directories = new Set(['.']);
  for (const file of files) {
    for (let dir = posix.dirname(file); dir !== '.'; dir = posix.dirname(dir)) directories.add(dir);
  }
  const documents = new Map();
  const parser = new Parser();
  for (const source of [...files].filter(file => markdown.test(file)).sort(compare)) {
    try {
      if (localKind(root, source) !== 'file') throw new Error('not a regular file');
      documents.set(source, parseDocument(readFileSync(join(root, source), 'utf8'), parser));
    } catch (error) {
      throw new Error(`${source}: cannot read tracked Markdown source (${error.code ?? error.message})`);
    }
  }
  const diagnostics = [];
  let checked = 0;
  for (const [source, document] of documents) {
    for (const link of document.links) {
      let reason;
      try {
        const local = localDestination(source, link.destination);
        if (!local) continue;
        checked += 1;
        const { target, fragment } = local;
        if (!files.has(target) && !directories.has(target)) {
          reason = `missing tracked file or directory ${JSON.stringify(target)} (exact case required)`;
        } else {
          let kind;
          try {
            kind = localKind(root, target);
          } catch (error) {
            reason = `local target ${JSON.stringify(target)} is unavailable (${error.code ?? error.message})`;
          }
          if (!reason && kind !== (files.has(target) ? 'file' : 'directory')) {
            reason = `local target ${JSON.stringify(target)} has an unsupported file type`;
          }
          if (!reason && fragment && kind === 'directory') reason = 'directory fragments are unsupported';
          if (!reason && fragment && markdown.test(target) && !documents.get(target).headings.has(fragment)) {
            reason = `missing heading ${JSON.stringify(`#${fragment}`)} in ${JSON.stringify(target)}`;
          }
        }
      } catch (error) {
        reason = error instanceof URIError ? 'invalid percent escape in local destination' : error.message;
      }
      if (reason) diagnostics.push({ source, ...link, reason });
    }
  }
  diagnostics.sort((a, b) => compare(a.source, b.source) || a.line - b.line || compare(a.destination, b.destination) || compare(a.reason, b.reason));
  for (const diagnostic of diagnostics) {
    const { source, line, lineEnd, destination, reason } = diagnostic;
    console.error(`${source}:${line}: ${JSON.stringify(destination)}: ${reason} (link block lines ${line}-${lineEnd})`);
  }
  if (diagnostics.length) return 1;
  console.log(`Markdown links passed (${documents.size} tracked documents, ${checked} local links).`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`Markdown link check failed: ${error.message}`);
  process.exitCode = 2;
}
