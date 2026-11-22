# bellstheorem

Open `index.html` directly in a modern WebGL browser. All files, including Three.js, are bundled locally. No installation or internet connection is needed. For an optional localhost preview, run `node server.cjs` and open the printed URL.

## Controls

- Ten detectors, A–J, can be placed anywhere on either side of the rail. Drag a card’s title/icon (or a non-control part of the card) into the scene. Drag an existing detector or its card to reposition it, including across the source. Place/Remove buttons and numeric position fields provide keyboard alternatives.
- Signed positions are measured in metres from the source: negative on one side, positive on the other. The rail is 51.6 m long, three times the original 17.2 m. Detector centers stay at least 2.2 m from the source and 1.05 m apart.
- Click a slotted disc or a card’s orientation buttons to rotate a detector among 0°, 120°, and 240°. Colors identify bases and cards; scene labels show only detector letters.
- Click the red source button, Release a pair, or Space. Every trigger is accepted, including while previous lamps fade. The source-port rings flash white for 150 ms; detector LEDs hold for 170 ms, then fade over 680 ms. New results replace the previous lamp state without an old timer clearing them.
- Select Randomize orientation before firing on individual cards. Each trigger captures the arrangement and randomly selects each opted-in orientation independently. All affected discs turn together for 190 ms before release. If triggers arrive during this preparation, each is queued and emitted after its own visible preparation; shots are not discarded. Apparatus editing is briefly locked during preparation, while the release button remains active.
- Drag empty space to orbit, shift-drag or right-drag to pan, and scroll to zoom. Fit rail resets the camera; Focus source gives a closer view. Sound on/off controls a brief synthesized release sound.

## Measurement model

`physics.js` implements Appendix III of Gary Felder’s explanation, without reversing the color mapping at either end: https://www.felderbooks.com/papers/bell.html

`BellPhysics.sampleExperiment([{id: 'A', x: -4, setting: 1}, ...], rng)` returns an immutable placement snapshot, ordered measurement events, and the final particle spin directions. Settings are 1–3; their angles are 0°, 120°, and 240° in one common laboratory frame.

Both particles travel at equal speed. The first measurement is the detector nearest the source, regardless of side. Its result is green or red with equal probability. Green aligns that particle with the measurement axis; red aligns it opposite. Only this first measurement sets the partner’s spin to the opposite of the resulting spin. Each later measurement acts solely on its own particle, with probability `cos²((particle angle − detector angle) / 2)` of aligning to the detector (green), otherwise opposite (red). Distances set the calculation order, while readings appear immediately without a slowed travel animation. Exact equal-distance ties use detector identifiers to select a reproducible computational order.

A pair measured on equal axes therefore produces opposite colors; this intentionally replaces the earlier display inversion and the subsequently introduced alternate probability model. Repeated measurements on the same particle follow sequential spin measurements. The model assumes ideal detection and noiseless, nonabsorbing detectors. It illustrates the requested idealized rules, not a physical experiment or faster-than-light signaling.

The per-detector randomization is implemented. A future automated repeated-trial runner, trial recording, and Monte Carlo summaries remain unimplemented. The pure model is independent of the rendering and supports an injected RNG.

## Verification

Run `node tests/physics.test.cjs` for exact joint distributions, unbiased single-detector results, both first-particle orders, ordered multi-detector measurements, one-time pair collapse, repeatability/erasure, and immutable snapshots.

`vendor/three.min.js` is Three.js 0.160.1, MIT licensed; see `vendor/THREE-LICENSE.txt`. Existing project license terms are in `LICENSE.md`.

Browser verification covered ten placements with six on one side, rapid bursts without lost releases, queued simultaneous opt-in rotation, non-randomized detectors remaining still, card and scene dragging across the source, 3D source-button clicks, an open internal slot with solid surrounding disc, stationary-source white pulses, indicator fading, sound/mute, desktop/mobile layouts, offline file opening, and randomized shots without WebGL. No normal-path browser runtime errors were observed.

