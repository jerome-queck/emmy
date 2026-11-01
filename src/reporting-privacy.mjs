const credential = /(?:\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|[?&](?:access_token|api[_-]?key|token|password|client_secret|signature|sig)=)/i;
const privateExport = /(?:\/(?:Users|Volumes|home|private|tmp)\/|\b[A-Za-z]:\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|\n)(?:Message-ID|Authorization|Cookie|Set-Cookie):)/i;
export function assertNoCredentials(value) {
  if (typeof value === 'string') {
    if (credential.test(value)) throw new Error('Credential-like content refused; retain reporting as pending');
    for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      let url; try { url = new URL(match[0]); } catch { throw new Error('Malformed artifact URL'); }
      if (url.username || url.password || [...url.searchParams.keys()].some(key => ['accesstoken', 'apikey', 'token', 'password', 'clientsecret', 'signature', 'sig'].includes(key.toLowerCase().replace(/[-_]/g, '')))) throw new Error('Credential-bearing URL refused');
    }
  } else if (Array.isArray(value)) value.forEach(assertNoCredentials);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertNoCredentials);
}
export function assertExportSafe(value) {
  assertNoCredentials(value);
  if (typeof value === 'string' && privateExport.test(value)) throw new Error('Private path, account address or raw payload refused in cloud export');
  if (Array.isArray(value)) value.forEach(assertExportSafe);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertExportSafe);
}
export function validateArtifactLinks(links) {
  if (!Array.isArray(links) || links.length > 20) throw new Error('Expected at most twenty sanitized artifact links');
  for (const item of links) {
    if (!item || Object.keys(item).sort().join(',') !== 'label,url' || typeof item.label !== 'string' || !item.label || item.label.length > 120 || typeof item.url !== 'string' || item.url.length > 400) throw new Error('Invalid artifact link shape');
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) throw new Error('Expected a sanitized HTTPS artifact link');
  }
  assertExportSafe(links); return links;
}
