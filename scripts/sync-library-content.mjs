import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const reactSource = path.resolve(
  dirname,
  '../../loza_react_frontend/src/generated/libraryContent.generated.ts',
);
const output = path.resolve(dirname, '../js/libraryContent.js');
const source = fs.readFileSync(reactSource, 'utf8');

function extractArray(name) {
  const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*?\\]);`));
  if (!match) throw new Error(`Could not read ${name} from React catalog.`);
  return JSON.parse(match[1]);
}

const sections = extractArray('generatedLibrarySections');
const items = extractArray('generatedLibraryItems');
fs.writeFileSync(
  output,
  `/* Generated from the React catalog. Run scripts/sync-library-content.mjs after catalog changes. */\nwindow.LOZA_LIBRARY_CONTENT=${JSON.stringify({ sections, items })};\n`,
);
console.log(`Synced ${sections.length} sections and ${items.length} items.`);
