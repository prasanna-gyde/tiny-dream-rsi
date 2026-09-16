import { world, TOP_LEVEL } from '../src/world.js';
import { explore, freshHistory } from '../src/explorer.js';
import { dream } from '../src/dream.js';
import { POLICIES, deepPolicy } from '../src/policies.js';

const ROOT_ID = 'ROOT';
const BUDGET = 5;
const STEP_DELAY_MS = 550;
const DREAM_STEP_DELAY_MS = 350;
const PAUSE_MS = 900;

// ---------- layout (computed once from the fixed hidden world) ----------
function layoutTree() {
  const positions = {};
  let nextLeafX = 0;
  function walk(id, depth) {
    const children = id === ROOT_ID ? TOP_LEVEL : (world[id]?.children || []);
    if (children.length === 0) {
      const x = nextLeafX++;
      positions[id] = { x, depth };
      return x;
    }
    const xs = children.map((c) => walk(c, depth + 1));
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    positions[id] = { x, depth };
    return x;
  }
  walk(ROOT_ID, 0);
  return positions;
}
const POS = layoutTree();
const ALL_IDS = Object.keys(world);
const SPACING_X = 68;
const SPACING_Y = 78;
const OFFSET_X = 40;
const OFFSET_Y = 30;

function coord(id) {
  const p = POS[id];
  return { cx: OFFSET_X + p.x * SPACING_X, cy: OFFSET_Y + p.depth * SPACING_Y };
}

// ---------- app state ----------
const app = {
  phase: 'r1-intro',
  baseHistory: freshHistory(),
  round1: null,
  round2: null,
  dreamResults: [],
  chosenPolicy: null,
  overlay: null, // { mode: 'real'|'dream', history, creditedSet, currentNodeId }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pushLog(label, text) {
  const el = document.getElementById('event-log');
  const line = document.createElement('div');
  line.className = `log-line log-${label.toLowerCase()}`;
  line.innerHTML = `<span class="log-label">${label}</span>${text}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ---------- rendering ----------
function renderTree() {
  const svg = document.getElementById('tree-svg');
  const parts = [];

  for (const id of [ROOT_ID, ...ALL_IDS]) {
    const children = id === ROOT_ID ? TOP_LEVEL : world[id].children;
    const a = coord(id);
    for (const childId of children) {
      const b = coord(childId);
      const cls = edgeClass(childId);
      parts.push(`<line x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}" class="${cls}" />`);
    }
  }

  for (const id of [ROOT_ID, ...ALL_IDS]) {
    const { cx, cy } = coord(id);
    if (id === ROOT_ID) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="9" class="node-root" />`);
      parts.push(`<text x="${cx}" y="${cy - 14}" class="label">START</text>`);
      continue;
    }
    const info = nodeInfo(id);
    let cls = info.known ? 'node-discovered' : 'node-unknown';
    if (info.isCurrent) cls += ' node-current';
    parts.push(`<circle cx="${cx}" cy="${cy}" r="13" class="${cls}" />`);
    if (info.known) {
      parts.push(`<text x="${cx}" y="${cy + 4}" class="score">${info.score}</text>`);
    } else {
      parts.push(`<text x="${cx}" y="${cy + 4}" class="unknown-mark">?</text>`);
    }
    parts.push(`<text x="${cx}" y="${cy + 24}" class="label">${id}</text>`);
  }

  svg.innerHTML = parts.join('');
}

function nodeInfo(id) {
  const overlayNode = app.overlay?.history?.nodes?.[id];
  const baseNode = app.baseHistory.nodes[id];
  const source = overlayNode || baseNode;
  const isCurrent = app.overlay?.currentNodeId === id;
  return { known: !!source, score: source?.score, isCurrent };
}

function edgeClass(childId) {
  const known = !!(app.baseHistory.nodes[childId] || app.overlay?.history?.nodes?.[childId]);
  if (app.overlay?.creditedSet?.has(childId)) {
    return app.overlay.mode === 'real' ? 'edge-real' : 'edge-dream';
  }
  return known ? 'edge-known' : 'edge-unknown';
}

function renderRoundInfo(html) {
  document.getElementById('round-info').innerHTML = html;
}
function renderControls(html) {
  document.getElementById('controls').innerHTML = html;
}
function renderDreamTable(html) {
  document.getElementById('dream-table').innerHTML = html;
}

function renderAll() {
  renderTree();
}

// ---------- Round 1 ----------
function showRound1Intro() {
  app.phase = 'r1-intro';
  renderRoundInfo(`
    <h3>ROUND 1</h3>
    <p>Budget: <strong>${BUDGET}</strong> searches</p>
    <p>Policy: <span class="pill pill-real">Deep</span> &mdash; keep improving the best branch.</p>
    <p>This policy is deliberately naive: it always continues into the first branch it sees, and never looks back.</p>
  `);
  renderControls(`<button id="run-real">RUN REAL WORLD</button>`);
  document.getElementById('run-real').addEventListener('click', runRound1);
  renderDreamTable('');
  renderAll();
}

async function runRound1() {
  app.phase = 'r1-running';
  renderControls(`<button disabled>Exploring...</button>`);
  pushLog('SYSTEM', 'Round 1 begins. Policy: Deep.');

  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(), currentNodeId: null };

  const result = explore(deepPolicy(), BUDGET, null, ({ nodeId, newlyRevealed }) => {
    app.overlay.currentNodeId = nodeId;
    app.overlay.creditedSet.add(nodeId);
  });

  // Replay the steps with animation delays, driven by the credited order.
  await animateReal(result, app.baseHistory);

  app.baseHistory = result.history;
  app.round1 = result;
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(result.credited), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <h3>ROUND 1 &mdash; done</h3>
    <p>Best score found: <strong>${result.bestScore}</strong></p>
    <p>Searches used: <strong>${result.credited.length}</strong></p>
    <p class="quote">We have now created HISTORY.</p>
  `);
  renderControls(`<button id="start-dream" class="dream-btn">START DREAMING</button>`);
  document.getElementById('start-dream').addEventListener('click', showDreamIntro);
}

// Re-run the credited path node by node purely for the animation/log, against
// a scratch copy, so the tree fills in with a visible delay.
async function animateReal(result, historyBefore) {
  let shown = JSON.parse(JSON.stringify(historyBefore));
  const creditedSet = new Set();
  for (const nodeId of result.credited) {
    await sleep(STEP_DELAY_MS);
    const finalNode = result.history.nodes[nodeId];
    shown.nodes[nodeId] = { ...finalNode };
    for (const childId of finalNode.children || []) {
      if (!shown.nodes[childId]) shown.nodes[childId] = { ...result.history.nodes[childId] };
    }
    creditedSet.add(nodeId);
    app.overlay = { mode: 'real', history: shown, creditedSet, currentNodeId: nodeId };
    renderAll();
    pushLog('REALITY', `Opened ${nodeId} (score ${finalNode.score})`);
    for (const childId of finalNode.children || []) {
      pushLog('REALITY', `Discovered ${childId} &rarr; score ${result.history.nodes[childId].score}`);
    }
  }
}

// ---------- Dream ----------
function showDreamIntro() {
  app.phase = 'dream-intro';
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(app.round1.credited), currentNodeId: null };
  renderAll();
  renderRoundInfo(`
    <h3>DREAM</h3>
    <p>We will test other search strategies using the history we already collected.</p>
    <p><strong>No new solutions will be generated.</strong></p>
  `);
  renderControls(`<button id="start-dreaming" class="dream-btn">START DREAMING</button>`);
  document.getElementById('start-dreaming').addEventListener('click', runDreamSequence);
}

async function runDreamSequence() {
  app.phase = 'dream-running';
  renderControls(`<button disabled class="dream-btn">Dreaming...</button>`);
  app.dreamResults = [];
  renderDreamTable(dreamTableHTML());

  for (const policy of POLICIES) {
    pushLog('DREAM', `Testing "${policy.name}"`);
    await sleep(PAUSE_MS / 2);

    const creditedSet = new Set();
    let shown = { nodes: {} };
    for (const id of TOP_LEVEL) shown.nodes[id] = { ...app.baseHistory.nodes[id] };

    const result = dream(app.baseHistory, policy.factory(BUDGET), BUDGET, ({ nodeId }) => {
      // consumed via replay below for animation timing
    });

    for (const nodeId of result.credited) {
      await sleep(DREAM_STEP_DELAY_MS);
      const finalNode = result.history.nodes[nodeId];
      shown.nodes[nodeId] = { ...finalNode };
      for (const childId of finalNode.children || []) {
        if (!shown.nodes[childId]) shown.nodes[childId] = { ...result.history.nodes[childId] };
      }
      creditedSet.add(nodeId);
      app.overlay = { mode: 'dream', history: shown, creditedSet, currentNodeId: nodeId };
      renderAll();
    }

    pushLog('DREAM', `Best score: ${result.bestScore}`);
    app.dreamResults.push({ policy, bestScore: result.bestScore, credited: result.credited });
    renderDreamTable(dreamTableHTML());
    await sleep(PAUSE_MS);
  }

  finishDreaming();
}

function dreamTableHTML() {
  if (app.dreamResults.length === 0) {
    return `<h3>DREAM RESULTS</h3><p>Waiting for replays...</p>`;
  }
  const maxScore = Math.max(...app.dreamResults.map((r) => r.bestScore));
  const rows = app.dreamResults.map((r) => {
    const isWinner = r.bestScore === maxScore;
    return `<tr class="${isWinner ? 'winner' : ''}"><td>${r.policy.name}</td><td>${r.credited.length}</td><td>${r.bestScore}</td></tr>`;
  }).join('');
  return `
    <h3>DREAM RESULTS</h3>
    <table>
      <thead><tr><th>Policy</th><th>Searches</th><th>Best discovered</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function finishDreaming() {
  app.phase = 'dream-done';
  const maxScore = Math.max(...app.dreamResults.map((r) => r.bestScore));
  const winners = app.dreamResults.filter((r) => r.bestScore === maxScore);
  const winner = winners[winners.length - 1]; // prefer the more general policy on a tie
  app.chosenPolicy = winner.policy;

  pushLog('SYSTEM', `New exploration policy: ${winner.policy.name}`);

  const neverOpened = ALL_IDS.filter((id) => !app.baseHistory.nodes[id]);
  const neverOpenedTop = TOP_LEVEL.filter((id) => app.baseHistory.nodes[id] && !app.baseHistory.nodes[id].expanded);

  app.overlay = { mode: 'dream', history: app.baseHistory, creditedSet: new Set(), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <h3>DREAM &mdash; done</h3>
    <p><strong>${winner.policy.name}</strong> found the best result: <strong>${maxScore}</strong></p>
    <p class="quote">Nothing new was generated during this experiment.</p>
    <p class="quote">We changed only the strategy used to navigate existing history.</p>
    ${neverOpenedTop.length ? `<p>Limitation: branch${neverOpenedTop.length > 1 ? 'es' : ''} <strong>${neverOpenedTop.join(', ')}</strong> ${neverOpenedTop.length > 1 ? 'were' : 'was'} never opened. Dreaming can only learn from what we've already explored &mdash; it cannot know what's hiding under ${neverOpenedTop.length > 1 ? 'them' : 'it'}.</p>` : ''}
  `);
  renderControls(`<button id="explore-again">EXPLORE AGAIN</button>`);
  document.getElementById('explore-again').addEventListener('click', showRound2Intro);
}

// ---------- Round 2 ----------
function showRound2Intro() {
  app.phase = 'r2-intro';
  renderRoundInfo(`
    <h3>ROUND 2</h3>
    <p>Previous policy: <span class="pill pill-real">Deep</span></p>
    <p>Dream selected: <span class="pill pill-dream">${app.chosenPolicy.name}</span></p>
    <p>Budget: <strong>${BUDGET}</strong> more searches, using the new policy.</p>
  `);
  renderControls(`<button id="explore-again-2">EXPLORE AGAIN</button>`);
  document.getElementById('explore-again-2').addEventListener('click', runRound2);
}

async function runRound2() {
  app.phase = 'r2-running';
  renderControls(`<button disabled>Exploring...</button>`);
  pushLog('SYSTEM', `Round 2 begins. Policy: ${app.chosenPolicy.name}.`);

  const historyBefore = app.baseHistory;
  const result = explore(app.chosenPolicy.factory(BUDGET), BUDGET, historyBefore);

  await animateReal(result, historyBefore);

  app.baseHistory = result.history;
  app.round2 = result;
  const cumulativeBest = Math.max(app.round1.bestScore, result.bestScore);
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(result.credited), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <h3>ROUND 2 &mdash; done</h3>
    <p>Best score found this round: <strong>${result.bestScore}</strong></p>
    <p>Best score ever found: <strong>${cumulativeBest}</strong></p>
    <p>Because it explored differently, it discovered new nodes.</p>
  `);
  renderControls(`<button id="see-final">SEE THE FULL LOOP</button>`);
  document.getElementById('see-final').addEventListener('click', showFinal);
}

// ---------- Final ----------
function showFinal() {
  app.phase = 'final';
  const stillHidden = ALL_IDS.filter((id) => !app.baseHistory.nodes[id] || !app.baseHistory.nodes[id].expanded);
  const stillHiddenTop = TOP_LEVEL.filter((id) => app.baseHistory.nodes[id] && !app.baseHistory.nodes[id].expanded);

  renderRoundInfo(`
    <h3>That's Dream-RSI.</h3>
    <div class="final-loop">REALITY
  ↓ explore
HISTORY
  ↓ dream
BETTER POLICY
  ↓
REALITY
  ↓ more history
  ↓ dream again
  ↓
...</div>
    <p class="quote">The system improves how it searches without changing the underlying model.</p>
    ${stillHiddenTop.length ? `<p>And the limitation is still there: branch <strong>${stillHiddenTop.join(', ')}</strong> was never opened, across either round. Whatever is hiding underneath it stays invisible until a real round finally goes and looks.</p>` : ''}
  `);
  renderControls(`<button id="restart">RESTART</button>`);
  document.getElementById('restart').addEventListener('click', () => window.location.reload());
}

// ---------- boot ----------
showRound1Intro();
