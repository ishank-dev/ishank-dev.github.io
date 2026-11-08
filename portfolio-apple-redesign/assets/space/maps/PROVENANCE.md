# Where these maps come from

## Real planets: Solar System Scope (CC BY 4.0)

`earth-day`, `earth-clouds`, `earth-night`, `jupiter`, `saturn` and `saturn-ring` are Solar System Scope's surface maps, built from NASA imagery. They're re-encoded for the web, and the footer credits them as the licence requires:
https://www.solarsystemscope.com/textures/

## Generated art: Google Gemini

These three textures were made for this site in the Gemini app, with the owner's Google AI Pro plan, on 2026-09-27. They are not photographs or astronomical images. The arrival world is fictional. The nebula and galactic-core textures sit at stops the flight names for real places (the Orion Nebula, the galactic core), so they are artistic impressions of those places, not pictures of them. The footer says the art was made with Gemini, and Gemini embeds its SynthID watermark in each image. For true imagery, openly licensed NASA/ESA Hubble or ESO photographs could replace the two impressions.

| Files | What it is | Prompt, in short | Processing |
|---|---|---|---|
| `arrival-world-1k.jpg`, `arrival-world-2k.jpg` | Surface map of the fictional "new world" at Contact | A flat 2:1 equirectangular map of an invented Earth-like planet: a C-shaped supercontinent with a mountain spine, a volcanic island arc, a second continent with an inland sea, and polar ice. Shadowless, with no text. Two earlier drafts that echoed Earth's real continents were rejected. | The 1456×720 source is resized to 2048×1024 and 1024×512, JPEG q78 and q80. The renderer adds fine procedural relief and lights it. |
| `orion-nebula-1k.jpg`, `orion-nebula-2k.jpg` | Emission-nebula texture for the Orion Nebula stop (Experience) | A square astrophotography-style emission nebula on pure black: teal core, gold filaments, rose edges, dark dust lanes. No stars, fading to black before the edges. | The 1024² source is saved at 1024² (q74) and 512² (q82). It's drawn as added light and dimmed behind text. |
| `galactic-core-1k.jpg`, `galactic-core-2k.jpg` | Glow and dust lanes for the galactic core stop (Awards) | A square texture of a galaxy's dusty golden bulge seen edge-on, with dark dust lanes. No individual stars, fading to black. | The 1024² source is saved at 1024² (q72) and 512² (q76). The renderer keeps its own procedural stars on top. |

The first-paint and total map weights are budgeted in `tests/planets.test.mjs`. All three generated textures load after the real planets.
