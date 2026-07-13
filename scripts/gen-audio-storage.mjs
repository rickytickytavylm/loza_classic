import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(
  path.resolve(__dirname, '../../loza_react_frontend/src/generated/audioStorage.generated.ts'),
  'utf8',
);
const match = src.match(/export const audioStorageRows[^=]*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error('audioStorageRows not found');
const rows = JSON.parse(match[1].replace(/(\w+):/g, '"$1":'));
const out = `window.LOZA_AUDIO_STORAGE=${JSON.stringify({
  baseUrl: 'https://storage.yandexcloud.net/fidesetratio',
  rows,
})};`;
fs.writeFileSync(path.resolve(__dirname, '../js/audioStorage.js'), out);
console.log('generated', rows.length, 'rows');
