export const fixtureNamespace = ino => ({ dev: '4', ino });
export const incarnationFixture = (changes = {}) => ({ schemaVersion: 1, kind: 'linux-proc-incarnation', status: 'observed', pid: 2, bootId: '00000000-0000-4000-8000-000000000001', startTicks: '100', pidNamespace: fixtureNamespace('10'), timeNamespace: fixtureNamespace('20'), mountNamespace: fixtureNamespace('30'), proc: { root: { dev: '0', ino: '42' }, filesystemType: '40864', selfLink: '2', nspid: [2], pid1Namespace: fixtureNamespace('10'), rootedInCallerNamespace: true, mount: { mountId: '30', parentId: '1', device: '0:5', root: '/', mountPoint: '/proc', filesystem: 'proc', options: 'rw', superOptions: 'rw', hiddenPids: false } }, ...changes });
export const procStatFixture = (pid, startTicks, state = 'S', comm = 'fixture (nested)') => `${pid} (${comm}) ${[state, ...Array(18).fill('0'), startTicks, '0'].join(' ')}\n`;
export function procIOFixture(options = {}) {
  const pid = options.pid ?? 4; const calls = []; let targetOpened = false;
  const fileText = path => {
    if (path === '/proc/sys/kernel/random/boot_id') return `${incarnationFixture().bootId}\n`;
    if (path === '/proc/self/stat') return options.selfStat ?? procStatFixture(pid, '200');
    if (path === '/proc/self/status') return options.status ?? `Name:\tfixture\nNSpid:\t${pid}\n`;
    if (path === '/proc/self/mountinfo') return options.mount ?? '30 1 0:5 / /proc rw,nosuid - proc proc rw\n';
    if (path === '/proc/2/stat') { targetOpened = true; if (options.target === 'absent') throw Object.assign(new Error('missing target'), { code: 'ENOENT' }); if (options.target === 'denied') throw Object.assign(new Error('denied target'), { code: 'EACCES' }); return options.targetText ?? procStatFixture(2, options.target === 'reused' ? '101' : '100', options.state ?? 'S'); }
    throw Object.assign(new Error('unexpected fixed proc path'), { code: 'ENOENT' });
  };
  const fail = path => { if (options.missing === path || options.denied === path) throw Object.assign(new Error('fixture acquisition refusal'), { code: options.missing === path ? 'ENOENT' : 'EACCES' }); };
  return { calls, async open(path) { calls.push(['open', path]); fail(path); const bytes = Buffer.from(fileText(path)); let offset = 0; return { async read(target, start, length) { const copied = bytes.copy(target, start, offset, offset + length); offset += copied; return { bytesRead: copied }; }, async close() {} }; }, async readlink(path) { calls.push(['readlink', path]); fail(path); return options.selfLink ?? String(pid); }, async stat(path) { calls.push(['stat', path]); fail(path); if (path === '/proc') return { dev: 0n, ino: 42n }; const ino = path.endsWith('/time') ? '20' : path.endsWith('/mnt') ? '30' : options.changedScope && targetOpened ? '11' : '10'; return { dev: 4n, ino: BigInt(ino) }; }, async statfs(path) { calls.push(['statfs', path]); fail(path); return { type: BigInt(options.filesystemType ?? 40864) }; } };
}
