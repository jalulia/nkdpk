// node tools/seal-study.mjs path/to/complete-study.html path/outside/repository/Review.webloc
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

const [html, linkFile] = process.argv.slice(2);
if (!html || !linkFile) throw Error('Supply the standalone study and a private .webloc path.');
const root = fileURLToPath(new URL('../', import.meta.url));
if (!relative(root, resolve(linkFile)).startsWith('..')) throw Error('Store the review link outside the repository.');
const existing = existsSync(linkFile) ? readFileSync(linkFile, 'utf8').match(/#k=([A-Za-z0-9_-]{43})/) : null;
if (!existing && existsSync(linkFile)) throw Error('The existing private link file could not be read.');
const key = existing ? Buffer.from(existing[1], 'base64url') : randomBytes(32);
const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
const original = readFileSync(html);
const body = Buffer.concat([cipher.update(gzipSync(original)), cipher.final()]);
const tag = cipher.getAuthTag();
const test = createDecipheriv('aes-256-gcm', key, iv);
test.setAuthTag(tag);
if (!gunzipSync(Buffer.concat([test.update(body), test.final()])).equals(original)) throw Error('Round-trip validation failed.');
if (!existing) {
 const url = 'https://jalulia.github.io/nkdpk/review/#k=' + key.toString('base64url');
 writeFileSync(linkFile, '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>URL</key><string>'+url+'</string></dict></plist>\n', {mode:0o600, flag:'wx'});
}
writeFileSync(new URL('../review/study.bin',import.meta.url), Buffer.concat([iv, body, tag]));
console.log('Sealed and verified the complete study. The private link is stored outside the repository.');
