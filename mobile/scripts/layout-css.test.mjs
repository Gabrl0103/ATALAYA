// Checks of the app's layout CSS, run by `npm test` before the unit tests (node --test).
// The app fills the phone's window edge to edge (theme/base.css) and keeps away from the system bars only through
// --safe-* (theme/tokens.css). These checks read the styles so a later change cannot bring back a size tied to one
// device or a raw env() that misses the insets Capacitor injects.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

/** Every .css file and every component .ts (inline styles) of the app, with its path from src/app. */
function styleSources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return styleSources(path);
    if (!/\.(css|ts)$/.test(name) || name.endsWith('.spec.ts')) return [];
    return [{ path: relative(appDir, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }];
  });
}

const sources = styleSources(appDir);
const read = (path) => sources.find((source) => source.path === path).text;
const tokens = read('theme/tokens.css');
const base = read('theme/base.css');

describe('layout CSS', () => {
  it('reads the app styles', () => {
    assert.ok(sources.length > 20);
  });

  it('uses no viewport units tied to the whole screen (100vh / 100vw)', () => {
    assert.deepEqual(sources.filter(({ text }) => /\b100v[hw]\b/.test(text)).map(({ path }) => path), []);
  });

  it('reaches the system insets only through --safe-* (tokens.css)', () => {
    const offenders = sources
      .filter(({ path, text }) => path !== 'theme/tokens.css' && /env\(\s*safe-area-inset/.test(text))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.ok(
        tokens.includes(`--safe-${side}: max(env(safe-area-inset-${side}, 0px), var(--safe-area-inset-${side}, 0px));`),
        `--safe-${side}`,
      );
    }
  });

  it('leaves room under all content for the bottom nav, its margin and the system navigation', () => {
    assert.ok(tokens.includes('--nav-clearance: calc(var(--nav-height) + var(--nav-bottom) + 24px + var(--safe-bottom));'));
    assert.ok(read('presentation/components/bottom-nav/bottom-nav.css').includes('bottom: calc(var(--nav-bottom) + var(--safe-bottom));'));
    assert.match(base, /\.page-scroll \{[^}]*var\(--nav-clearance\)/);
  });

  it('fills the window on a phone and keeps the 390 × 844 frame for a computer only', () => {
    assert.ok(base.includes('.phone-shell { position: absolute; inset: 0;'));
    assert.ok(base.includes('@media (min-width: 600px) and (hover: hover) and (pointer: fine)'));
  });
});
