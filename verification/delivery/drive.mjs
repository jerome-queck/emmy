import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../../src/content.mjs';
import { driveAssurance } from '../local-assurance/drive.mjs';

export async function driveDelivery(sourceRoot = fileURLToPath(new URL('../../', import.meta.url))) {
  const directory = join(sourceRoot, '.local/verification/delivery-cli', randomUUID()); await mkdir(directory, { recursive: true });
  const report = { status: 'running', syntheticProvider: true, reducedAssurancePlan: true, commands: [], cases: [], directory };
  const save = () => writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  try {
    const baseline = await driveAssurance(sourceRoot, directory); const root = baseline.fixtureRoot;
    const git = args => execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    git(['remote', 'add', 'origin', 'https://github.com/jerome-queck/emmy.git']);
    const stateFile = join(root, '.local/provider.json'); const preload = join(root, '.local/provider.mjs');
    const push = join(root, '.local/push.mjs'); const bin = join(root, '.local/bin'); await mkdir(bin);
    const fakeSource = `import {readFileSync,writeFileSync} from 'node:fs';
const path=${JSON.stringify(stateFile)};
const load=()=>JSON.parse(readFileSync(path,'utf8'));
const save=s=>writeFileSync(path,JSON.stringify(s));
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url); if(u.origin!=='https://api.github.com')throw new Error('Unexpected synthetic provider origin');
 const s=load(); const method=options.method??'GET'; const p=u.pathname; s.calls.push({method,path:p,body:options.body?JSON.parse(options.body):null});
 let body;let code=200;
 const repo={full_name:'jerome-queck/emmy'};
 const pr={number:7,title:s.title,body:s.body,state:s.merged?'closed':'open',draft:false,merged:s.merged,merged_at:s.merged?'2026-11-10T00:00:00Z':null,head:{sha:s.head,repo},base:{sha:s.base,ref:'main',repo}};
 if(p.includes('/git/ref/heads/')){if(s.denyRead)code=403;else if(s.uncertainRead)code=503;else if(s.failReadback){s.failReadback=false;code=503;}else if(!s.branch)code=404;else body={object:{sha:s.head}};}
 else if(p.endsWith('/branches/main/protection'))body={enforce_admins:{enabled:true},required_status_checks:{strict:true,contexts:['emmy-local-assurance','emmy-independent-review']}};
 else if(p.endsWith('/branches/main'))body={name:'main',commit:{sha:s.drift?'f'.repeat(40):s.base},protected:true,protection:{required_status_checks:{enforcement_level:'everyone',strict:true,contexts:['emmy-local-assurance','emmy-independent-review']}}};
 else if(p.endsWith('/pulls')&&method==='GET')body=s.pr?[pr]:[];
 else if(p.endsWith('/pulls')&&method==='POST'){s.pr=true;const text=JSON.parse(options.body);s.title=text.title;s.body=text.body;s.writes.push('open-pr');body=pr;}
 else if(p.endsWith('/pulls/7/merge')&&method==='PUT'){s.merged=true;s.writes.push('merge');body={merged:true,sha:'9'.repeat(40)};}
 else if(p.endsWith('/pulls/7'))body=pr;
 else if(p.endsWith('/check-runs'))body={check_runs:[]};
 else if(p.includes('/statuses/')&&method==='POST'){const b=JSON.parse(options.body);s.statuses.push({...b,id:s.statuses.length+1,creator:{login:'jerome-queck',type:'User'}});s.writes.push(b.context);body=s.statuses.at(-1);}
 else if(p.endsWith('/statuses'))body=s.statuses;
 else if(p==='/graphql')body={data:{repository:{pullRequest:{headRefOid:s.head,baseRefName:'main',merged:s.merged,mergeCommit:s.merged?{oid:'9'.repeat(40)}:null,isInMergeQueue:false,autoMergeRequest:null}}}};
 else if(p.includes('/compare/'))body={status:'ahead'};
 else if(p==='/repos/jerome-queck/emmy')body=repo;
 else throw new Error('Unexpected synthetic provider path '+p);
 save(s);return new Response(JSON.stringify(body??{message:'synthetic refusal'}),{status:code,headers:{'content-type':'application/json'}});
};
`;
    await writeFile(preload, fakeSource);
    await writeFile(push, `import {readFileSync,writeFileSync} from 'node:fs'; const p=${JSON.stringify(stateFile)};const s=JSON.parse(readFileSync(p));s.writes.push('publish');if(!s.deny)s.branch=true;if(s.lost)s.failReadback=true;writeFileSync(p,JSON.stringify(s));if(s.deny)process.exitCode=1;\n`);
    await writeFile(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" push "*) exec ${JSON.stringify(process.execPath)} ${JSON.stringify(push)} ;; *) exec /usr/bin/git "$@" ;; esac\n`, { mode: 0o755 });
    const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(preload).href}`, PATH: `${bin}:${process.env.PATH}`, GITHUB_TOKEN: 'synthetic-provider-token' };
    const run = (args, expected = 0) => {
      const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024 });
      report.commands.push({ args, code: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr });
      assert.equal(result.error, undefined); assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
      return result.stdout.trim() ? JSON.parse(args[0] === 'scripts/github-auto-merge.mjs' ? result.stdout : result.stdout.trim().split('\n').at(-1)) : null;
    };
    run(['scripts/agent.mjs', 'doctor']);
    await writeFile(join(root, '.local/mode'), 'pass');
    const checked = run(['scripts/check.mjs', '--base', 'acceptance-base']);
    assert.equal(checked.status, 'passed-local');
    const receipt = JSON.parse(await readFile(checked.receiptFile)); const source = receipt.initial.context.source;
    const selection = async (name, value) => {
      const file = join(root, '.local', name); const bytes = `${canonical(value)}\n`; await writeFile(file, bytes);
      return { file, sha256: digest(bytes) };
    };
    const provider = async changes => writeFile(stateFile, JSON.stringify({ head: source.head, base: source.base, branch: false, pr: false, statuses: [], merged: false, calls: [], writes: [], ...changes }));
    const requestFile = join(root, '.local/delivery-request.json');
    let serial = 0;
    const request = async () => {
      const binding = { repository: 'jerome-queck/emmy', branch: `codex/cli-${++serial}`, head: source.head, base: source.base, tree: source.workingTree, author: 'synthetic-author' };
      const exact = { head: binding.head, base: binding.base, tree: binding.tree };
      const payloadDigest = digest(canonical({ title: 'Synthetic delivery', body: 'Provider fake only.', head: binding.branch, base: 'main', draft: false }));
      return {
        schemaVersion: 1, mode: 'local', binding, baseRef: 'acceptance-base', action: 'publish', title: 'Synthetic delivery', body: 'Provider fake only.',
        assurance: { receiptFile: checked.receiptFile, receiptDigest: checked.receiptDigest },
        review: await selection(`review-${serial}.json`, { ...exact, payloadDigest, author: binding.author, reviewer: 'synthetic-independent', practical: true, verdict: 'PASS', receiptDigest: checked.receiptDigest, contextDigest: receipt.initial.contextDigest, acceptanceRef: 'synthetic-owner-acceptance' }),
        authorization: await selection(`authorization-${serial}.json`, { ...exact, payloadDigest, repository: binding.repository, branch: binding.branch, actions: ['publish', 'open-pr', 'attest', 'merge'], sourceRef: 'synthetic-owner-scope', notBefore: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }),
      };
    };
    const deliver = async (req, expected = 0) => { await writeFile(requestFile, canonical(req)); return run(['scripts/github-auto-merge.mjs', '--local', requestFile], expected)?.[0]; };
    const state = async () => JSON.parse(await readFile(stateFile));
    await provider({}); const green = await request();
    for (const [action, phase] of [['publish', 'published'], ['open-pr', 'pr-open'], ['attest', 'pr-open'], ['merge', 'merged']]) {
      green.action = action; assert.equal((await deliver(green)).outcome, phase); assert.equal((await deliver(green)).outcome, phase);
    }
    assert.deepEqual((await state()).writes, ['publish', 'open-pr', 'emmy-local-assurance', 'emmy-independent-review', 'merge']); report.cases.push('guarded-publication-to-confirmed-merge', 'duplicate-invocations-no-new-effect');
    await provider({}); const changedText = await request();
    changedText.title = 'Changed after acceptance'; assert.deepEqual((await deliver(changedText, 1)).waiting, ['payload']);
    changedText.title = 'Synthetic delivery'; changedText.body = 'Changed after acceptance'; assert.deepEqual((await deliver(changedText, 1)).waiting, ['payload']);
    assert.deepEqual((await state()).writes, []); report.cases.push('changed-pr-title-before-effect', 'changed-pr-body-before-effect');
    await provider({}); const exactText = await request(); await deliver(exactText); exactText.action = 'open-pr'; const opened = await deliver(exactText);
    const saved = await state(); saved.title = 'Provider field changed'; await writeFile(stateFile, JSON.stringify(saved));
    assert.deepEqual((await deliver(exactText, 1)).waiting, ['pull-request-conflict']);
    const intent = JSON.parse(await readFile(opened.checkpoint)).history.find(row => row.kind === 'intent' && row.action === 'open-pr');
    assert.equal(intent.payload.title, exactText.title); assert.equal(intent.payload.body, exactText.body);
    assert.equal(intent.payloadDigest, digest(canonical(intent.payload))); report.cases.push('saved-pr-text-must-match-retained-payload');
    await provider({}); const invalid = await request();
    await writeFile(join(root, 'source.txt'), 'changed'); assert.equal((await deliver(invalid, 1)).outcome, 'held'); await writeFile(join(root, 'source.txt'), 'original'); report.cases.push('actual-source-drift');
    git(['commit', '--allow-empty', '-qm', 'Synthetic delivery head drift']); assert.equal((await deliver(invalid, 1)).outcome, 'held'); git(['checkout', '--detach', source.head]); report.cases.push('actual-head-drift');
    git(['update-ref', 'refs/heads/acceptance-base', 'HEAD^']); assert.equal((await deliver(invalid, 1)).outcome, 'held'); git(['update-ref', 'refs/heads/acceptance-base', source.base]); report.cases.push('actual-base-ref-drift');
    const dependency = join(root, 'node_modules/commonmark/package.json'); const dependencyBytes = await readFile(dependency); await writeFile(dependency, `${dependencyBytes}\n`); assert.equal((await deliver(invalid, 1)).outcome, 'held'); await writeFile(dependency, dependencyBytes); report.cases.push('actual-dependency-drift');
    const receiptBytes = await readFile(checked.receiptFile); await writeFile(checked.receiptFile, 'tampered receipt'); await deliver(invalid, 1); await writeFile(checked.receiptFile, receiptBytes); report.cases.push('tampered-selected-receipt');
    const originalReview = await readFile(invalid.review.file); const fake = JSON.parse(originalReview); fake.reviewer = fake.author;
    invalid.review = await selection('fake-review.json', fake); assert.deepEqual((await deliver(invalid, 1)).waiting, ['localReview']); report.cases.push('same-author-rehashed-fake-review');
    invalid.review = { file: join(root, '.local', `review-${serial}.json`), sha256: digest(originalReview) };
    await writeFile(invalid.review.file, 'tampered'); await deliver(invalid, 1); await writeFile(invalid.review.file, originalReview); report.cases.push('tampered-selected-review');
    const outputPath = join(dirname(checked.receiptFile), 'first.stdout'); const output = await readFile(outputPath); await writeFile(outputPath, 'tampered-output'); assert.equal((await deliver(invalid, 1)).outcome, 'held'); await writeFile(outputPath, output); report.cases.push('tampered-original-check-output');
    const auth = JSON.parse(await readFile(invalid.authorization.file)); auth.expiresAt = '2026-01-01T00:00:00Z'; invalid.authorization = await selection('expired.json', auth); assert.deepEqual((await deliver(invalid, 1)).waiting, ['authorization']); report.cases.push('expired-action-scope');
    assert.deepEqual((await state()).writes, [], 'Every invalid evidence case prevents provider writes');
    await provider({ drift: true }); const drift = await request(); assert.deepEqual((await deliver(drift, 1)).waiting, ['current-base-or-protection']); report.cases.push('provider-current-base-drift');
    await provider({ deny: true }); const denied = await request(); const unknown = await deliver(denied, 1); assert.equal(unknown.outcome, 'unknown'); assert.equal((await deliver(denied, 1)).rediscoveredOnly, true); assert.deepEqual((await state()).writes, ['publish']); report.cases.push('denied-push-no-retry');
    const checkpoint = JSON.parse(await readFile(unknown.checkpoint)); const pending = checkpoint.pending;
    const resolution = { decision: 'confirmed-absence', attemptId: pending.id, requestDigest: pending.requestDigest, payloadDigest: pending.payloadDigest, action: 'publish', bindingDigest: checkpoint.bindingDigest, observedAt: new Date().toISOString(), sourceRef: 'synthetic-explicit-resolution' };
    const retryGrant = JSON.parse(await readFile(denied.authorization.file)); retryGrant.actions.push('resolve-absence'); retryGrant.resolveAttemptId = pending.id; retryGrant.resolveRequestDigest = pending.requestDigest;
    denied.authorization = await selection('retry-grant.json', retryGrant);
    for (const [name, value] of [['wrong-attempt', { ...resolution, attemptId: 'wrong' }], ['stale', { ...resolution, observedAt: '2000-01-01T00:00:00Z' }], ['wrong-scope', { ...resolution, bindingDigest: 'f'.repeat(64) }]]) {
      denied.resolution = await selection(`resolve-${name}.json`, value); assert.equal((await deliver(denied, 1)).outcome, 'unknown'); report.cases.push(`absence-resolution-${name}-refused`);
    }
    denied.resolution = await selection('resolve-current.json', resolution);
    denied.authorization = await selection('retry-no-resolution-scope.json', { ...retryGrant, actions: ['publish'] });
    assert.equal((await deliver(denied, 1)).outcome, 'unknown'); report.cases.push('absence-without-resolution-authority-held');
    denied.authorization = await selection('retry-wrong-attempt-grant.json', { ...retryGrant, resolveAttemptId: 'wrong' });
    assert.equal((await deliver(denied, 1)).outcome, 'unknown'); report.cases.push('absence-wrong-attempt-authority-held');
    denied.authorization = await selection('retry-grant.json', retryGrant);
    const originalReviewSelection = denied.review;
    const replacementReview = JSON.parse(await readFile(denied.review.file)); replacementReview.acceptanceRef += ' changed selected evidence';
    const changedReview = { ...denied, review: await selection('changed-resolution-review.json', replacementReview) };
    const aliasReceipt = join(dirname(denied.assurance.receiptFile), 'alias-receipt.json'); await writeFile(aliasReceipt, await readFile(denied.assurance.receiptFile));
    for (const [name, changed] of [
      ['review', changedReview],
      ['assurance-selection', { ...denied, assurance: { ...denied.assurance, receiptFile: aliasReceipt } }],
      ['arbitrary-field', { ...denied, extraUnreviewedField: true }],
      ['base-reference', { ...denied, baseRef: 'HEAD' }],
      ['action', { ...denied, action: 'open-pr' }],
      ['payload', { ...denied, body: `${denied.body} changed` }],
    ]) {
      await deliver(changed, 1); const held = JSON.parse(await readFile(unknown.checkpoint));
      assert.equal(held.delivery.phase, 'unknown'); assert.deepEqual(held.delivery.retryUsed, []); assert.deepEqual(held.pending, pending);
      assert.deepEqual((await state()).writes, ['publish']); report.cases.push(`absence-changed-${name}-held-before-resolution`);
    }
    assert.deepEqual(denied.review, originalReviewSelection);
    for (const flag of ['denyRead', 'uncertainRead']) {
      const current = await state(); current[flag] = true; await writeFile(stateFile, JSON.stringify(current)); await deliver(denied, 1);
      current[flag] = false; await writeFile(stateFile, JSON.stringify(current)); report.cases.push(`absence-${flag}-held`);
    }
    denied.resolution = await selection('resolve-fresh-approved.json', { ...resolution, observedAt: new Date().toISOString() });
    assert.equal((await deliver(denied)).outcome, 'retry-ready'); assert.deepEqual((await state()).writes, ['publish']);
    delete denied.resolution; const enabled = await state(); enabled.deny = false; await writeFile(stateFile, JSON.stringify(enabled));
    assert.equal((await deliver(denied)).outcome, 'published'); assert.equal((await deliver(denied)).outcome, 'published');
    assert.deepEqual((await state()).writes, ['publish', 'publish']); report.cases.push('fresh-process-absence-resolution-and-one-retry');
    await provider({ lost: true }); const lost = await request(); assert.equal((await deliver(lost, 1)).outcome, 'unknown'); assert.equal((await deliver(lost)).rediscoveredOnly, true); assert.deepEqual((await state()).writes, ['publish']); report.cases.push('lost-result-rediscovered-on-restart');
    report.retainedReceipt = checked; report.providerFinal = await state(); report.status = 'passed'; await save(); return report;
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; await save(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  driveDelivery().then(report => process.stdout.write(`${JSON.stringify({ status: report.status, cases: report.cases.length, commands: report.commands.length, directory: report.directory })}\n`)).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
