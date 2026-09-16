// Every policy is a function: (state) => nodeId | null.
// state = { discoveredNodes, expandableNodes, credited, remainingBudget }

import { TOP_LEVEL } from './world.js';
import { topBranchOf } from './explorer.js';

// Deep: always continue into the first child it discovers, recursively.
// Never backtracks, never compares sibling scores after its first move.
// This is the deliberately mediocre baseline.
export function deepPolicy() {
  let current = null;
  return (state) => {
    if (current === null) {
      current = TOP_LEVEL.find((id) => state.expandableNodes.includes(id));
      return current;
    }
    const node = state.discoveredNodes[current];
    const children = node.children || [];
    const nextChild = children.find((id) => state.expandableNodes.includes(id));
    if (nextChild) {
      current = nextChild;
      return current;
    }
    return null; // dead end, no backtrack -- this is the deliberate flaw
  };
}

// Wide: round-robins across the different top-level branches instead of
// committing to one.
export function widePolicy() {
  const frontier = Object.fromEntries(TOP_LEVEL.map((b) => [b, []]));
  const picks = Object.fromEntries(TOP_LEVEL.map((b) => [b, 0]));
  const lastPicked = Object.fromEntries(TOP_LEVEL.map((b) => [b, null]));
  let initialized = false;

  return (state) => {
    if (!initialized) {
      // Seed each branch's frontier from whatever is already known, whether
      // this is a fresh start (round 1, or any dream) or a continuation
      // (round 2 onward).
      for (const id of Object.keys(state.discoveredNodes)) {
        if (!state.expandableNodes.includes(id)) continue;
        const branch = topBranchOf(state.discoveredNodes, id);
        if (frontier[branch] && !frontier[branch].includes(id)) frontier[branch].push(id);
      }
      initialized = true;
    }
    for (const b of TOP_LEVEL) {
      if (lastPicked[b]) {
        const node = state.discoveredNodes[lastPicked[b]];
        if (node && node.children) frontier[b].push(...node.children);
        lastPicked[b] = null;
      }
    }
    const candidates = TOP_LEVEL.filter((b) => frontier[b].some((id) => state.expandableNodes.includes(id)));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => picks[a] - picks[b]);
    const branch = candidates[0];
    const nodeId = frontier[branch].find((id) => state.expandableNodes.includes(id));
    frontier[branch] = frontier[branch].filter((id) => id !== nodeId);
    picks[branch]++;
    lastPicked[branch] = nodeId;
    return nodeId;
  };
}

// Explore -> Exploit: spend the first half of the budget like Wide, then
// spend the rest going greedy on whichever already-known score is highest.
export function exploreExploitPolicy(budget) {
  const exploreSteps = Math.ceil(budget / 2);
  let step = 0;
  const wide = widePolicy();
  return (state) => {
    step++;
    if (step <= exploreSteps) return wide(state);
    const candidates = state.expandableNodes.slice();
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => state.discoveredNodes[b].score - state.discoveredNodes[a].score);
    return candidates[0];
  };
}

export const POLICIES = [
  {
    id: 'deep',
    name: 'Deep',
    description: 'Keep improving the best branch.',
    factory: () => deepPolicy(),
  },
  {
    id: 'wide',
    name: 'Wide',
    description: 'Explore many different branches.',
    factory: () => widePolicy(),
  },
  {
    id: 'exploreExploit',
    name: 'Explore → Exploit',
    description: 'Explore broadly first. Then spend the remaining budget on the best branch.',
    factory: (budget) => exploreExploitPolicy(budget),
  },
];
