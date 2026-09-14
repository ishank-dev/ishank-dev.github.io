# ishank-dev.github.io

Personal portfolio — a single-page site with a live WebGL point-cloud background,
built from scratch with no framework, no build step and no third-party runtime
requests.

**Live:** https://ishank-dev.github.io/

## Structure

```
index.html              the whole page — every icon is inlined as SVG
assets/css/style.css    design system (tokens → base → scene → chrome → sections)
assets/js/scene.js      the point cloud: raw WebGL, ~12KB, no libraries
assets/js/main.js       nav, scroll-spy, command palette, tilt, filter, feed, form
assets/fonts/           Sora, Inter, Instrument Serif, JetBrains Mono (woff2, latin)
assets/images/          avatar, logos, project stills (WebP)
```

## The background

`scene.js` renders 3–14k particles (scaled to the device) as `gl.POINTS` through a
single shader pair. Each section declares a `data-shape` index; `main.js` hands it to
`Scene.setShape()` and the cloud morphs between six forms — sphere, double helix,
lattice, torus knot, spiral disc, ring — by interpolating two position buffers in the
vertex shader with a per-particle stagger. The pointer pushes particles away; scroll
pulls the camera back.

It degrades honestly:

| condition | behaviour |
|---|---|
| no WebGL | canvas stays empty, a CSS gradient shows instead |
| `prefers-reduced-motion` | one static frame, no animation loop |
| tab hidden / canvas off-screen | loop paused via `IntersectionObserver` |
| light theme | particles switch to ink colours and source-over blending |

## Interaction

- **⌘K / Ctrl+K** (or `/`) opens a command palette — sections, projects, links and
  actions, with fuzzy subsequence matching and full keyboard control.
- Scroll-spy nav, reading-progress bar, header that hides on scroll-down.
- Pointer-tilt on project cards and the avatar (disabled on touch and under
  reduced motion).
- Project filter, copy-to-clipboard with toast, client-side form validation that
  hands off to the mail client.
- Medium posts are fetched lazily from the RSS feed when the section nears the
  viewport, with a link-out fallback if the feed is unreachable.

## Editing

Everything is static — open the files and reload. Two notes:

- **Icons are inlined.** Ionicons and the brand logos live directly in `index.html`
  as `<svg>`. To add one, copy the markup of an existing icon and swap the paths
  (sources: `ionicons`, `@iconify-json/logos`, `@iconify-json/simple-icons`).
- **Fonts are self-hosted** from `@fontsource` woff2 subsets. Adding a weight means
  dropping the file in `assets/fonts/` and adding an `@font-face` block at the top
  of `style.css`.

## Contact

[ishankdev@gmail.com](mailto:ishankdev@gmail.com) ·
[GitHub](https://github.com/ishank-dev) ·
[LinkedIn](https://www.linkedin.com/in/ishank-sharma-438a32144/)
