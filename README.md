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
- Live demo: https://ekimroyrp.github.io/251108_ParametricTower/
- Build locally with relative asset paths: `npm run build -- --base=./`
- To publish to GitHub Pages, copy the contents of `dist/` into a clean `gh-pages` branch (or worktree) and push:  
  `git worktree add ../251108_ParametricTower-gh-pages -b gh-pages` → copy `dist` → commit → `git push origin gh-pages`
