# datavizard
This is a personal portfolio platform to showcase some cool data vizardry! 

Live site: https://commnag.github.io/datavizard/

## How it's built

Static site: plain HTML, CSS and a little JS. No build step.

- `index.html`: all page content
- `assets/css/style.css`: design tokens (pastel palette, light and dark) and styles
- `assets/js/main.js`: theme toggle, hero chart deck, scroll effects, analytics overlay
- `assets/js/magic.js`: the footprint trail that follows the cursor
- `dashboards/`: one folder per dashboard, each self-contained

## Preview locally

    python3 -m http.server 8000

Open http://localhost:8000 (the dashboards load JSON, so `file://` won't work).

## Add a dashboard

1. Copy it to `dashboards/<name>/`.
2. Link it from the AI Playground section of `index.html`.

## Deploy

GitHub Pages serves `main` from the repo root (Settings → Pages). All paths in the site are relative, so it works under the `/datavizard/` address.
