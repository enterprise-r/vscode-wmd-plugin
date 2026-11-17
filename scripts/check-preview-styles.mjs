#!/usr/bin/env node
// Headless computed-style check of a sample .w.md preview.
// Uses the system's Chrome. No screenshots. No new package dependency.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const chromeBin = process.env.CHROME || 'google-chrome';

const cssFiles = [
  'media/palette.css',
  'media/colors.css',
  'media/ui.css',
  'media/style.css',
  'media/draw.css',
  'media/vscode.css',
];

function fail(msg) {
  console.error(`check-preview-styles: ${msg}`);
  process.exitCode = 1;
}

function rgbChannels(color) {
  const m = String(color).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hexChannels(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colorsClose(computed, hex, slop = 2) {
  const a = rgbChannels(computed);
  const b = hexChannels(hex);
  if (!a) return false;
  return a.every((v, i) => Math.abs(v - b[i]) <= slop);
}

async function waitFor(fn, ms = 8000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await delay(50);
  }
  throw last || new Error('timed out');
}

async function cdp(wsUrl, method, params = {}, sessionId) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method} ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    }
  });
  function send(method, params, sessionId) {
    const thisId = ++id;
    const payload = { id: thisId, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(thisId, { resolve, reject }));
  }
  // If called as a one-shot helper at the top, wrap later. Here we return the send/close.
  return { send, close: () => ws.close() };
}

const dir = await mkdtemp(join(tmpdir(), 'wmd-preview-'));
const userData = join(dir, 'chrome');
await mkdir(userData);
const fixtureSrc = await readFile(join(here, 'fixtures/preview-card.html'), 'utf8');
const links = cssFiles
  .map((f) => `  <link rel="stylesheet" href="${pathToFileURL(join(root, f)).href}">`)
  .join('\n');
const html = fixtureSrc.replace('  <!-- CSS hrefs are filled in by scripts/check-preview-styles.mjs -->', links);
const htmlPath = join(dir, 'preview-card.html');
await writeFile(htmlPath, html);

const chrome = spawn(chromeBin, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-search-engine-choice-screen',
  '--remote-debugging-port=0',
  `--user-data-dir=${userData}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
chrome.stderr.on('data', (c) => { stderr += c; });

let portFile;
try {
  portFile = await waitFor(async () => {
    try {
      return (await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    } catch {
      return null;
    }
  });
} catch (err) {
  chrome.kill('SIGKILL');
  await rm(dir, { recursive: true, force: true });
  fail(`Chrome did not start (${err.message}). ${stderr.trim()}`);
  process.exit(1);
}

const port = portFile.trim();
const version = await waitFor(async () => {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) return null;
  return res.json();
});

const browser = await cdp(version.webSocketDebuggerUrl);
try {
  const { targetId } = await browser.send('Target.createTarget', {
    url: pathToFileURL(htmlPath).href,
  });
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const send = (method, params) => browser.send(method, params, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await waitFor(async () => {
    const { result } = await send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    return result.value === 'complete' ? true : null;
  });

  const { result } = await send('Runtime.evaluate', {
    expression: `(() => {
      const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
      const body = document.body;
      const card = document.querySelector('card[agent]');
      const form = document.querySelector('form');
      const go = document.querySelector('gonogo > go');
      const nogo = document.querySelector('gonogo > nogo');
      const check = document.querySelector('.wmd-check');
      const schema = document.querySelector('schema');
      const fm = document.querySelector('.frontmatter');
      const sheets = [...document.styleSheets].map((s) => {
        try { return [...s.cssRules].map((r) => r.cssText).join('\\n'); }
        catch { return ''; }
      }).join('\\n');

      const receipt = () => {
        body.classList.remove('wmd-full');
        body.classList.add('wmd-receipt');
        const rec = document.querySelector('record');
        const mark = getComputedStyle(body, '::after').getPropertyValue('content');
        const italic = getComputedStyle(rec).fontStyle;
        body.classList.remove('wmd-receipt');
        body.classList.add('wmd-full');
        return { mark, italic };
      };

      const flow = () => {
        body.classList.remove('wmd-full');
        body.classList.add('wmd-flow');
        const display = css(fm, 'display');
        body.classList.remove('wmd-flow');
        body.classList.add('wmd-full');
        return display;
      };

      const rec = receipt();
      return {
        cardBorderStyle: css(card, 'border-top-style'),
        cardBorderColor: css(card, 'border-top-color'),
        formBorderStyle: css(form, 'border-top-style'),
        formBorderColor: css(form, 'border-top-color'),
        goBorderLeft: css(go, 'border-left-width'),
        goBorderRight: css(go, 'border-right-width'),
        goBorderRightColor: css(go, 'border-right-color'),
        nogoBorderLeft: css(nogo, 'border-left-width'),
        nogoBorderRight: css(nogo, 'border-right-width'),
        checkBorderStyle: css(check, 'border-top-style'),
        cardFilter: css(card, 'filter'),
        formFilter: css(form, 'filter'),
        schemaBorderRadius: css(schema, 'border-top-left-radius'),
        flowFrontMatter: flow(),
        receiptMark: rec.mark,
        receiptItalic: rec.italic,
        sheetHasWaitFilter: /--wmd-wait-filter/.test(sheets),
        sheetHasBlur: /blur\\(1px\\)/.test(sheets),
        sheetHasGray: /grayscale\\(\\s*\\.?[58]/.test(sheets),
      };
    })()`,
    returnByValue: true,
  });
  const s = result.value;
  if (!s) {
    fail(`evaluation returned nothing: ${JSON.stringify(result)}`);
  } else {
    const checks = [
      ['agent card is dashed', s.cardBorderStyle === 'dashed', s.cardBorderStyle],
      ['agent card uses magenta', colorsClose(s.cardBorderColor, '#BA9EDA'), s.cardBorderColor],
      ['form line is double', s.formBorderStyle === 'double', s.formBorderStyle],
      ['go is open on the left', parseFloat(s.goBorderLeft) === 0, s.goBorderLeft],
      ['go has a 3px right stroke', parseFloat(s.goBorderRight) === 3, s.goBorderRight],
      ['nogo is open on the right', parseFloat(s.nogoBorderRight) === 0, s.nogoBorderRight],
      ['nogo has a 3px left stroke', parseFloat(s.nogoBorderLeft) === 3, s.nogoBorderLeft],
      ['check bubble is solid', s.checkBorderStyle === 'solid', s.checkBorderStyle],
      ['card has no run-state filter', s.cardFilter === 'none', s.cardFilter],
      ['form has no run-state filter', s.formFilter === 'none', s.formFilter],
      ['schema uses the notice radius', s.schemaBorderRadius === '0.6rem' || parseFloat(s.schemaBorderRadius) >= 8, s.schemaBorderRadius],
      ['flow shows the front matter', s.flowFrontMatter !== 'none', s.flowFrontMatter],
      ['receipt shows the EXAMPLE mark', /EXAMPLE/i.test(s.receiptMark), s.receiptMark],
      ['receipt values are italic', s.receiptItalic === 'italic', s.receiptItalic],
      ['stylesheets omit --wmd-wait-filter', s.sheetHasWaitFilter === false, s.sheetHasWaitFilter],
      ['stylesheets omit blur(1px)', s.sheetHasBlur === false, s.sheetHasBlur],
      ['stylesheets omit grayscale run filters', s.sheetHasGray === false, s.sheetHasGray],
    ];
    let ok = 0;
    for (const [name, pass, got] of checks) {
      if (pass) {
        ok += 1;
      } else {
        fail(`${name} (got ${JSON.stringify(got)})`);
      }
    }
    if (process.exitCode) {
      console.error(`check-preview-styles: ${ok}/${checks.length} checks passed`);
    } else {
      console.log(`check-preview-styles: ${ok}/${checks.length} checks passed`);
    }
  }
} finally {
  try { browser.close(); } catch {}
  chrome.kill('SIGKILL');
  await rm(dir, { recursive: true, force: true });
}
