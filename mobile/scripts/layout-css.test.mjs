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

// Contrast (WCAG 2.1): text needs 4.5:1 against what is behind it. The colours are read from the styles, so
// changing a token or a badge colour that breaks it fails here. Translucent layers are composed over what is
// below them, in the worst place each text can be.
const hex = (value) => {
  const h = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgba = (value) => {
  const match = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(value);
  assert.ok(match, `rgba: ${value}`);
  return { color: match.slice(1, 4).map(Number), alpha: Number(match[4]) };
};
const over = (color, alpha, below) => color.map((c, i) => c * alpha + below[i] * (1 - alpha));
const luminance = (color) => {
  const [r, g, b] = color.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name) => {
  const match = new RegExp(`--${name}:\s*([^;]+);`).exec(tokens);
  assert.ok(match, `--${name}`);
  return match[1].trim();
};

describe('text contrast', () => {
  const bg = hex(token('bg'));
  const text = hex(token('text'));
  const text2 = rgba(token('text-2'));
  const glass = rgba(token('glass-bg'));
  const onGlass = (below) => over(glass.color, glass.alpha, below);
  const secondaryOn = (surface) => contrast(over(text2.color, text2.alpha, surface), surface);

  it('keeps the secondary text at 4.5:1 on glass, over the page and over the brightest lava glow', () => {
    const lava = read('presentation/components/lava-bg/lava-bg.css');
    const glowColor = hex(/radial-gradient\(circle, (#[0-9a-f]{6}) 0%/.exec(lava)[1]);
    const glowAlpha = Number(/\.glow-a \{[^}]*opacity: ([\d.]+)/.exec(lava)[1]);
    assert.ok(secondaryOn(onGlass(bg)) >= 4.5, 'page');
    assert.ok(secondaryOn(onGlass(over(glowColor, glowAlpha, bg))) >= 4.5, 'glow');
    assert.ok(contrast(text, onGlass(over(glowColor, glowAlpha, bg))) >= 4.5, 'primary text on glow');
  });

  it('keeps the secondary text at 4.5:1 on the map sheets, over the brightest zone fill', () => {
    const sheet = rgba(token('glass-strong'));
    const layers = read('presentation/pages/map/map-layers.ts');
    const selected = Number(/selected: ([\d.]+)/.exec(layers)[1]);
    for (const level of ['low', 'medium', 'high', 'extreme']) {
      const fill = over(hex(token(`risk-${level}`)), selected, bg);
      assert.ok(secondaryOn(over(sheet.color, sheet.alpha, fill)) >= 4.5, level);
    }
  });

  it('keeps every risk badge at 4.5:1', () => {
    const badge = read('presentation/components/risk-badge/risk-badge.css');
    const levels = [...badge.matchAll(/--c: (\d+), (\d+), (\d+);\s*--t: (#[0-9a-f]{6});/g)];
    assert.equal(levels.length, 4);
    const tint = Number(/rgba\(var\(--c\), ([\d.]+)\), rgba\(var\(--c\)/.exec(badge)[1]);
    for (const [, r, g, b, t] of levels) {
      const surface = over([Number(r), Number(g), Number(b)], tint, onGlass(bg));
      assert.ok(contrast(hex(t), surface) >= 4.5, t);
    }
  });

  it('keeps the map labels at 4.5:1 in every risk colour, over the brightest zone fill', () => {
    const markers = read('theme/map-markers.css');
    const label = rgba(/\.zone-label \{[^}]*background: (rgba\([^)]+\))/.exec(markers)[1]);
    const brightest = over(hex(token('risk-medium')), 0.62, bg);
    const surface = over(label.color, label.alpha, brightest);
    assert.ok(contrast(hex(token('map-foreground')), surface) >= 4.5, 'name');
    for (const level of ['low', 'medium', 'high', 'extreme']) {
      assert.ok(contrast(hex(token(`risk-${level}`)), surface) >= 4.5, level);
    }
    assert.match(markers, /\.zone-label small \{[^}]*font-size: (9|1\d)px/);
  });

  it('keeps white text at 4.5:1 on the error notices and the map credits legible', () => {
    assert.ok(contrast([255, 255, 255], hex(token('danger-bg'))) >= 4.5, 'notice');
    const markers = read('theme/map-markers.css');
    const credits = rgba(/\.maplibregl-ctrl-attrib \{[^}]*color: (rgba\([^)]+\))/.exec(markers)[1]);
    const deep = hex(token('map-deep'));
    assert.ok(contrast(over(credits.color, credits.alpha, deep), deep) >= 4.5, 'credits');
  });
});

describe('touch targets and focus', () => {
  it('gives the sheet handles, the search clear button and the map notices 44 px targets', () => {
    const targets = [
      ['presentation/components/zone-sheet/sheet-frame.css', /\.sheet-handle \{[^}]*height: (\d+)px/],
      ['presentation/components/map-overview-sheet/map-overview-sheet.css', /\.handle \{[^}]*height: (\d+)px/],
      ['presentation/components/search-box/search-box.css', /\.clear \{[^}]*min-height: (\d+)px/],
      ['presentation/pages/map/map.page.css', /\.error-banner button \{[^}]*min-height: (\d+)px/],
    ];
    for (const [path, pattern] of targets) {
      const match = pattern.exec(read(path));
      assert.ok(match, path);
      assert.ok(Number(match[1]) >= 44, `${path}: ${match[1]}px`);
    }
  });

  it('shows where the focus is when moving with a keyboard or switch access', () => {
    assert.match(base, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible \{\s*outline: 2px solid/);
  });
});

describe('settings row selectors', () => {
  const settings = read('presentation/pages/settings/settings.page.css');

  it('keeps the 4 px padding of a selector inside a row (only the text block gets the row padding)', () => {
    assert.ok(settings.includes('.row > div:not(.segmented) { min-width: 0; padding: 8px 0; }'));
    assert.doesNotMatch(settings, /\.row > div \{/);
  });

  it('gives the options of a row selector the same width, growing with the text size', () => {
    assert.match(settings, /\.segmented\.compact \{[^}]*grid-auto-columns: 1fr;/);
    assert.match(settings, /\.segmented\.compact button \{ min-width: [\d.]+em; \}/);
    assert.ok(settings.includes('.segmented.compact button.mono { min-width: calc(4ch + 24px); }'));
    assert.doesNotMatch(settings, /\.segmented\.compact button \{[^}]*min-width: \d+px/);
  });

  it('lets the selector drop under its label instead of leaving the card', () => {
    assert.match(settings, /\.choice-row \{[^}]*flex-wrap: wrap;/);
    assert.match(settings, /\.choice-row > span \{[^}]*min-width: 0;/);
  });
});
