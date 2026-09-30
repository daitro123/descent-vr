# Recognising gestures in the browser

_Research for [issue 02](../issues/02-recognising-gestures-in-the-browser.md), 2026-09-30. Sources are numbered and listed at the end._

## Answer

- **Use two kinds of recogniser.**
  - **Rule checks**, like today's Earthshaker, for any gesture that one feature defines: a place plus a speed or direction ("tip into the floor, fast"). They need no templates and cost almost nothing.
  - **A small template matcher** that we write ourselves for gestures defined by a shape. It resamples the stroke to 16 points in a body-relative frame, turns them into 15 unit direction vectors and compares them with each template by dynamic time warping (DTW) in a narrow band. Each template has its own rejection threshold. This is the method of Jackknife and Penny Pincher, which reach high accuracy with one or two samples per gesture on 3D controller and Kinect data. [17][18] It is about 150 lines of TypeScript with no library.
- **Don't use a point-cloud recogniser ($P, $Q).** They ignore the order and direction of the stroke by design [13][14], so "sweep up" and "sweep down" look the same to them. In a fight, the direction is often what the gesture means.
- **Don't use rotation invariance ($1, Protractor, Protractor3D).** It exists to cancel how a pen or phone is held [11][12][16]. $1's authors say it cannot tell apart gestures that differ only in orientation. [11] WebXR already gives poses in a known frame. [1]
- **Don't use a learned model yet.** DeepGRU needs about four samples per class to beat template matchers and needs a training step [24]. MiVRy has no web build [25]. Tom is the only tester, so a model has little data to learn from.
- **Don't copy UCF's Jackknife code.** Its licence allows only non-commercial academic research and does not allow distribution. [17] The way it learns rejection thresholds from synthetic data is patented (US 10,133,949). [21] The method is published, so write our own version and tune its thresholds by hand.
- **Arm each gesture with the grip.** Record a stroke only while that hand's squeeze is held, and classify it once, on release. The map says the grips are free in a fight. Also require:
  - a start zone near the body;
  - a minimum path length and a time window;
  - no untracked frames;
  - a score under the template's rejection threshold;
  - the ability's resource and cooldown.

  Give a haptic tick when the gesture is armed and a different one when it is read. Never classify the sword's motion when it is not armed. Research on custom gestures in continuous "high activity" motion finds that cutting gestures out of movement alone gives many false positives. That work also says false positives cost more than misses. [19][20]
- **Per-frame cost is negligible.** While a gesture is armed, each frame writes one `Vector3` into a ring buffer (about 2 ns in our benchmark). One classification against 30 templates took about 40 µs in Node on a 2.8 GHz Xeon (our own benchmark, below). The Quest 3 is slower, but a 5–10× factor (our guess, not measured) still puts it well under 1 ms, and it runs once per gesture, not every frame. Meta's guideline flags app logic over 2 ms a frame ([budget doc](../../../docs/quest-3-browser-performance-budget.md)).

## Findings

### What WebXR gives on the Quest 3

- **Two poses per controller.**
  - `gripSpace` has its origin at the centroid of the curled fingers. Its −Z axis runs along a held rod toward the thumb, and its +X axis points out of the back of the right hand. [1]
  - `targetRaySpace` is the pointing ray along −Z. [1]
  - The game already tracks points from the grip: the hand and the sword's base and tip, in rig space (`TrackedPoint` in [src/player/weapons.ts](../../../src/player/weapons.ts)).
- **One sample per frame.** `getPose()` returns the pose "at the frame's time". [1] For an immersive session, the frame also carries `predictedDisplayTime`, when it is expected to reach the display. [1] At 72 fps that is one sample every 13.9 ms, so a 0.4 s gesture has about 29 samples. Template matchers resample to 16–64 points anyway [11][12][17]. Vatavu found that as few as 6 points are enough for Euclidean and angular recognisers to reach high recognition rates. [22]
- **Velocities.**
  - `XRPose.linearVelocity` (m/s) and `angularVelocity` (rad/s) are optional, and are `null` when the browser can't provide them. [1]
  - MDN's compatibility data lists both in the Quest Browser ("Oculus") from version 15.0. Desktop Chrome has neither. [5]
  - three.js r186 copies them into `grip.linearVelocity` and `grip.angularVelocity`, and sets `hasLinearVelocity` and `hasAngularVelocity` to say whether they came through. [4]
  - Poses are relative to the reference space, and the game parents the grips to the rig, so these velocities are in rig space like `TrackedPoint`'s (our reading of [4] and [input.ts](../../../src/player/input.ts)).
  - The sword tip is a spring-lagged virtual point (`Sword.follow`), so its velocity must still come from finite differences.
- **Tracking loss is visible.** `emulatedPosition` is `true` when the position includes a computed offset, as when tracking is lost and the runtime estimates. [1] Input poses are `null` while the session is `visible-blurred`, for example when the system menu is over the game. [1] A stroke that contains either should be thrown away.
- **Buttons.**
  - With the `xr-standard` mapping, `buttons[0]` is the trigger, `[1]` the squeeze, `[3]` the thumbstick click and `axes[2..3]` the stick. [2]
  - The registry's Quest 3 Touch Plus profile adds `[4]` A/X, `[5]` B/Y, `[6]` thumbrest and, on the left only, `[7]` menu. `[2]` is an empty placeholder. [3]
  - Today's `XRInput` reads indices 0, 1, 3, 4 and 5 ([input.ts](../../../src/player/input.ts)).
  - Every button also has `touched`, which is true when a finger rests on it without pressing. [2] Meta's native API lists capacitive touch on the index trigger and the thumbrest (medium confidence) [7]. Meta's browser page for the Touch Pro lists extra sensors (thumbrest pressure, trigger curl and proximity, thumb proximity), but those are Pro-only (medium confidence). [6]
  - Whether the Quest Browser reports `touched` for the Touch Plus trigger and thumbrest is not documented. Check it on the headset.
- **Noise.**
  - No primary source measures Touch Plus controllers during fast motion.
  - A robot study measured the Quest 3 *headset* moving slowly: 0.346 mm mean translational RMSE and 0.143° rotational RMSE. [10] Controllers will be worse.
  - Touch Plus have no tracking ring. Their IR LEDs sit on the face, and Quest 3 fuses LED tracking with IMU data and with hand tracking that runs all the time (secondary source, medium confidence). [8]
  - Users report that tracking is lost in very fast throws and behind the back (forum reports, low confidence). [9] Keep gestures in front of the body and away from the back.
  - Resampling already smooths the path. If jitter at slow speeds matters (a slow sigil, say), the 1€ filter is a BSD-licensed, two-parameter speed-adaptive low-pass filter with a JavaScript version. [23]

### The recognisers

| Recogniser | Built for | What it ignores | Accuracy with few templates | Code and licence |
|---|---|---|---|---|
| $1 (2007) [11] | 2D pen strokes | position, scale, **rotation** | 97% with 1 template, 99% with 3+ (16 pen gestures) | Many ports, e.g. [11]. Official code BSD (not read: site blocked) |
| Protractor (2010) [12] | 2D strokes, 16 points, closed-form angle | position, scale, optionally rotation | "more accurate … significantly faster … much less memory" than $1 | JS port `uwdata/gestrec`, BSD [12] |
| $P (2012) [13] | 2D multistroke **point clouds** | stroke count, **order and direction** | >99% with 5+ samples per gesture, user-dependent | JS in [14] |
| $Q (2018) [14] | $P plus a lookup-table lower bound and early abandoning | as $P | as $P; up to 142× faster than $P | Java port of the official C#, BSD [14] |
| $3 (2010) [15] | 3D accelerometer traces | rotation | 80% on 10 gestures | none found |
| Protractor3D (2011) [16] | 3D accelerometer traces, quaternion closed-form rotation | **3D rotation** | 83.3–98.9% with 5 per class (medium confidence) | Python on Assembla (not read) |
| Penny Pincher (2016) [18] | 2D strokes: dot products of unit direction vectors | scale, position | reduces error 5.8–10.4% with few templates | none read |
| Jackknife (2017) [17] | any N-D trajectory: DTW over direction vectors plus correction factors | scale, position; speed (by resampling) | 1–2 samples per class; 99% on Kinect with one sample (medium confidence) | C++, C#, JS; **academic, non-commercial only** [17] |
| DeepGRU (2019) [24] | GRU network on pose sequences | learned | beats traditional methods from 4 samples per class | PyTorch |
| MiVRy [25] | VR controller motion, ML | learned | not stated | Native (Windows, Linux, Android, Unity, Unreal) |

Details that matter for us:

- **$P and $Q are 2D as shipped.** $Q's lookup table is 64×64 over the x and y coordinates, and its gestures are resampled to 32 points. [14] $P's greedy match tries about √n start points, each an O(n²) matching, so O(n^2.5) per template (our reading of the source [14]). They could be taken to 3D, but they would still drop direction.
- **Jackknife's defaults** are 16 resampled points and a Sakoe–Chiba band of radius 2 (warping of up to 2 steps). Its local cost is `1 − dot(u, v)` between unit direction vectors. [17] Two correction factors divide the score by the dot product of normalised feature vectors. One is the total absolute distance travelled on each axis, the other the bounding-box widths; they penalise a candidate whose extent is spread over different axes from the template's. [17] A lower bound sorts the templates and culls them before the full DTW. [17] Each template has a rejection threshold: a score above it counts as "no gesture". [17]
- **Jackknife's reported accuracy** (search extracts of the paper, medium confidence):
  - The inner-product measure reached 99% on the paper's Kinect data with one training sample. [17]
  - In one comparison table (the extract does not say which dataset), Jackknife scored 0.93 and 0.96, $P 0.71 and 0.79, and Protractor3D 0.63 and 0.73. [17]
  - The paper also evaluates Cheema et al.'s Wii Remote dataset: 25 participants, 25 samples per gesture. [17]
- **Direction vectors are scale-invariant.** A small circle and a big one match. [17] If size should matter (a big sweep for a big effect), check the path length separately.
- **Machete** segments gestures out of a continuous stream with a single training sample. **VKM** picks rejection thresholds in "high activity" data, where gestures are mixed with other movement. Their datasets include Vive controller position and rotation. [19][20] VKM's authors say segmenting on low-activity pauses "result[s] in high false positive rates", and that false positives matter more than false negatives because they change state in ways that are hard to undo. [20] Machete's `LICENSE` file is MIT, but its README says "academic and research purposes", so read it as academic-only until clarified. [19]

### Rule checks: Earthshaker today

- Earthshaker's check runs every frame in `Combat.updateGroundSlam` ([src/combat/combat.ts](../../../src/combat/combat.ts)). It fires when all of these hold:
  - the level has unlocked it;
  - the tip is tracked;
  - the cooldown (0.8 s) is over;
  - rage is at least 35;
  - the sword tip is within 0.12 m of the floor;
  - the tip moves down faster than 3.5 m/s ([src/config.ts](../../../src/config.ts), `groundSlam`).
- It needs no arming: the floor is a zone that ordinary swings seldom reach at that speed. This is the rule-check pattern at its best. It is one feature, it has an obvious zone, and its thresholds can be tuned.
- `SwingDetector` ([src/player/swing.ts](../../../src/player/swing.ts)) is another rule check. It tells a committed swing (0.2 m of hand travel at 1 m/s or more) from a wiggle. A template gesture must not look like this: a shape that is one straight fast line *is* a sword swing.
- Rule checks stop scaling once there are more than a few gestures, or when gestures differ in shape rather than in place or speed. Past that point, each new gesture is hand-written geometry with its own thresholds.

### Keeping false triggers down in a fight

Every option below comes from the sources or from the code. Their combination is our recommendation.

1. **Segment explicitly with a button.** A stroke starts when the squeeze passes about 0.8 and ends when it drops below about 0.5. This removes the continuous-segmentation problem that Machete and VKM fight. [19][20] MiVRy's API works the same way: a stroke is started and ended by the app, and `endStroke` returns the gesture and a 0–1 similarity (medium confidence). [25] The squeeze is a good choice because the sword and shield stay attached without it ([input.ts](../../../src/player/input.ts)), and the map says the grips are free in a fight.
2. **Hand pose from touch sensors.** `touched` on the trigger or thumbrest could add a pose to the arm ("index finger off the trigger"). [2][7] It is unconfirmed on the Quest Browser, so treat it as an extra, not the arm itself.
3. **Zones.** Require the stroke to start (or end) near a body landmark: over the shoulder, at the hip, low in front, or the floor as with Earthshaker. Measure them from the headset pose, in rig space.
4. **Shape limits.** Set a minimum path length (for example 0.25 m) and a time window (for example 0.15–1.5 s). Require every frame to be tracked (`emulatedPosition` false, pose not null). [1] These are starting values to tune, not sourced.
5. **Rejection thresholds.** Give each template its own threshold. Jackknife learns them from synthetic data [17], but that method is patented [21]. For us: record 2 or 3 samples per gesture, plus armed "junk" strokes such as sword swings and bow draws. Set the threshold between the worst genuine score and the best junk score, then tune it on the headset.
6. **Cost and cooldown.** The resource spend and a cooldown limit what a false trigger can cost, as Earthshaker's do.
7. **Feedback.** Give a short haptic tick on arming and a stronger one on recognition. Show a faint trail while armed. `XRInput.pulse()` already exists ([input.ts](../../../src/player/input.ts)).

Open design questions for [issue 07](../issues/07-using-abilities-by-gesture.md): whether the sword still deals damage while its hand is armed, and whether the ranger's bow hand keeps the squeeze for the string.

### Frame of reference

- Turn each armed sample into a **body frame**: rig space (already the case for `TrackedPoint`), rotated by the inverse of the headset's yaw at the moment of arming. Then "forward", "up" and "toward the other hand" mean the same thing wherever the player faces. Snap turns and stick movement move the rig, not rig-space points, so they don't disturb a stroke (our reading of [weapons.ts](../../../src/player/weapons.ts)).
- Record templates with the right hand. For the left hand, mirror them by negating body-frame x. This is our proposal, not from a source.

### What it costs per frame

- **Recording** writes one point per armed hand per frame into a preallocated ring buffer, with no allocation. In our benchmark, 10 million writes of three floats took about 2 ns each.
- **Classification** runs once, on release: resample to 16, compute direction vectors, then run a banded DTW against each template. Our benchmark ran 30 templates of 16 points in 3D, with no lower bounding, in Node 22 on a 2.8 GHz Xeon: about 37–50 µs per classification. It is our own code of the method in [17], not UCF's, and the script stayed in the session's scratchpad. We have no Quest 3 measurement. Even 10× slower, it would be about 0.5 ms once per gesture.
- **Running the classifier every frame** over sliding windows, as Machete does [19], would multiply this by the number of window sizes on every frame. It isn't needed once strokes are armed by the grip.
- **Rule checks** such as Earthshaker's cost a handful of vector operations per frame.

## Recommendation

- **Keep Earthshaker as a rule check, unarmed.** The floor zone and downward speed already separate it from a swing.
- **Add a `GestureRecorder` for each hand** that follows the pattern of `SwingDetector`:
  - It starts on squeeze-down and stops on squeeze-up, with hysteresis.
  - Each frame it stores body-frame points from the hand's `TrackedPoint`, or from the sword tip for gestures drawn with the blade.
  - It drops the stroke on any untracked frame or when the stroke is too short or too long.
- **Add a `GestureMatcher`** that follows Jackknife's method, written from scratch:
  - 16 points, band radius 2, direction-vector DTW;
  - the two correction factors;
  - a hand-tuned rejection threshold per template;
  - a check that the stroke started in the right zone.

  It returns an ability id or nothing. Combat then checks resource and cooldown as it does for the War Cry.
- **Templates:**
  - Add a dev-only recording mode that dumps strokes as JSON, and check the templates into the repo.
  - Record 2 or 3 per gesture from Tom, plus junk strokes to set the thresholds.
  - Test the matcher with vitest on the recorded fixtures.
- **Don't use** $P or $Q (they lose direction), $1 or Protractor3D (they are rotation-invariant), UCF's code (licence) or ML (not enough data).

## To check on the headset

1. Whether `grip.hasLinearVelocity` is true in the Quest Browser on a Quest 3, and how its velocity compares with `TrackedPoint`'s finite differences during a swing.
2. Whether `gamepad.buttons[0].touched` (trigger) and `buttons[6].touched` (thumbrest) change when a finger rests on them.
3. How often `emulatedPosition` turns true during fast swings, over-the-shoulder strokes and strokes near the hip. Log the count for each stroke.
4. How long a classification takes on the headset: time 1,000 runs with `performance.now()` against 30 templates.
5. How often an armed sword swing is read as a gesture in the arena, and how often a real gesture is missed, with the thresholds set from recordings.

## Sources

Most sites were blocked by the network proxy. GitHub worked, so specs, library source and compatibility data were read there (read 2026-09-30). Papers and Meta's pages were blocked and are cited from search-engine extracts, marked **medium confidence**. The benchmark is our own and is described above.

1. W3C, [WebXR Device API](https://www.w3.org/TR/webxr/): [`gripSpace`](https://www.w3.org/TR/webxr/#dom-xrinputsource-gripspace), [`targetRaySpace`](https://www.w3.org/TR/webxr/#dom-xrinputsource-targetrayspace), [`XRPose` velocities and `emulatedPosition`](https://www.w3.org/TR/webxr/#xrpose-interface), [populate the pose](https://www.w3.org/TR/webxr/#populate-the-pose) (frame time, `visible-blurred`), [`predictedDisplayTime`](https://www.w3.org/TR/webxr/#dom-xrframe-predicteddisplaytime). Source: [`immersive-web/webxr` `index.bs`](https://github.com/immersive-web/webxr/blob/main/index.bs) (about lines 1133–1135, 1231, 1325–1366, 1879–1892, 1953–1969).
2. W3C, [WebXR Gamepads Module](https://www.w3.org/TR/webxr-gamepads-module-1/#xr-standard-gamepad-mapping): the `xr-standard` mapping and placeholder buttons. Source: [`immersive-web/webxr-gamepads-module` `index.bs`](https://github.com/immersive-web/webxr-gamepads-module/blob/main/index.bs).
3. WebXR Input Profiles registry, [`meta-quest-touch-plus.json`](https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/registry/profiles/meta/meta-quest-touch-plus.json).
4. three.js r186, [`src/renderers/webxr/WebXRController.js`](https://github.com/mrdoob/three.js/blob/r186/src/renderers/webxr/WebXRController.js) (grip and target-ray pose, `linearVelocity`, `hasLinearVelocity`).
5. MDN browser-compat-data, [`api/XRPose.json`](https://github.com/mdn/browser-compat-data/blob/main/api/XRPose.json): `linearVelocity` and `angularVelocity`, Oculus 15.0, Chrome none.
6. Meta, [Meta Quest Touch Pro Controller Support for Browser](https://developers.meta.com/horizon/documentation/web/webxr-pro-controller/): extra buttons 6–11 (search extract, medium confidence).
7. Meta, [OVRInput reference](https://developers.meta.com/horizon/reference/unity/v81/class_o_v_r_input/) and [Touch Plus native input paths](https://developers.meta.com/horizon/documentation/native/pc/native-touch-plus-controllers/): capacitive `Touch.PrimaryIndexTrigger`, `PrimaryThumbRest`, `thumbrest/touch` (search extract, medium confidence).
8. UploadVR, [Meta Reveals How Quest 3's Controllers Are Tracked](https://www.uploadvr.com/meta-explains-quest-3-controller-tracking/): LEDs on the face, fused with hand tracking and IMU (secondary source, search extract, medium confidence).
9. Meta Community Forums, [Quest 3 Controller Tracking Issues](https://communityforums.atmeta.com/discussions/OtherTroubleshooting/unresolved-as-of-may-30-2024---quest-3-controller-tracking-issues/1090544): tracking lost in fast throws and behind the back (user reports, low confidence).
10. Sensors 26(8):2285 (2026), [Robot-Driven Calibration and Accuracy Assessment of Meta Quest 3 Inside-Out Tracking](https://pmc.ncbi.nlm.nih.gov/articles/PMC13119968/): headset only (search extract, medium confidence).
11. Wobbrock, Wilson, Li, [$1 recognizer, UIST 2007](https://faculty.washington.edu/wobbrock/pubs/uist-07.01.pdf): 97% with 1 template, 99% with 3+; cannot distinguish gestures that depend on orientation, aspect ratio or location (search extract, medium confidence). Port: [`nok/onedollar-unistroke-recognizer`](https://github.com/nok/onedollar-unistroke-recognizer).
12. Li, [Protractor, CHI 2010](https://research.google/pubs/pub36269/) (search extract, medium confidence). JS port: [`uwdata/gestrec`](https://github.com/uwdata/gestrec) (16-point `SEQUENCE_SAMPLE_SIZE`, `minimumCosineDistance`).
13. Vatavu, Anthony, Wobbrock, [$P, ICMI 2012](https://dl.acm.org/doi/10.1145/2388676.2388732): >99% user-dependent with 5+ samples; ignores stroke number, order and direction (search extract, medium confidence).
14. Vatavu, Anthony, Wobbrock, [$Q, MobileHCI 2018](https://dl.acm.org/doi/10.1145/3229434.3229465): up to 142× faster than $P (search extract, medium confidence). Source: [`cluelab/dollar-recognizers-java`](https://github.com/cluelab/dollar-recognizers-java) (`QPointCloudRecognizer.java`, `Gesture.java`: 32 points, 64×64 LUT, New BSD header of the official C#); $P JS in [`wcchoi/dollar-q`](https://github.com/wcchoi/dollar-q).
15. Kratz, Rohs, [A $3 Gesture Recognizer, IUI 2010](https://www.medien.ifi.lmu.de/pubdb/publications/pub/kratz2010threedollar/kratz2010threedollar.pdf): 80% on 10 gestures (search extract, medium confidence).
16. Kratz, Rohs, [Protractor3D, IUI 2011](https://www.medien.ifi.lmu.de/pubdb/publications/pub/kratz2011protractor3d/kratz2011protractor3d.pdf): quaternion closed-form rotation invariance; 83.3–98.9% with 5 per class (search extract, medium confidence).
17. Taranta et al., [Jackknife, CHI 2017](https://www.eecs.ucf.edu/isuelab/research/jackknife/jackknife-final.pdf) (accuracy from search extract, medium confidence). Source: [`ISUE/Jackknife`](https://github.com/ISUE/Jackknife): README, [`LICENSE`](https://github.com/ISUE/Jackknife/blob/master/LICENSE) (academic research only, no distribution), `csharp/Jackknife/JackknifeBlades.cs` (16 points, radius 2), `js/jackknife/jackknife_recognizer.js` and `jackknife_features.js`.
18. Taranta, Vargas, LaViola, [Penny Pincher, Computers & Graphics 55 (2016)](https://www.sciencedirect.com/science/article/abs/pii/S0097849315001788) (search extract, medium confidence).
19. Taranta et al., [Machete, TOCHI 28(1) 2021](https://dl.acm.org/doi/10.1145/3428068) (search extract). Source: [`ISUE/Machete`](https://github.com/ISUE/Machete) (README, LICENSE, Vive controller datasets).
20. Taranta et al., [The Voight-Kampff Machine, CHI 2022](https://dl.acm.org/doi/10.1145/3491102.3502000) (search extract, medium confidence). Source: [`ISUE/VKM`](https://github.com/ISUE/VKM) README.
21. [US 10,133,949 B2, Synthetic data generation of time series data](https://patents.google.com/patent/US10133949), assigned to the UCF Research Foundation (search extract, medium confidence). Jackknife's `LICENSE` names the application it came from (62/362,922). [17]
22. Vatavu, [The effect of sampling rate on the performance of template-based gesture recognizers, ICMI 2011](https://dl.acm.org/doi/10.1145/2070481.2070531): 6 points suffice (search extract, medium confidence).
23. Casiez, Roussel, Vogel, [1€ filter, CHI 2012](https://dl.acm.org/doi/10.1145/2207676.2208639). Source: [`casiez/OneEuroFilter`](https://github.com/casiez/OneEuroFilter) (README; `javascript/OneEuroFilter.js`, BSD-3-Clause).
24. Maghoumi, LaViola, [DeepGRU, ISVC 2019](https://arxiv.org/abs/1810.12514): beats traditional methods from 4 samples per class (search extract, medium confidence). Source: [`Maghoumi/DeepGRU`](https://github.com/Maghoumi/DeepGRU) (PyTorch).
25. MARUI-PlugIn, [`MiVRy`](https://github.com/MARUI-PlugIn/MiVRy) README (MIT; Windows, Linux, Android, Unity, Unreal) and [MiVRy documentation](https://www.marui-plugin.com/documentation-mivry/) (`endStroke` returns the gesture and a 0–1 similarity; search extract, medium confidence).
