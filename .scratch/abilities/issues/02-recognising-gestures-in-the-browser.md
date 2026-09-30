# Recognising gestures in the browser

Type: research
Status: resolved
Blocked by:

## Question

How can the game tell one gesture from another reliably from WebXR controller poses, cheaply enough for a Quest 3 browser at 72 fps?

- What recognisers exist for 3D motion paths (template matchers like $1/$P/$Q and their 3D variants, simple rule-based checks like today's Earthshaker, small learned models) and how accurate each is with few templates.
- What controller data WebXR gives on the Quest 3 (grip and target-ray poses, velocities, rates) and how noisy it is.
- How to keep false triggers down in a fight, where the player is already swinging a sword or drawing a bow: gating by a button or grip, a hand pose, a zone near the body.
- What it costs per frame.

Findings go in `.scratch/abilities/research/recognising-gestures-in-the-browser.md`, each claim with its source (papers, specs, library source code).

## Answer

Resolved by a research agent on 2026-09-30. The findings are in [recognising-gestures-in-the-browser.md](../research/recognising-gestures-in-the-browser.md). Most papers and Meta's pages were blocked by the proxy, so those claims rest on search extracts and are marked medium confidence; the note lists five things to check on the headset, among them whether the Quest Browser reports controller velocity and finger touch.

- **Earthshaker stays a rule check:** the tip at the floor with enough downward speed already tells it from a swing.
- **Shaped gestures use our own template matcher** on Jackknife's published method, about 150 lines: each stroke resampled to 16 points in a frame that follows the body, compared by direction, with a hand-tuned rejection threshold per template. One or two recorded samples per gesture are enough.
- **Not UCF's Jackknife code:** its licence is academic and non-commercial, and its threshold training is patented.
- **Other recognisers fall short:** $P and $Q ignore direction (a sweep up reads as a sweep down), $1 and Protractor3D cancel rotation, and a learned model needs more samples than one tester gives.
- **Arming:** record only while that hand's grip is held and classify once on release, with a start zone, a minimum length and time, fully tracked frames, enough resource and the cooldown as further gates. A haptic tick on arming and on recognition. Without arming, continuous motion gives many false triggers.
- **Cost:** recording is negligible, and one classification against 30 templates took about 40 µs on a desktop; the headset should stay well under 1 ms.
- **Against Inventory's bag:** the bag also opens on a held grip, reached over the shoulder. The start zone keeps them apart: no gesture may start behind the shoulder.
