const METADATA_URL = 'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links';

function parts(value) {
  const numbers = typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : value;
  if (!Array.isArray(numbers) || numbers.length !== 3 || !numbers.every(n => Number.isInteger(n) && n >= 0 && n <= 65535)) throw new Error('Invalid Minecraft engine version');
  return numbers;
}
function compareVersions(a, b) {
  a = parts(a); b = parts(b);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
function parseReleaseMetadata(data, target = 'release') {
  if (!['release', 'preview'].includes(target)) throw new Error('Invalid Minecraft channel');
  const entry = data?.result?.links?.find(link => link.downloadType === (target === 'preview' ? 'serverBedrockPreviewWindows' : 'serverBedrockWindows'));
  if (typeof entry?.downloadUrl !== 'string') throw new Error('Official metadata did not contain a Windows Bedrock release');
  const url = new URL(entry.downloadUrl);
  if (url.protocol !== 'https:' || !['www.minecraft.net', 'minecraft.net'].includes(url.hostname) || url.pathname.includes('-preview/') !== (target === 'preview')) throw new Error('Unexpected Bedrock release download location');
  const match = /^bedrock-server-(\d+\.\d+\.\d+)(?:\.(\d+))?\.zip$/i.exec(url.pathname.split('/').at(-1));
  if (!match) throw new Error('Official metadata contained an unrecognized Bedrock version');
  const version = parts(match[1]).join('.');
  return { version, buildVersion: version + (match[2] ? '.' + match[2] : ''), source: METADATA_URL };
}
async function getCurrentRelease({ fetchImpl = globalThis.fetch, timeoutMs = 8000, target = 'release' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(METADATA_URL, { headers: { Accept: 'application/json', 'User-Agent': 'Bedrock-Workbench' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Minecraft release check returned HTTP ${response.status}`);
    return parseReleaseMetadata(await response.json(), target);
  } finally { clearTimeout(timer); }
}
module.exports = { METADATA_URL, compareVersions, parseReleaseMetadata, getCurrentRelease };
