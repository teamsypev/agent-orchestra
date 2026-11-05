# Agent Coworking

**A pixel coworking space where a team of Claude agents walks around and works — for real.**

Give the team a task. Dilnoza, the planner, reads it at the inbox and sketches a plan on the whiteboard. Timur, Kamila and Aziz take a part each, run to the web archive whenever they search the internet, and type their findings at their desks. Nodira, the critic, reviews the stack of papers and sends someone back if something is missing. Bobur writes the answer, prints it and pins it on the board.

Every walk, search and speech bubble is driven by a real multi-agent run on **Claude Haiku 5.5**, streamed live in your browser.

> По-русски: пиксельный коворкинг, где команда агентов Claude по-настоящему работает над вашей задачей. Планировщица рисует план, исследователи бегают к «архиву интернета» за поиском и печатают находки, критик проверяет, писатель печатает ответ и вешает его на доску.

## Try it

- **Watch the demo** — no key needed. The demo is a simulated recording that shows the office.
- **Run it for real** — click *API key*, paste a Claude API key, type a task and press *Hand over the task*. A typical task costs about 4–12 cents (mostly web searches).

Controls: drag to look around, scroll to zoom, <kbd>Q</kbd>/<kbd>E</kbd> to turn the room, point at anything to see what it is.

## How it works

```
your task ──► Planner ──► 2–3 Researchers in parallel (web search) ──► Critic ──┬──► Writer ──► answer
                                    ▲                                          │
                                    └──────── one follow-up round if needed ◄──┘
```

- `src/engine/` — the agents. Direct, streamed calls to the Claude Messages API from the browser (`anthropic-dangerous-direct-browser-access`). The planner and critic return structured output through forced tool calls; researchers use the server-side web search tool. Every step is an event on a small bus, and a run can be recorded and replayed.
- `src/world/director.js` — turns those events into what the people do: who walks where, what they say, what appears on the whiteboard, screens and boards.
- `src/world/` — the room. An isometric renderer that rasterises everything pixel by pixel into a small canvas (no sprites, no image files), A* pathfinding on the room grid, and the characters.

No build step: plain ES modules.

```bash
git clone https://github.com/teamsypev/agent-orchestra
cd agent-orchestra
python3 -m http.server 8080   # then open http://localhost:8080
```

## Your key stays yours

The key is stored only in your browser (session storage, or local storage if you tick *Remember*) and is only ever sent to `api.anthropic.com`. For a public demo, use a separate key with a spend limit.

## Credits

- Code: MIT — see [LICENSE](LICENSE).
- Font: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (SIL Open Font License), via Google Fonts.
- The characters and the room are original pixel art drawn in code.
