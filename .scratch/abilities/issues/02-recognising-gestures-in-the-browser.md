# Recognising gestures in the browser

Type: research
Status: claimed
Blocked by:

## Question

How can the game tell one gesture from another reliably from WebXR controller poses, cheaply enough for a Quest 3 browser at 72 fps?

- What recognisers exist for 3D motion paths (template matchers like $1/$P/$Q and their 3D variants, simple rule-based checks like today's Earthshaker, small learned models) and how accurate each is with few templates.
- What controller data WebXR gives on the Quest 3 (grip and target-ray poses, velocities, rates) and how noisy it is.
- How to keep false triggers down in a fight, where the player is already swinging a sword or drawing a bow: gating by a button or grip, a hand pose, a zone near the body.
- What it costs per frame.

Findings go in `.scratch/abilities/research/recognising-gestures-in-the-browser.md`, each claim with its source (papers, specs, library source code).
