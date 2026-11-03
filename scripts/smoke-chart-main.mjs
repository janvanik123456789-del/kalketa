// Runs inside Electron for smoke-chart.mjs: the page with sample charts in a hidden window, driven by real input events.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.KALKETA_CHART_OUT ?? app.getPath('temp');
app.setPath('userData', join(out, 'profile'));

const steps = {};
/** What a failed step needs to be understood. */
const detail = {};
const errors = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

let win;
let contents;

const js = (code) => contents.executeJavaScript(code);
const chart = '[data-sample="0"] svg.chart-svg';
const panelHead = '.chart-part-panel .part-head strong';
const plotLine = () => js(`document.querySelector('[data-sample="0"] [data-plot-line]').textContent`);
const attr = (selector, name) => js(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)}) ?? ''`);
const text = (selector) => js(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? ''`);
const exists = (selector) => js(`!!document.querySelector(${JSON.stringify(selector)})`);

/** The middle of what the selector finds, brought into view. */
async function place(selector) {
  const at = await js(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return undefined;
    element.scrollIntoView({ block: 'center' });
    const r = element.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!at) throw new Error(`Not found: ${selector}`);
  return at;
}
async function clickAt(at, { button = 'left', clickCount = 1 } = {}) {
  contents.sendInputEvent({ type: 'mouseMove', ...at });
  contents.sendInputEvent({ type: 'mouseDown', ...at, button, clickCount });
  contents.sendInputEvent({ type: 'mouseUp', ...at, button, clickCount });
  await pause(250);
}
const click = async (selector, options) => clickAt(await place(selector), options);
async function key(keyCode) {
  contents.sendInputEvent({ type: 'keyDown', keyCode });
  contents.sendInputEvent({ type: 'keyUp', keyCode });
  await pause(150);
}
async function drag(selector, dx, dy, halfway) {
  const from = await place(selector);
  contents.sendInputEvent({ type: 'mouseMove', ...from });
  contents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    contents.sendInputEvent({ type: 'mouseMove', x: from.x + Math.round((dx * i) / 8), y: from.y + Math.round((dy * i) / 8), button: 'left', modifiers: ['leftbuttondown'] });
    await pause(30);
    if (i === 4) await halfway?.();
  }
  contents.sendInputEvent({ type: 'mouseUp', x: from.x + dx, y: from.y + dy, button: 'left', clickCount: 1 });
  await pause(300);
}
async function clickMenu(label) {
  const at = await js(`(() => {
    const row = [...document.querySelectorAll('.context-menu .menu-row')].find((r) => r.textContent.includes(${JSON.stringify(label)}));
    if (!row) return undefined;
    row.scrollIntoView({ block: 'nearest' });
    const r = row.getBoundingClientRect();
    return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!at) throw new Error(`No menu row: ${label}`);
  await clickAt(at);
}

async function picture() {
  win.setOpacity(0);
  win.showInactive();
  contents.invalidate();
  await pause(600);
  const image = await contents.capturePage();
  win.hide();
  writeFileSync(join(out, 'chart.png'), image.toPNG());
}

async function run() {
  await win.loadFile(join(root, 'packages', 'chart-editor', 'workbench', 'dist', 'index.html'));
  await pause(800);
  steps.drawn = await exists(chart);
  // The first press of a hidden window may only bring it focus.
  await clickAt({ x: 5, y: 5 });

  // A selected chart shows what can be edited: the texts in frames, those that move with handles.
  steps.framesShown = await js(`(() => {
    const frames = [...document.querySelectorAll('[data-sample="0"] .chart-part-frame')];
    return frames.length >= 4 && frames.every((f) => getComputedStyle(f).display === 'block' && f.offsetWidth > 0) && frames.filter((f) => f.classList.contains('moves')).length >= 2 && !document.querySelector('${chart} .chart-part-frame');
  })()`);

  // A click on a part: its small window, which stays open as the line changes, and shows each change at once.
  const yTitle = `${chart} [data-part="yTitle"]`;
  await click(yTitle);
  steps.titleWindow = (await text(panelHead)) === 'Popis osy y';
  // Shown at once, written a moment later: the sheet is not recalculated with each change.
  const before = await plotLine();
  const bold = await place('.chart-part-panel [data-part-field="bold"]');
  contents.sendInputEvent({ type: 'mouseDown', ...bold, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', ...bold, button: 'left', clickCount: 1 });
  for (let waited = 0; waited < 200 && (await attr(yTitle, 'font-weight')) !== 'bold'; waited += 10) await pause(10);
  steps.lookAtOnce = (await attr(yTitle, 'font-weight')) === 'bold' && (await plotLine()) === before && (await exists('.chart-part-panel button.on[data-part-field="bold"]'));
  await pause(500);
  steps.bold = (await attr(yTitle, 'font-weight')) === 'bold' && (await plotLine()).includes('yTitle.bold');
  await click('.chart-part-panel [data-part-field="vertical"]');
  await pause(300);
  steps.upright = /rotate\(-90/.test(await attr(yTitle, 'transform')) && (await text(panelHead)) === 'Popis osy y';
  await key('Escape');
  steps.escCloses = !(await exists('.chart-part-panel'));

  // Dragged, a title moves and no window opens.
  await pause(600);
  const beforeDrag = await plotLine();
  const unmoved = await attr(yTitle, 'transform');
  await drag(yTitle, 30, -25, async () => {
    // A hidden window takes the moves with its next frame.
    for (let waited = 0; waited < 1000 && (await attr(yTitle, 'transform')) === unmoved; waited += 50) await pause(50);
    steps.titleFollows = (await attr(yTitle, 'transform')) !== unmoved && (await plotLine()) === beforeDrag;
  });
  await pause(500);
  steps.titleWrittenAtEnd = (await plotLine()) !== beforeDrag;
  steps.titleDragged = /translate\(/.test(await attr(yTitle, 'transform')) && !(await exists('.chart-part-panel'));

  // Taken by its frame, a title moves, and the frame goes with it.
  const xFrame = '[data-sample="0"] .chart-part-frame[data-part="xTitle"]';
  const frameBefore = await place(xFrame);
  await drag(xFrame, 40, -10);
  await pause(400);
  const frameAfter = await place(xFrame);
  steps.dragByFrame = /translate\(/.test(await attr(`${chart} [data-part="xTitle"]`, 'transform')) && frameAfter.x > frameBefore.x + 20 && (await plotLine()).includes('xTitle.at=');

  // A double click on a part opens its window, not the line of the chart.
  await click(yTitle, { clickCount: 2 });
  steps.doubleClickKeepsLine = (await text(panelHead)) === 'Popis osy y' && !(await exists('[data-sample="0"][data-line-opened]'));
  await key('Escape');

  await click(`${chart} [data-part="xTicks"]`);
  steps.ticksWindow = (await text(panelHead)) === 'Čísla na ose x';
  await key('Escape');
  // On the curve itself: the middle of its box may be off it.
  await clickAt(await js(`(() => {
    const path = document.querySelector('${chart} [data-part="s0"]');
    const p = path.getPointAtLength(path.getTotalLength() / 3).matrixTransform(path.getScreenCTM());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  })()`));
  steps.curveWindow = (await text(panelHead)).startsWith('Křivka');
  await key('Escape');

  // A double click into the plot: the grid and the background.
  const plot = await place(`${chart} .chart-plot-fill, ${chart}`);
  await clickAt(plot, { clickCount: 2 });
  await pause(200);
  steps.gridWindow = (await text(panelHead)) === 'Mřížka a plocha';
  await key('Escape');

  // Shift + wheel zooms into the line; the menu takes it back.
  contents.sendInputEvent({ type: 'mouseMove', ...plot });
  contents.sendInputEvent({ type: 'mouseWheel', ...plot, deltaX: 0, deltaY: 120, wheelTicksY: 1, canScroll: true, modifiers: ['shift'] });
  // A hidden window draws seldom, and the wheel comes with a drawn frame.
  for (let waited = 0; waited < 3000 && !/xlim:/.test(await plotLine()); waited += 100) await pause(100);
  detail.zoomed = await plotLine();
  steps.zoomed = /xlim:/.test(detail.zoomed);
  await clickAt(plot, { button: 'right' });
  await clickMenu('Celý rozsah');
  await pause(300);
  steps.wholeRange = !/xlim:/.test(await plotLine());

  // A reference line follows the pointer.
  const hline = (await plotLine()).match(/hline: [^,)]+/)?.[0];
  const lineBefore = await plotLine();
  await drag(`${chart} [data-chart-drag="ref"]`, 0, 30, async () => {
    steps.refNotWrittenWhileMoving = (await plotLine()) === lineBefore;
  });
  steps.refDragged = (await plotLine()).match(/hline: [^,)]+/)?.[0] !== hline;

  // The handles of a chart stay its handles, also where the frame of a title reaches under them.
  await drag('[data-sample="1"] .picture-handle.edge.s', 0, 40);
  await pause(300);
  steps.edgeHandleResizes = /ratio=/.test(await text('[data-sample="1"] [data-plot-line]'));

  await picture();

  // A menu longer than the window scrolls; the mouse on a row with a submenu opens it once, whole, and it stays.
  const [width, height] = win.getContentSize();
  win.setContentSize(width, 450);
  await pause(300);
  await clickAt(await place(chart), { button: 'right' });
  const row = await js(`(() => {
    const panel = document.querySelector('.context-menu .menu-panel');
    const row = [...panel.querySelectorAll(':scope > .menu-entry > .menu-row')].find((r) => r.textContent.includes('Vyšrafovat'));
    row.scrollIntoView({ block: 'center' });
    window.__submenus = 0;
    new MutationObserver((changes) => { for (const c of changes) for (const n of c.addedNodes) if (n.classList?.contains('submenu-anchor')) window.__submenus++; }).observe(panel, { childList: true, subtree: true });
    const box = row.getBoundingClientRect();
    return { x: Math.round(box.left + 40), y: Math.round(box.top + box.height / 2) };
  })()`);
  contents.sendInputEvent({ type: 'mouseMove', ...row });
  // A hidden window takes the move with its next frame; then it must stay at one opening.
  for (let waited = 0; waited < 3000 && !(await exists('.context-menu .submenu-anchor')); waited += 100) await pause(100);
  await pause(800);
  const menu = await js(`(() => {
    const panel = document.querySelector('.context-menu .menu-panel');
    const own = panel.getBoundingClientRect();
    const sub = panel.querySelector('.submenu-anchor > .menu-panel')?.getBoundingClientRect();
    return { opened: window.__submenus, scrolls: panel.scrollHeight > panel.clientHeight, inside: own.top >= 0 && own.bottom <= innerHeight, whole: !!sub && sub.bottom <= innerHeight && sub.right <= innerWidth, x: Math.round(sub?.left + 30), y: Math.round(sub?.top + 12) };
  })()`);
  detail.menu = menu;
  steps.longMenuScrolls = menu.scrolls && menu.inside;
  steps.submenuOnce = menu.opened === 1 && menu.whole;
  contents.sendInputEvent({ type: 'mouseMove', x: menu.x, y: menu.y });
  await pause(300);
  steps.submenuStays = await exists('.context-menu .submenu-anchor');
  await key('Escape');
  win.setContentSize(width, height);
}

// Not awaited at the top of this module: the program is ready only once the module has finished.
void app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  contents = win.webContents;
  contents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(String(event.message).slice(0, 300));
  });
  let error;
  try {
    await run();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  console.log(JSON.stringify({ steps, detail, console: errors, ...(error ? { error } : {}) }));
  app.exit(0);
});
