# Solara City · Portside Run

Kio runs three jobs for fixer Mara across Portside, a sun-baked district with congested streets and a working waterfront. Watch the minimap for the next handoff and lose police by breaking their line of sight.

Run `node serve.ts` with Node 22 or newer and open <http://localhost:8080> in a desktop browser.

| Input | Action |
| --- | --- |
| WASD or arrows | Move on foot, accelerate, brake, or steer |
| E | Enter a nearby car or get out |
| F | Get out of a car |
| Space | Handbrake |
| Mouse, click or J | Aim and fire on foot |
| R | Reload |
| P or Esc | Pause or resume |
| Enter | Confirm, advance dialogue, or accept the next job |

`game/index.html` boots the canvas. `game/src/` holds the city, simulation, missions, audio, renderer, and deterministic capture scenes. `shots.json` lists the four capture URLs. `serve.ts` previews the game and `main.ts` packages the hand-in.
