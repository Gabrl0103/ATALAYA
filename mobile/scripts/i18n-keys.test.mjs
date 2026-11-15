// The dictionaries hold only texts the app uses: every key of es.json (and en.json, which i18n.spec.ts keeps
// equal) must be named somewhere in the app's code or templates, so a removed screen does not leave its texts.
// A key counts as used when it appears quoted ('home.title'), by its plural base ('sheet.hotspotsNear' for
// .one/.other/.zero), or under a prefix the code completes at run time (`dir.${direction}`).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

const code = sources(appDir).join('\n');
const read = (language) => JSON.parse(readFileSync(join(appDir, 'i18n', `${language}.json`), 'utf8'));
const quoted = (text) => code.includes(`'${text}'`) || code.includes(`"${text}"`);
/** Prefixes completed at run time: `dir.${…}` → 'dir'. */
const dynamicPrefixes = [...code.matchAll(/[`'"]([a-zA-Z.]+)\.\$\{/g)].map((match) => match[1]);

describe('i18n keys', () => {
  it('finds the run-time prefixes it allows', () => {
    assert.ok(dynamicPrefixes.includes('dir'));
  });

  it('has no orphan keys in the dictionaries', () => {
    for (const language of ['es', 'en']) {
      const orphans = Object.keys(read(language)).filter((key) => {
        const base = key.replace(/\.(one|other|zero)$/, '');
        return !quoted(key) && !quoted(base) && !dynamicPrefixes.some((prefix) => key.startsWith(`${prefix}.`));
      });
      assert.deepEqual(orphans, [], `${language}.json`);
    }
  });
});
