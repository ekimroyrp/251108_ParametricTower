# 251108_ParametricTower

251108_ParametricTower is a browser-based Three.js playground for designing expressive parametric high-rises. Floor slabs are stacked, twisted, tapered, and color-graded through live sliders so you can explore formal studies without leaving your browser or installing BIM plug-ins.

## Features
- Parametric generator for floor count, vertical spacing, slab thickness, and base radius
- Independent twist and scale gradients with selectable easing curves and min/max limits
- Gradient color ramp from podium to crown with live color pickers
- OrbitControls navigation with smooth damping and optional auto-spin showcase mode
- Lil-gui HUD paired with an inline instruction card for quick experimentation

## Getting Started
1. Ensure you have Node.js 18+ installed.
2. Install dependencies with `npm install`.
3. Launch the local dev server via `npm run dev` and open the printed localhost URL.

## Controls
- Left mouse drag: orbit around the tower
- Right mouse drag: pan the camera
- Scroll wheel / trackpad pinch: zoom
- Slider panels: adjust structure, twist, scale, colors, and motion parameters in real time
