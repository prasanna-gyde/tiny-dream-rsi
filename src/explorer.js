// Shared history/traversal mechanics, used by both real exploration and
// dreaming. The only thing that differs between the two is `reveal`: real
// exploration reveals from the hidden world, dreaming reveals only from the
// history already collected.

import { world, TOP_LEVEL } from './world.js';

export function freshHistory() {
  const nodes = {};
  for (const id of TOP_LEVEL) {
    nodes[id] = { score: world[id].score, expanded: false, children: null, parent: null };
  }
  return { nodes };
}

export function deepCopyHistory(history) {
  return JSON.parse(JSON.stringify(history));
}

// Walk parent pointers up to find which top-level branch a node belongs to.
export function topBranchOf(nodesMap, nodeId) {
  let id = nodeId;
  while (nodesMap[id] && nodesMap[id].parent) id = nodesMap[id].parent;
  return id;
}

export function revealFromWorld(history, nodeId) {
  const node = history.nodes[nodeId];
  node.expanded = true;
  node.children = world[nodeId].children.slice();
  const newlyRevealed = [];
  for (const childId of node.children) {
    if (!history.nodes[childId]) {
      history.nodes[childId] = { score: world[childId].score, expanded: false, children: null, parent: nodeId };
      newlyRevealed.push(childId);
    }
  }
  return newlyRevealed;
}

function expandableIds(history) {
  return Object.keys(history.nodes).filter((id) => !history.nodes[id].expanded);
}

// Generic engine: spend `budget` steps letting `policyFn` choose the next
// node, and `reveal` decide what gets learned once it's opened. A node only
// counts toward `bestScore` once a policy actually spends a step choosing
// it -- merely glimpsing it (as a child of an opened node) is not enough.
export function runBudget(policyFn, budget, reveal, startHistory, onStep) {
  const history = startHistory ? deepCopyHistory(startHistory) : freshHistory();
  const alreadyCredited = startHistory ? Object.keys(startHistory.nodes).filter((id) => startHistory.nodes[id].expanded) : [];
  const credited = [];
  for (let i = 0; i < budget; i++) {
    const expandable = expandableIds(history);
    const state = {
      discoveredNodes: history.nodes,
      expandableNodes: expandable,
      credited: credited.slice(),
      remainingBudget: budget - i,
    };
    const nodeId = policyFn(state);
    if (!nodeId || history.nodes[nodeId].expanded) break;
    const newlyRevealed = reveal(history, nodeId) || [];
    credited.push(nodeId);
    if (onStep) onStep({ nodeId, newlyRevealed, history, credited: credited.slice() });
  }
  const allCredited = Array.from(new Set([...alreadyCredited, ...credited]));
  const bestScore = allCredited.length ? Math.max(...allCredited.map((id) => history.nodes[id].score)) : null;
  return { history, credited, allCredited, bestScore };
}

// REAL WORLD exploration: reveals children straight from the hidden world.
export function explore(policyFn, budget, startHistory, onStep) {
  return runBudget(policyFn, budget, revealFromWorld, startHistory, onStep);
}
