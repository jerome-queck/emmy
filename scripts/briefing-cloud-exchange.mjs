#!/usr/bin/env node
import { acquireCapturedBriefingSource, briefingCloudReadRequest, readBriefingExchangeFile } from '../src/briefing-cloud-exchange.mjs';

const [action, file, directory, policyFile] = process.argv.slice(2);
try {
  const input = await readBriefingExchangeFile(file);
  if (action === 'request') console.log(JSON.stringify(briefingCloudReadRequest(input.request, input.cursor ?? null)));
  else if (action === 'acquire' && directory) {
    const policy = policyFile ? await readBriefingExchangeFile(policyFile) : undefined;
    console.log(JSON.stringify(await acquireCapturedBriefingSource(input, { directory, policy, now: () => new Date().toISOString() })));
  } else throw new Error('Use request <request.json> or acquire <manifest.json> <private-retention-directory> [verified-policy.json]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
