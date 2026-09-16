// Dreaming replays a policy against history already collected in reality.
// Zero new real searches happen here. It can only reorganize attention over
// what's already known -- it can never call into the real world.

import { runBudget } from './explorer.js';

function revealFromOracle(oracleHistory) {
  return (history, nodeId) => {
    const node = history.nodes[nodeId];
    node.expanded = true;
    const oracleNode = oracleHistory.nodes[nodeId];
    const newlyRevealed = [];
    if (oracleNode && oracleNode.expanded && oracleNode.children) {
      node.children = oracleNode.children.slice();
      for (const childId of node.children) {
        if (!history.nodes[childId]) {
          history.nodes[childId] = {
            score: oracleHistory.nodes[childId].score,
            expanded: false,
            children: null,
            parent: nodeId,
          };
          newlyRevealed.push(childId);
        }
      }
    } else {
      node.children = []; // dead end: never really opened, dreaming can't invent it
    }
    return newlyRevealed;
  };
}

// Always starts fresh (as if this policy had been in control from the very
// start of the round), but every "reveal" is a lookup into `history`, never
// a real search.
export function dream(history, policyFn, budget, onStep) {
  return runBudget(policyFn, budget, revealFromOracle(history), null, onStep);
}
