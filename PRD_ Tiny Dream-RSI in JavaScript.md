# Tiny Dream-RSI

**Working name:** `tiny-dream-rsi`  
**Language:** JavaScript  
**Purpose:** Explain the core idea behind Dream-RSI through the smallest possible executable implementation.

## 1. The idea we want people to understand

Dream-RSI can be reduced to one loop:

```text
Explore reality
      ↓
Save everything you discovered
      ↓
Replay different search strategies on that history
      ↓
Find a better search strategy
      ↓
Use that strategy to explore reality again
      ↓
Repeat
```

The model itself does not need to improve.

The **harness controlling how the model explores** improves.

That is the entire point of this repository.

---

# 2. Success criterion

Someone should be able to:

```bash
git clone ...
npm install
npm start
```

and understand the core idea within 5 minutes.

They should leave saying:

> "Ah. They turn previous exploration history into a simulator for improving the exploration strategy."

If the user needs to understand reinforcement learning, GPUs, model training, inference infrastructure, or the Dream-RSI paper's mathematics, we have failed.

---

# 3. What we are building

A tiny visual application containing:

1. A search problem
2. A discovery tree
3. Three simple search policies
4. A REAL WORLD mode
5. A DREAM mode
6. A second exploration round using the policy selected during dreaming

Everything runs locally in JavaScript.

---

# 4. The toy problem

We deliberately use an artificial search problem.

There is a hidden tree containing possible solutions.

Example:

```text
                         START
                    /      |      \
                  A        B        C
                 40       63       52
                / \      /  \      / \
              55  48    71  66    57  60
                  /     / \
                 62    74  91
```

Each node represents:

```javascript
{
  id: "B2a",
  parent: "B2",
  score: 91,
  idea: "Solution B2a"
}
```

The search algorithm cannot see the entire tree.

It only sees nodes it has already discovered.

This gives us a fake but deterministic "real world."

---

# 5. Why use a fake world first?

Because the concept is about **search**, not about LLM quality.

Using a real LLM immediately introduces:

- API keys
- latency
- cost
- prompts
- provider differences
- nondeterministic outputs
- code execution
- sandboxing

All of that distracts from the idea.

The toy world lets someone understand Dream-RSI before introducing LLMs.

A real LLM can become Version 2.

---

# 6. Core interaction

The app starts with:

```text
ROUND 1

Budget: 8 searches

[ RUN REAL WORLD ]
```

The initial exploration policy can be deliberately mediocre.

For example:

### `depthFirst`

Pick one promising branch and keep following it.

The user clicks:

**RUN REAL WORLD**

Nodes appear one by one.

```text
                         START
                           |
                           B 63
                           |
                          B1 71
                           |
                         B1a 74
```

Eventually the budget runs out.

Display:

```text
Best score found: 74
Searches used: 8
```

And importantly:

```text
We have now created HISTORY.
```

---

# 7. The key transition

Now show:

# DREAM

Explain in one sentence:

> We will test other search strategies using the history we already collected. No new solutions will be generated.

Button:

```text
[ START DREAMING ]
```

This is the most important part of the whole demo.

---

# 8. Search policies

Keep exactly three.

## Policy A: Deep

```text
Keep improving the best branch.
```

## Policy B: Wide

```text
Explore many different branches.
```

## Policy C: Explore → Exploit

```text
Explore broadly first.
Then spend the remaining budget on the best branch.
```

Nothing more complicated.

No UCB.

No Monte Carlo Tree Search.

No RL terminology.

No policy gradients.

---

# 9. Dream replay

The app now replays each policy against the history already collected.

Example:

```text
DREAM RESULTS

Policy              Searches    Best discovered

Deep                    8              74
Wide                    8              71
Explore → Exploit       8              91
```

Highlight:

```text
Explore → Exploit found the best result.
```

Then explain:

> Nothing new was generated during this experiment.

> We changed only the strategy used to navigate existing history.

This sentence is extremely important.

---

# 10. The limitation must also be visible

Suppose the historical tree looks like:

```text
       ROOT
      /    \
     A      B
    / \
   A1 A2
```

There may secretly be:

```text
       C
       |
      C1
       |
      100
```

But nobody explored C.

The dream cannot know that C1 exists.

Show this visually as:

```text
                    ???
                     |
                    ???
```

with text:

> Dreaming can only learn from the part of the world we have already explored.

This prevents people from misunderstanding the simulator.

---

# 11. Round 2

Now comes the recursive part.

Display:

```text
ROUND 2

Previous policy:
Deep

Dream selected:
Explore → Exploit
```

Button:

```text
[ EXPLORE AGAIN ]
```

This time the real-world explorer uses the improved policy.

Because it explores differently, it discovers new nodes.

Example:

```text
ROUND 1 HISTORY

       A
       |
      A1
       |
      A2


ROUND 2

       A          B          C
       |         / \
      A1       B1  B2
                   |
                  B3
                  91
```

Now the history is richer.

---

# 12. Final screen

Show the complete loop:

```text
REALITY
  ↓
explore
  ↓
HISTORY
  ↓
dream
  ↓
BETTER POLICY
  ↓
REALITY
  ↓
more history
  ↓
dream again
  ↓
...
```

Then:

# That's Dream-RSI.

And underneath:

> The system improves how it searches without changing the underlying model.

---

# 13. UI

One page.

No dashboard.

No login.

No sidebar.

No settings.

Suggested layout:

```text
┌─────────────────────────────────────────────────┐
│                  Tiny Dream-RSI                 │
│                                                 │
│  The model stays the same.                     │
│  The search strategy improves.                 │
├────────────────────────────┬────────────────────┤
│                            │                    │
│      DISCOVERY TREE        │    EXPLANATION     │
│                            │                    │
│          ROOT              │    Round 1         │
│        /  |  \             │                    │
│       A   B   C            │    Budget: 8       │
│                            │                    │
│                            │ [RUN REAL WORLD]   │
│                            │                    │
├────────────────────────────┴────────────────────┤
│                  Event Log                      │
└─────────────────────────────────────────────────┘
```

The tree is the hero.

Everything else supports the tree.

---

# 14. Visual language

Nodes should have only three states:

```text
○ Unknown
● Discovered
◎ Currently selected
```

During REAL WORLD mode:

New nodes physically appear.

During DREAM mode:

No nodes appear.

Instead, the selected policy moves through existing nodes.

That visual difference should make the concept obvious even without reading the explanation.

---

# 15. Technical architecture

Keep this extremely small.

```text
tiny-dream-rsi/
│
├── package.json
├── server.js
│
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
│
└── src/
    ├── world.js
    ├── explorer.js
    ├── policies.js
    └── dream.js
```

No database.

No React.

No TypeScript.

No build system.

No authentication.

No backend framework unless absolutely necessary.

Plain JavaScript.

---

# 16. Core objects

## World

Contains the hidden reality.

```javascript
const world = {
  root: ["A", "B", "C"],

  A: {
    score: 40,
    children: ["A1", "A2"]
  },

  B: {
    score: 63,
    children: ["B1", "B2"]
  }
};
```

The explorer cannot directly access undiscovered children except by expanding a node.

---

## History

What the agent has actually discovered.

```javascript
const history = {
  nodes: {},
  edges: []
};
```

History starts empty.

REAL WORLD exploration adds things to it.

DREAM never changes it.

That invariant is important.

---

# 17. Policy interface

Every policy implements one function:

```javascript
function chooseNext(state) {
  return nodeId;
}
```

`state` contains:

```javascript
{
  discoveredNodes,
  expandableNodes,
  remainingBudget
}
```

That's it.

---

# 18. Real-world exploration

Pseudo-code:

```javascript
function explore(policy, budget) {
  for (let i = 0; i < budget; i++) {

    const node = policy.chooseNext(history);

    const children = world.expand(node);

    history.add(children);
  }
}
```

REAL WORLD means:

```text
Policy
  ↓
choose node
  ↓
ask world what is there
  ↓
new information
  ↓
add to history
```

---

# 19. Dreaming

Dream receives:

```javascript
dream(history, policy, budget)
```

It creates a temporary view of the history.

Then it asks:

> If this policy had controlled exploration, what part of the known tree would it have reached?

Pseudo-code:

```javascript
function dream(history, policy, budget) {

  const simulation = createReplay(history);

  for (let i = 0; i < budget; i++) {
    const node = policy.chooseNext(simulation);
    simulation.reveal(node);
  }

  return simulation.bestScore();
}
```

Critically:

```javascript
dream()
```

cannot call:

```javascript
world.expand()
```

That single constraint represents the main concept.

---

# 20. Policy improvement

For V1, don't let an LLM invent policies.

Just evaluate:

```javascript
const policies = [
  deep,
  wide,
  exploreExploit
];
```

Then:

```javascript
const winner = policies
  .map(policy => dream(history, policy))
  .sort(byBestScore)[0];
```

The winner becomes the next real-world exploration policy.

This is enough to demonstrate recursive improvement.

---

# 21. Event log

At the bottom show events like:

```text
REALITY  Expanded B
REALITY  Discovered B1 → score 71
REALITY  Discovered B2 → score 66

DREAM    Testing "Deep"
DREAM    Best score: 74

DREAM    Testing "Wide"
DREAM    Best score: 71

DREAM    Testing "Explore → Exploit"
DREAM    Best score: 91

SYSTEM   New exploration policy: Explore → Exploit
```

Use different labels for REALITY and DREAM.

This reinforces the conceptual distinction.

---

# 22. README

The README should be unusually short.

Start with:

# Tiny Dream-RSI

> The model doesn't improve.  
> The harness learns how to use the model better.

Then:

```text
1. Explore a problem.
2. Save the search history.
3. Replay alternative search strategies against that history.
4. Pick a better strategy.
5. Explore again.
6. Repeat.
```

Then:

```bash
npm install
npm start
```

Then one screenshot/GIF.

Then:

```text
Inspired by the Dream-RSI paper.

This is an educational implementation.
It is not the authors' implementation and does not attempt
to reproduce their experimental results.
```

---

# 23. Version 1 scope

Build only:

- hidden toy world
- discovery tree
- three policies
- real exploration
- history
- dream replay
- policy comparison
- second exploration round
- simple visualisation
- event log

Target:

**~500 lines of JavaScript.**

If it crosses roughly 1,000 lines, we should question what we are adding.

---

# 24. Explicitly out of scope

Do not build:

- real LLM integration
- OpenAI integration
- Gemini integration
- Claude integration
- GPU benchmarking
- code generation
- code execution
- databases
- authentication
- multi-agent systems
- embeddings
- vector databases
- reinforcement learning
- policy training
- complicated tree-search algorithms
- configurable workflows

Those can come later.

---

# 25. Version 2

Only after V1 clearly works:

Replace:

```text
Toy World
```

with:

```text
LLM + evaluator
```

For example:

```text
Problem:
Write the fastest JavaScript function
for solving X.
```

Then:

```text
LLM generates solution
        ↓
evaluator scores solution
        ↓
solution becomes tree node
        ↓
history grows
```

Everything else remains identical.

That demonstrates something powerful:

```text
V1

policy → toy world


V2

policy → LLM → tools → evaluator
```

The Dream-RSI architecture hasn't fundamentally changed.

Only the "world" changed.

---

# 26. Version 3

Then we can allow the LLM to write:

```javascript
function chooseNext(state) {
   ...
}
```

Now the system can modify its own harness policy.

The loop becomes:

```text
LLM writes search policy
          ↓
policy controls LLM exploration
          ↓
exploration generates history
          ↓
history becomes simulator
          ↓
policies evaluated cheaply
          ↓
LLM writes better policy
          ↓
repeat
```

That is where the demo starts moving from:

**"Understand Dream-RSI"**

toward:

**"Actually experiment with recursive harness improvement."**

---

# 27. Product principle

Whenever we have to choose between:

```text
technically impressive
```

and:

```text
conceptually obvious
```

choose **conceptually obvious**.

The repository exists to make one idea click:

> **Your past search can become a simulator for improving your future search.**