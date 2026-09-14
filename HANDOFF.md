# Portfolio rebuild — handoff to a local Claude Code session

Written by the cloud session that did the rebuild, for whoever picks it up on
Ishank's machine. Paste the "Prompt to start with" section into Claude Code
after opening the repo.

---

## Why this file exists

The rebuild happened in a cloud container with no access to the local
filesystem. The remaining task needs a file that lives on the Mac:

    ~/Documents/ChatGPT/Portfolio/portfolio/compare.html

That file is a portfolio version built with ChatGPT that has newer, more
current content than what is on the live site. The design work is done; what
is left is reconciling the content.

---

## Getting the work onto the machine

The zip delivered in the chat (`ishank-portfolio-rebuild.zip`) contains
`ishank-portfolio-v2.bundle` — a git bundle with the new commits, applied on
top of `master`.

    cd ~/path/to/ishank-dev.github.io        # the real clone, on master
    git fetch /path/to/ishank-portfolio-v2.bundle redesign:redesign
    git checkout redesign

Then open that directory in Claude Code. Both the repo and the ChatGPT file
are readable from there, which is the whole point of moving.

Note: the bundle predates one small commit made after it was built (removing
the dead `assets/js/script.js`). If the bundle's tip is
"Rebuild: single-page site with a WebGL point-cloud background", just
`git rm assets/js/script.js` — nothing references it.

---

## State of the branch

Three commits on `redesign`:

1. `Redesign: new visual system, self-hosted icons, lighter assets`
   The first pass — kept the vcard template, restyled it, fixed real bugs
   (broken `<meta viewport>`, unclosed Awards `<ol>`), inlined all icons,
   converted images to WebP (11 MB -> 0.6 MB).
2. `Rebuild: single-page site with a WebGL point-cloud background`
   The current design. Template discarded entirely.
3. `Remove assets/js/script.js`

Files that matter:

    index.html              ~1,050 lines. One page, six sections. Every icon
                            is inlined SVG — there is no icon library at runtime.
    assets/css/style.css    ~1,620 lines. Tokens -> base -> scene -> chrome ->
                            sections -> components -> responsive. Dark and light
                            are the same token set with different values.
    assets/js/scene.js      ~515 lines. The WebGL point cloud. Raw GL, no deps.
    assets/js/main.js       ~665 lines. Theme, scroll-spy, command palette,
                            pointer tilt, project filter, Medium feed, form.
    assets/fonts/           9 woff2 faces, self-hosted.

---

## Constraints worth preserving

These were deliberate. Breaking them silently would be a regression.

- **Zero third-party runtime requests.** No font CDN, no icon CDN, no
  libraries. The only outbound call is the Medium RSS fetch via rss2json,
  and it is lazy and has a fallback. Do not reintroduce a CDN `<script>`
  or `<link>` for convenience.
- **No build step.** Plain files served by GitHub Pages. No bundler, no
  package.json, no framework.
- **The scene degrades.** No WebGL -> CSS gradient. `prefers-reduced-motion`
  -> one static frame, no rAF loop. Hidden tab or off-screen canvas -> loop
  paused. Light theme -> ink palette with source-over instead of additive
  glow. Any change to `scene.js` should keep all four paths working.
- **Accessibility was measured, not assumed.** Text contrast is 5.6:1 or
  better, tab order starts at the skip link, the palette traps focus and
  returns it on close, form errors are inline and announced.
- **Icons are inlined**, so adding one means copying an existing `<svg>` and
  swapping the path data. Sources: `ionicons`, `@iconify-json/logos`,
  `@iconify-json/simple-icons` (all on npm).

---

## The open task

Read `~/Documents/ChatGPT/Portfolio/portfolio/compare.html` and fold its
newer content into this design. The known gap: the live site still presents
Ishank as an MS CS student at CSULB in Long Beach with CommerceIQ as the most
recent role. That is out of date — he is now a Forward Deployed Engineer at a
stealth AI startup in Los Angeles, working on agentic systems and AWS Bedrock,
and based in the LA West Hills area.

That alone changes:

    index.html  hero eyebrow (location line)
                hero subheading (what he works on)
                About copy, all three paragraphs
                the top of the experience timeline (a new current role)
                the "Open to SDE roles" tag on the avatar card
                the contact section's opening line
                <meta name="description">, og:description, and the JSON-LD
                  jobTitle / address block in <head>

Anything else in `compare.html` — new projects, updated metrics, talks,
writing — should be judged on merit and merged into the matching section.
Keep this site's voice: concrete, numbers attached, no filler.

Do not copy `compare.html`'s design. It is a content source only.

---

## Verifying changes

There are no tests. The loop used during the rebuild was:

    python3 -m http.server 8099

then drive it with Playwright — screenshot each section at 1440x900 and
390x844, in both themes, and assert: no page errors, no horizontal scroll,
scroll-spy marks the right nav item, the filter shows the right counts, the
palette opens on Ctrl+K and closes on Escape, and the form rejects bad input.
Check contrast ratios against the computed background rather than eyeballing.

If a WebGL check runs headless, Chromium needs:

    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader

Frame rate measured under SwiftShader is meaningless — it is a software
rasterizer. Do not tune particle counts based on it.

---

## Prompt to start with

> This repo is my portfolio (github.com/ishank-dev/ishank-dev.github.io),
> rebuilt on the `redesign` branch — read HANDOFF.md first for the state of
> it and the constraints.
>
> Task: read ~/Documents/ChatGPT/Portfolio/portfolio/compare.html. It is a
> version I built with ChatGPT that has more current content than what is
> live. Diff its content against this site — role, location, dates, projects,
> metrics — and fold everything newer into the existing design. Use it as a
> content source only; do not copy its design.
>
> Show me the content changes you plan to make before editing.
