# ARCORE CAPTURE IMPROVEMENT AUDIT

## Scope

Audit limited to the Android scanner app and native capture pipeline.

Excluded on purpose:

- website
- upload
- GLB/glTF
- large UI refactor

Main goal of this phase:

- improve capture stability
- reduce bad frame integration
- reduce holes and black squares
- keep the texture workflow fix intact

## Current ARCore stack

### ARCore version

- Gradle dependency: `com.google.ar:core:1.31.0`
- File: `scanner/app/build.gradle`

### Capture backends

- Google ARCore path:
  - `common/arcore/arcore.cc`
  - `common/arcore/service.cc`
- Huawei path:
  - `common/arcore/arengine.cc`

This audit focuses on the Google ARCore path because the reported issues match the ARCore room/object capture flow.

## What the project already uses

### Depth API

Yes.

- Standard depth is used through:
  - `ArFrame_acquireDepthImage16Bits`
  - `ArFrame_acquireDepthImage`
- Main code:
  - `common/arcore/arcore.cc`

### Raw Depth API

Yes.

Before this phase, the native code tried to use Raw Depth for Google scans, but the support detection was too implicit.

After this phase:

- the native code detects real support for `AR_DEPTH_MODE_RAW_DEPTH_ONLY`
- Raw Depth is kept for Google devices that support it
- classic depth remains the fallback
- no crash path is introduced if Raw Depth is unavailable

Main code:

- `common/arcore/arcore.cc`
- `common/ar/com/lvonasek/utils/Compatibility.java`

### Confidence image / depth confidence

Yes, on the Raw Depth path.

Already present before this phase:

- `ArFrame_acquireRawDepthConfidenceImage`
- per-pixel filtering in `ARCore::UpdateFeaturePoints()`

Improved in this phase:

- confidence availability is now exposed explicitly
- average confidence is tracked for diagnostics
- low-confidence frames can be rejected more strictly in `High` and `Real estate HD`

### Point cloud ARCore

Yes, but not as the final main reconstruction source.

Current behavior:

1. ARCore native point cloud is acquired.
2. When depth is available, the code clears that cloud.
3. Reconstruction mostly uses points derived from depth/raw depth.

So the effective geometry pipeline relies mainly on depth, not on the sparse native point cloud.

### Tracking state / tracking failure reason

Partially before this phase, better now.

Before:

- tracking state and failure reason were read
- failure reason was mostly used for guidance messages
- the Google path could still continue too permissively

After:

- frame acceptance now checks tracking state explicitly
- a recovery cooldown is applied just after tracking comes back
- unstable tracking can stop frame integration instead of just warning

### Camera intrinsics

Partially.

Current situation:

- Google path mainly derives calibration from projection matrices
- Google image intrinsics are not fully exploited as a dedicated image/depth alignment layer
- Huawei path has more explicit intrinsic/distortion handling

Important limitation:

- this remains a likely contributor to left/right drift and imperfect depth-to-image alignment
- it is documented here, but not deeply refactored in this phase because that would be higher risk

### ARCore poses

Yes.

Camera poses are used heavily:

- `ARCore::Process()`
- `ARCoreService::GetPose()`
- `scanner/app/src/main/jni/app.cc`
- `common/thread/reconstr.cc`

They drive:

- realtime camera transform
- point cloud integration
- dataset pose storage
- texturing later

### Light estimation

No practical use found in the current capture pipeline.

The ARCore API supports it, but the app does not currently use light estimation values to score or reject frames.

## How frames were accepted before this phase

The previous pipeline already rejected some bad situations, but too late or too loosely:

- pose jump threshold
- empty point cloud
- no anchors / coordinate system issues
- low-confidence pixels filtered inside the depth map

What was missing:

- explicit rejection when ARCore tracking is not `TRACKING`
- cooldown after tracking recovery
- frame-level rejection based on camera speed / angular speed
- frame-level rejection based on weak depth coverage
- frame-level rejection based on low average confidence

Result on phone:

- some unstable frames could still be fused
- drift and left/right sliding could accumulate
- weak areas could become noisy geometry instead of staying clearly incomplete

## Probable causes of the observed issues

### Left/right drift

Most probable causes in the current architecture:

1. unstable ARCore pose on difficult surfaces
2. frames accepted too soon after tracking recovery
3. frames accepted during excessive motion
4. imperfect depth/image alignment on Google path
5. permissive fusion of uncertain geometry into Tango 3DR

This phase addresses points 1 to 3 and 5 with low/medium-risk safeguards.

### Holes

Probable causes:

- missing depth
- weak confidence
- low texture / low-feature surfaces
- strict filtering in quality modes
- correct rejection of uncertain geometry

Desired behavior:

- keep honest holes instead of inventing wrong surfaces
- guide the user to rescan

This matches the requested direction.

### Small black squares

Two probable causes exist:

1. unreliable or absent geometry/color data still visible in the realtime mesh
2. missing valid color fallback in realtime reconstruction

Findings:

- `common/tango/retango.cc` used black `(0,0,0)` when realtime color sampling was invalid
- this can create dirty black patches/checker artifacts
- weak frames also increase the chance of colored garbage and unstable micro-surfaces

Fix applied:

- unreliable frames are rejected earlier
- invalid realtime color now falls back to a neutral light gray instead of black

This does not replace missing data with fake geometry; it only avoids rendering missing realtime color as black.

## Implemented low/medium-risk improvements

### 1. Proper Raw Depth support detection

Implemented in:

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`

Changes:

- explicit detection of Raw Depth support
- explicit fallback to standard depth when Raw Depth is unavailable
- confidence availability tracked cleanly

### 2. Capture metrics exposed from native ARCore

Implemented in:

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`

Metrics now tracked:

- tracking state
- depth supported
- raw depth supported
- confidence available
- valid depth ratio
- average confidence
- black holes ratio
- depth quality score
- camera speed
- angular speed
- capture quality `GOOD/MEDIUM/LOW`

### 3. Stronger frame acceptance

Implemented in:

- `common/arcore/service.cc`

Added guards:

- tracking must be `TRACKING`
- cooldown after tracking recovery
- reject too-fast translation
- reject too-fast rotation
- reject weak depth quality
- reject too-low valid depth coverage
- reject too-low average confidence when Raw Depth confidence exists

Behavior by scan mode:

- `Normal`: more tolerant
- `High`: stricter
- `Real estate HD`: strictest

### 4. Better capture guidance

Implemented in:

- `scanner/app/src/main/jni/app.cc`
- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

New or improved warnings:

- `TRACKING_UNSTABLE`
- `DEPTH_LOW`
- existing `MOVE_SLOWLY`

Goal:

- tell the user to pause, slow down, or rescan an area
- do not silently integrate weak frames

### 5. Easier diagnostics

Added logs:

- `[CAPTURE] tracking=...`
- `[CAPTURE] failureReason=...`
- `[CAPTURE] depthSupported=...`
- `[CAPTURE] rawDepthSupported=...`
- `[CAPTURE] confidenceAvailable=...`
- `[CAPTURE] validDepthRatio=...`
- `[CAPTURE] avgConfidence=...`
- `[CAPTURE] cameraSpeed=...`
- `[CAPTURE] angularSpeed=...`
- `[CAPTURE] blackHolesRatio=...`
- `[CAPTURE] captureQuality=GOOD/MEDIUM/LOW`
- `[CAPTURE] frameAccepted=true/false reason=...`

The logging is throttled so it remains readable and does not spam every frame unnecessarily.

### 6. Black square mitigation

Implemented in:

- `common/tango/retango.cc`

Change:

- invalid realtime color no longer falls back to black
- it falls back to a neutral light gray

This reduces visibly dirty artifacts while preserving the more important rule:

- bad geometry should be rejected, not aggressively invented

## What was intentionally not done in this phase

To keep risk under control, this phase does not do:

- large UI refactor
- site changes
- upload changes
- GLB/glTF work
- major depth/image reprojection rewrite
- heavy probabilistic fusion rewrite
- major texturing pipeline changes

## Workflow texture safety

The recently fixed texture workflow remains a hard constraint.

This phase does not modify:

- the READY validation contract
- texture export validation
- the textured post-scan flow

The capture changes are limited to scan-time acceptance/filtering and realtime guidance.

## Critical files

### Capture / ARCore

- `common/arcore/arcore.cc`
- `common/arcore/arcore.h`
- `common/arcore/service.cc`
- `common/arcore/service.h`
- `common/arcore/camera.cc`

### Orchestration / realtime scan

- `scanner/app/src/main/jni/app.cc`
- `common/thread/reconstr.cc`
- `common/thread/reconstr.h`

### Reconstruction / realtime color

- `common/tango/retango.cc`
- `common/tango/scan.cc`

### Java bridge / guidance text

- `scanner/app/src/main/java/com/lvonasek/arcore3dscanner/main/JNI.java`
- `scanner/app/src/main/res/values/strings.xml`
- `scanner/app/src/main/res/values-fr/strings.xml`

## Remaining risks

1. Thresholds may need device-specific tuning after real phone tests.
2. Very strict `Real estate HD` can produce more honest holes if the user moves too fast or scans low-feature surfaces.
3. Google depth/image alignment remains imperfect because the pipeline still relies mainly on projection-based calibration rather than a deeper dedicated alignment model.
4. Light estimation is still not used as a formal scoring signal.

## Recommended next validation

Priority phone tests:

1. colored object in `Normal`
2. white wall
3. room corner
4. same scene in `Normal` then `Real estate HD`
5. fast sweep to confirm frame rejection and warnings
6. low-light scan to verify `LOW_LIGHT` plus weaker capture quality

Expected result:

- less drift
- fewer dirty black squares
- more warnings when capture quality drops
- weak zones left incomplete or marked to rescan instead of being invented too aggressively
