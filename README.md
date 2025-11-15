# 251108_ParametricTower

251108_ParametricTower is a browser-based Three.js playground for designing expressive parametric high-rises. Floor slabs are stacked, twisted, tapered, and color-graded through live sliders so you can explore formal studies without leaving your browser or installing BIM plug-ins.

## Features
- Parametric floor-stack generator with controls for count, spacing, slab thickness, base radius, and polygonal segments (triangle → 30-gon)
- Twist and scale gradients with easing curves plus a draggable Bezier graph overlay for custom scale interpolation
- Saved state system with dropdown recall, OBJ mesh export (with per-vertex colors), PNG scene capture, and auto-spin showcase toggle
- Gradient color pickers and five lighting presets (Day, Studio, Sunset, Neon, High Contrast) for fast mood studies
- Infinite Houdini-style fading grid, orbit/pan/zoom navigation, and draggable GUI overlay for the Bezier editor
- Built-in GitHub Pages deployment bundle for sharing the experience as a static site

## Getting Started
1. Ensure you have Node.js 18+ installed.
2. Install dependencies with `npm install`.
3. Launch the local dev server via `npm run dev` (or double-click/execute `dev.bat` to automatically bypass PowerShell execution policy) and open the printed localhost URL.

## Controls
- Left mouse drag: orbit around the tower
- Right mouse drag: pan the camera
- Scroll wheel / trackpad pinch: zoom
- Slider panels: adjust structure, twist, scale, colors, and motion parameters in real time
- Enable “Use Graph” in the Scale Gradient panel to open the draggable Bezier editor; drag the two handles to reshape the scale curve

## Deployment
- **Local build preview:** `npm install` then `npm run dev` for hot-reload development, or `npm run build -- --base=./ && npm run preview` to serve the production bundle locally with relative asset paths.
- **Publish to GitHub Pages:** After `npm run build -- --base=./`, switch to the `gh-pages` branch (or its worktree), replace its contents with the `dist/` output, commit, and `git push origin gh-pages`. Jump back to `main` once published to keep the source workspace clean.
- **Live demo:** https://ekimroyrp.github.io/251108_ParametricTower/
