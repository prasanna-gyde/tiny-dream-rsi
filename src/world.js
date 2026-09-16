// The hidden reality. A node's own score becomes known the moment its parent
// is opened. A node's children become known only once the node itself is
// opened. Nothing here is ever visible to a policy all at once.

export const TOP_LEVEL = ['A', 'B', 'C', 'D'];

export const world = {
  A: { score: 40, children: ['A1', 'A2', 'A3'] },
  A1: { score: 44, children: ['A1a'] },
  A2: { score: 38, children: [] },
  A3: { score: 41, children: [] },
  A1a: { score: 50, children: ['A1a1'] },
  A1a1: { score: 53, children: ['A1a1a'] },
  A1a1a: { score: 55, children: [] },

  B: { score: 63, children: ['B1', 'B2'] },
  B1: { score: 58, children: [] },
  B2: { score: 80, children: [] },

  C: { score: 52, children: ['C1'] },
  C1: { score: 60, children: [] },

  D: { score: 35, children: ['D1', 'D2'] },
  D1: { score: 97, children: [] }, // never discovered in this demo
  D2: { score: 39, children: [] },
};

export function ideaFor(id) {
  return `Solution ${id}`;
}
