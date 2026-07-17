---
title: "Building a Custom Codex Pet from Character Art to a Verified Spritesheet"
date: 2026-07-10
draft: false
tags: ["codex", "spritesheet", "animation", "image-generation", "tooling"]
categories: ["AI Tools"]
description: "A reproducible workflow for turning a character design into a Codex-compatible animated pet with deterministic assembly and visual QA."
---

Creating a Codex animated pet sounds like an image-generation task, but the deliverable behaves more like a small game-asset pipeline. A useful pet must satisfy fixed slicing, animation order, transparent-background, direction-consistency, and metadata requirements in addition to looking appealing.

Asking an image model to generate the final sheet in one pass often creates subtle failures: proportions drift between cells, grid boundaries move, actions repeat, clothing changes by direction, or transparent edges contain a light halo. A full-sheet preview can hide those defects, but animation makes them obvious.

## Lock the character before generating motion

The workflow begins with a reference character that fixes hair, clothing, colors, facial features, and body proportions. Every motion group is derived from that reference rather than being regenerated independently from text.

The action plan covers the runtime's required states, such as idle, movement, interaction, and special behavior. Directional variants also need judgment. Symmetric actions may be mirrored, but asymmetric hair, accessories, or held objects require separate inspection to prevent left and right views from contradicting one another.

## Deterministic assembly beats a one-shot sheet

Generation and assembly are separate stages:

1. Generate or repair one motion group.
2. Normalize canvas size, character center, and foot baseline.
3. Remove the background and inspect translucent edges.
4. Place frames in the fixed 8-by-11 sheet layout.
5. Produce the animation and direction metadata required by the runtime.
6. Render per-cell previews and a gridded QA image.

If one frame fails, only that cell needs replacement. The entire sheet does not need to be generated again. A deterministic assembly script also guarantees consistent dimensions, ordering, and file naming across revisions.

## Visual QA is required

Automated checks can validate dimensions, alpha channels, cell counts, and package structure. They cannot determine whether a character has an extra hand, hair jumps between frames, the walk direction is reversed, or several frames are actually duplicates.

The visual review checks:

- a stable baseline and character position in every cell;
- a consistent silhouette during playback;
- matching hair and clothing across directions;
- real motion instead of repeated still frames;
- clean transparent edges without background residue;
- readability at the pet's actual on-screen size.

The final package uses the current pet format and retains the source character, deterministic assembly process, and QA artifacts. Later changes to an expression, palette, or single action can therefore be made locally instead of rebuilding an irreproducible sheet.

The main lesson is that image generation creates visual candidates, while the engineering pipeline turns those candidates into a dependable asset. Character consistency, layout rules, and frame-by-frame verification are what make the pet usable.
