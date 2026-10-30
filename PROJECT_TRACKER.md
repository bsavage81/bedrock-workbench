# Bedrock Workbench — project tracker

## 0.26.13 — October 30, 2026

Verification: syntax checks and full suite passed (330 tests: 328 passed, two skipped, zero failed), including archive path separation, recognizable short deployment names and migration from coded names.

Replace coded deployment names with the first six ASCII letters/digits of the project name, plus Beta for beta packs. SavageCraft deploys as Savage / SavageBeta in each respective pack parent directory. Maximum length is 10 characters; empty stems fall back to Pack and Windows reserved names are prefixed with an underscore. Profile title/version changes preserve paths. Project name changes migrate owned folders; ownership checks still protect collisions. Export archives use the short name plus BP/RP (SavageBP/SavageRP) to avoid overlapping paths while keeping folder names recognizable and under 10 characters. Full display names and UUIDs are unchanged. Regression coverage includes migration from 0.26.12 UUID-derived names.

## 0.26.12 — October 30, 2026

Limit generated deployment and exported pack root folder names to exactly 10 ASCII characters: eight SHA-256 hex characters of the persistent pack header UUID plus BP/RP. Names remain stable across title/version changes and UUID capitalization. Full manifest display names, UUIDs, manifest versions and versioned export filenames are preserved. Existing ownership checks protect colliding unowned folders; legacy owned names migrate through the existing transactional deployment.

Syntax checks passed. Full suite: 329 tests, 327 passed, two skipped, zero failed. Tests cover short names, title/version independence, beta/stable legacy migration, header/module UUID preservation, archive paths, rollback and unowned-folder collisions.

## 0.26.11 — October 29, 2026

Promote the SavageCraft installed-extension naming fix into the repository: beta/stable manifest titles, deployment folders and archive pack folders omit version numbers. Export filenames remain versioned; manifest versions and persistent profile UUIDs retain their existing behavior. Owned legacy folders migrate, while unowned collision and recovery protections remain in place.

Verified syntax checks, schema regeneration with no schema changes, and the full suite: 328 tests, 326 passed, two skipped, zero failed. Regression coverage includes beta/stable versioned-folder migration, all header/module UUIDs, repeated version updates, release archive naming, rollback and unowned folders.

## Entity Appearance System Phase 2 — October 28, 2026 (implementation delivered; rendering acceptance partial)

Continues the same appearance milestone. All prior uncommitted work is preserved. Version remains 0.26.10; this development build is not installed.

- [x] Read existing instructions/tracker/verification/audit and preserve the previous resolver tests. Verify the six original source fixtures against the official Stable v1.26.50.4 min archive (SHA-256 2bb667786f4d5bedf97a61cec4ce9613c1e2986224c9deda5fbb108c2d96b07c), revision 46ba6ea985fb5a92d79a9419198f10dda14c199d, engine 1.26.50. Extend to 45 hash-verified fixture assets: source geometries, actual PNG/TGA textures and upstream license. Binary textures are absent from the min archive; verify their Git blob hashes against the saved official tree at the same revision. Provenance lives in test/fixtures/appearance/provenance.json; fixtures are excluded from the VSIX.
- [x] Shared Appearance Plan schemaVersion 1: entity/source, actual selected and requested subpack/channel/target context, validated values and input origins, dependencies, controls, controller activation/expression/source records, four resolution states, layer geometry/texture/material/visibility bindings, overrides, ordered renderer-ready passes and diagnostics. src/preview-plan.cjs prepares visibility/material routing/images; automatic rendering and inspection consume that single plan. Manual assets carry an explicit override plan. No second index or Molang parser.
- [x] Appearance (default): relevant synced properties and supported explicit query/scalar inputs; missing runtime values remain unresolved, grouped inputs/reset, entity/source, concise warnings. Raw model/texture and branch selectors are in Inspect. Preserve values across saved changes, geometry changes and edits made while an entire dependent controller is inactive; retain focused input drafts during refresh.
- [x] Layers: ordered controller states and activation, geometry, primary/secondary textures, materials, visibility, collapsed source navigation and diagnostics. Local show/hide, isolate and restore actions never write source files. Returning to Appearance clears inspection-only layer masks and manual asset/controller overrides.
- [x] Inspect: independent geometry/texture inspection, constrained branch choices, supported raw inputs, expression/plan/provenance JSON and return-to-automatic action. Source opens are restricted to current plan resources and gated by workspace trust.
- [x] Explicit allowlisted source-referenced queries: is_baby, variant, mark_variant, trade_tier, skin_id, color and color2. Retain authored behavior-component domains/defaults when available; otherwise bool or bounded numeric preview controls with no fabricated defaults or profession/biome labels. Unassigned referenced variable/temp scalars accept explicit bounded numeric input; unique preceding pre_animation assignments still expand through the owned evaluator. General scripts, initialize semantics, arbitrary math/runtime queries and animation are not executed. Tint profiles require an explicit supported palette value rather than silently inventing white runtime state.
- [x] Skip fully hidden passes before texture reads and omit unresolved material bindings. Keep single-sampler materials from consuming a secondary binding. Bound pass/read traversal and PNG composition dimensions before inflation; retain existing TGA/UV/camera code.
- [x] Source-backed plan, browser-contract and host-message regressions cover paired UI/render plan authority, state/input-origin behavior, hidden/inactive state persistence, material/visibility data, inactive versus unknown, source navigation/trust, existing subpack-controller precedence, layer masks and restoring automatic resolution.
- [x] Native VS Code 1.143.1 real webview interactions: adult plains/farmer, adult desert/librarian/gold-tier, baby desert, adult restoration, Layers isolate/restore, Inspect manual assets and Appearance automatic restoration. Seven acceptance checks passed with 17 render acknowledgements; .test-temp/appearance-phase2-host.json. Visual changes were inspected through the Computer Use skill. Initial Windows input access failure was resolved after the owner restored desktop availability.
- [x] Native saved-file default false -> true texture switching on the refactored pipeline: .test-temp/appearance-resolution-host.json. Native final manual selector containment in side-by-side layout: viewport width 388 CSS px, header scrollWidth/clientWidth both 318, canvas height 703 device pixels; .test-temp/appearance-layout-host.json. tools/test-appearance-phase2.ps1 reruns automatic layout checks; -Interactive runs the seven real-control checks against copied fixtures.
- [ ] Full villager visual acceptance: masked composition still retains primary alpha; secondary opaque texels outside the biome alpha mask can be lost (425 such texels in the plains/farmer fixture). These approximations are explicitly warned in the plan and UI. Exact masked shader/hat/cutout behavior, lighting, shader/material parity, source-version/Preview matrices and Minecraft comparisons remain unverified. Successful resource selection/draws do not establish visual parity.
- [ ] Generalize repeated declarations of the same controller identifier to separate instance keys; current symbolic selection groups by identifier and may report ambiguity. Complete correlated multi-sampler alternatives, richer supported evaluation and reliable source-derived presets separately.
- [ ] N1/shared authoring dependencies remain distinct: complete shared geometry/texture/material subpack precedence and material inheritance provenance beyond current controller views; pinned binary TGA vanilla fallback still needs extension metadata (project/copied/selected-pack TGA paths work). No schema route changes or competing preview index were introduced.
- [ ] Animation readiness follow-up: use plan geometry, values, controller/source relationships and visibility; add explicit per-declaration IDs and richer temporal/controller-state metadata before bounded playback. No animation playback implemented.

Final verification: npm run check passed; full npm test: 327 tests, 325 passed, two skipped, zero failed (.test-temp/appearance-phase2-tests.log). Focused appearance/preview/model/Molang run: 95 tests, 94 passed, one skipped, zero failed (.test-temp/appearance-phase2-focused.log). PowerShell runner syntax and git diff --check passed. Native evidence is recorded above. Development VSIX: bedrock-workbench-win32-x64-0.26.10.vsix; exact runtime/webview contents verified; SHA-256 and source-byte fingerprints recorded in .test-temp/appearance-phase2-package-verification.json. No installation, Marketplace/release publication, tester ZIP refresh, deployment, version change or scheduled publishing change in Phase 2.


## 0.26.10 local version bump — October 28, 2026

Owner requested a version bump and local reinstall of the tested appearance resolver subset. Updated package and lockfile versions from 0.26.9 to 0.26.10; functionality and known limitations remain as recorded below. Syntax checks, packaging and exact preview package verification passed. Installed 0.26.10 locally and verified all 64 installed source/media files against the VSIX, plus manifest fields; evidence: .test-temp/appearance-0.26.10-install.json. All 64 source/media files are unchanged from the previously tested 0.26.9 package. No Marketplace publication, release, tester ZIP refresh or Minecraft deployment authorized.


## Historical first resolver subset — October 28, 2026 (superseded by Phase 2 above)

Distinct from N1 resource-pack schema completion; package version remains 0.26.9. This session completes a coherent resolver subset, not the requested viewer redesign or full villager acceptance.

- [x] Record architecture and actual legacy/v2/v3 villager client/controller audit before edits in APPEARANCE_RESOLUTION_AUDIT.md. Preserve six byte-exact Mojang snapshot fixtures with source paths and archive/file SHA-256 hashes. Snapshot target/version compatibility remains unverified; do not advertise compatible villager support from these fixtures alone.
- [x] Extend the existing bounded preview evaluator with conservative &&/||, unary boolean operands and ternary precedence; add resolved/unknown scalar results and dependencies. Explicit is_baby/trade_tier inputs are supported by the resolver without guessed defaults. Existing property schemas still govern webview input validation; these two queries are not newly exposed as UI controls.
- [x] Keep inactive activation inputs discoverable; track supported material/visibility dependencies. Resolve material alias ternaries and material arrays through the existing resource resolver, lexer and owner/subpack view. Reject missing/duplicate secondary (and missing primary) texture assets. Add controller resource outcomes with resolved/ambiguous/unknown status, source paths, texture bindings and manual-choice attribution. These outcomes are not yet the complete renderer/inspection Appearance Plan.
- [x] Source-backed standalone plan regressions verify profession, biome, tier, baby geometry, material and level visibility changes from explicitly supplied state, plus unknowns, bounds, inactive dependencies and duplicate secondary textures. Existing ordered controller passes remain in use; no new viewer or renderer-specific villager rules.
- [x] Native VS Code 1.143.1 saved-file refresh: synced default false -> true changes an actual textured controller pass from textures/uv to a distinct textures/alternate image, with six-face WebGL render acknowledgements. Evidence: .test-temp/appearance-resolution-host.json. No new interactive-control or villager visual verification; no Minecraft parity claim.
- [x] Repair stale selection/persistence regression fixture by giving it supported cube geometry. Its empty geometry produced no material pass, so the original test also failed with unchanged HEAD resolver modules. Existing assertions now exercise controller rendering and saved/manual property persistence.
- [ ] Finish Phase 1: establish exact compatible sample revisions/channels, trace full behavior/material/geometry/texture provenance across targets and retain existing cow/bull/fish/koi visual coverage.
- [x] Phase 2 supersedes this initial gap: the shared plan now supplies renderer/inspection material and visibility data, activation/expression results, inactive states and provenance. Remaining advanced cases are listed in the current Phase 2 section.
- [ ] Complete bounded variable/query control discovery, initialization semantics, richer explicit query overrides, correlated multi-sampler ambiguity, and material-expression uncertainty explanations. No runtime-only defaults or arbitrary scripts.
- [x] Phase 2 implements Appearance, Layers and Inspect, layer isolation/toggles, return-to-automatic and source navigation. Reliable source-derived presets remain a separate follow-up.
- [ ] Verify masked composition/shader behavior against actual compatible villager textures/materials; skip all-hidden passes before image work. Existing composition is an approximation. No animation, skinning, shader or in-game parity claim.
- [ ] Complete native actual webview interactions, villager visual evidence and acceptance matrix (including source-version and subpack combinations). Existing automated index/subpack/Molang regressions remain applicable, not a substitute for new visual acceptance.
- [ ] N1/shared schema dependencies: audit material indexing and render-controller/animation/attachable resource metadata for the completed plan; do not introduce a second resource index. No schema associations changed in this subset.
- [ ] Animation follow-up: consume the completed plan's geometry, ownership/controller relationships, values and visibility; add bounded playback separately after the above contracts stabilize. No animation playback implemented here.

Verification: npm run check passed; full npm test 317 tests, 315 passed, two skipped, zero failed. Logs: .test-temp/appearance-resolution-check.log and appearance-resolution-tests.log. Native host scope and evidence above. Focused preview/Molang run: 49/49 passed (.test-temp/appearance-resolution-focused.log). npm run package and tools/verify-preview-package.cjs passed; local 0.26.9 VSIX contains exact verified runtime/browser/preview-documentation bytes. Subsequent owner-authorized local installation: 0.26.9 installed in VS Code; installed preview runtime/browser bytes match the verified VSIX (.test-temp/appearance-resolution-install.json). No publication, tester ZIP refresh, deployment or scheduled publication changes.


## 0.26.8 independent authoring-data updates — October 27, 2026

- [x] Packaged and installed 0.26.8 in local VS Code; validated the packaged runtime, preview assets, starter project, and copied SavageCraft compile. The owner selected public source under MIT and authorized public data setup.

- [x] Audit private repository/release state and existing reference/schema/catalog loaders, generators, target/format gates, caches and manual commands. Preserve existing uncommitted work; baseline 0.26.6, concurrent preview work advanced checkout to 0.26.7.
- [x] Create the user-confirmed public repository `bsavage81/bedrock-workbench-data`; repository now has its README/license and immutable releases enabled. Choose MIT for authored data; retain upstream notices.
- [x] Integrate the allowlisted JSON registry into actual schemas, completions, hovers, validation, filters, event forms, Molang and reference consumers. Fix real Preview tag/prerelease selection and retain actual source-channel attribution.
- [x] Versioned manifests, explicit extension/Minecraft coverage and source revisions, SHA-256/size checks, trusted anonymous URLs, JSON/schema validation, bounded downloads, atomic activation, overlap protection, cancellation, persisted throttling, rollback hold, bundled/LKG recovery and live editor refresh. Quiet sidebar/status/refresh/rollback controls.
- [x] Source-repository manual Actions candidate workflow and prepared disabled schedule. Official Learn/Mojang/Creator Tools inputs, pinned revision/blob/hash verification, generated facts, coverage/vanilla audits, candidate-loaded project regressions and exact content/coverage review fingerprints.
- [x] Verification: full suite 311 tests (309 pass, two skips, zero failures), eleven dedicated updater/service regressions, real-source Stable and Preview candidates each pass 485 vanilla fixtures and 61 candidate-loaded project regressions; no missing component hovers or linked Learn pages. Native VS Code live schema completion/hover/validation, Molang refresh, replacement, rollback, failed-checksum recovery and bundled fallback passed. Evidence: `.test-temp/authoring-data-host.json`, `.test-temp/data-output/*/verification.json`; maintained summary: `schemas/AUTHORING_DATA_AUDIT.json`.
- [x] Document supported data families, maintenance, security, historical coverage, offline cache limits and licensing in `AUTHORING_DATA.md` and `schemas/AUTHORING.md`.
- [x] Correct Windows short-path preview containment by resolving both file and pack roots; retain escape protection and add a symlink-escape regression. Normalize preview fixture line endings for Windows CI.
- [x] Review both 0.26.8 candidate fingerprints. Preview metadata omitted twelve components still used in Preview vanilla; retain their Stable documentation with explicit source attribution and verify its constraints against Preview fixtures.
- [x] Publish immutable Stable `run-40587848516-1-stable` and Preview `run-40587710657-1-preview` releases through the data repository Actions token and owner-reviewed fingerprints. Both Actions runs passed; anonymous downloads and native VS Code activation passed for each channel.
- [ ] Scheduled publication is enabled every six hours, subject to reviewed fingerprints. Tester bundle unchanged.


## 0.26.7 controller-driven appearance, TGA and fractional UV correction — October 27, 2026 (local update)

- [x] Correct fractional cube box UV dimensions to whole texels while retaining precise geometry and explicit per-face UV dimensions. Bull horn and pellet interior atlas audit: 3,150 samples, zero transparent texels; `.test-temp/appearance-uv-audit.json`.
- [x] Controller-driven owner preview by default; explicit manual geometry/texture inspection override. Render one resolved resource variant per controller, offering constrained controller choices for unknown runtime branches instead of overlapping alternatives.
- [x] Show only relevant synced inputs from reachable resource/visibility branches. Support bounded property-derived numeric indices; koi life stages, fin styles, base colors, palettes and pattern numbers control the combined appearance. Hide inactive palette/pattern inputs and retain hidden values until reset.
- [x] Decode bounded raw/RLE true-color and grayscale TGA locally, preserving origin and alpha. Render separate controller passes and visibility in declaration order; skip fully transparent no-pattern layers. Arbitrary multi-sampler materials remain explicit follow-ups.
- [x] Verification: 65 syntax checks passed. Full suite and focused runtime/asset/plan regressions are recorded in `.test-temp/appearance-full-tests.log` and `.test-temp/appearance-final-plan-tests.log`.
- [x] Native VS Code 1.143.1: textured bull/pellet loads, combined koi base/two pattern passes; interactively verify long fins, zero pattern, wild coloration and egg transition. Visual koi checks and render acknowledgements recorded in `.test-temp/appearance-preview-host.json`; copied source asset hashes unchanged. Preview evidence does not establish Minecraft runtime parity.
- [ ] General runtime query/script evaluation, behavior-state reachability guarantees, arbitrary material/shader parity and in-game visual comparisons remain follow-ups.

Local update only; preserve shared Molang/authoring work, pack sources, Marketplace and tester ZIP.

## 0.26.6 client-synced preview properties and bull visibility — October 27, 2026 (local update)

- [x] Discover enum/bool/int/float controls from the unique matching behavior entity; expose only `client_sync: true`, validate ranges/types and use literal defaults. Preserve preview overrides on saved refresh and provide reset. Private/malformed properties are excluded; computed defaults stay unresolved.
- [x] Use selected inputs in bounded property comparisons/resource branches and ordered wildcard part visibility. Substitute unique straight-line property bindings in pre_animation; no script execution or general runtime Molang evaluator. Keep unknown visibility visible and explain it.
- [x] Correct bull horn overlap by showing only the selected basic/curve/long bones. Follow a unique matching owner geometry/skin on property changes; preserve manual texture overrides and explain unresolved geometry.
- [x] Verification: 60 syntax checks passed; full suite 290 tests, 289 passed, one skipped, zero failures.
- [x] Native VS Code 1.143.1 interaction/visual inspection with copied SavageCraft bull assets: basic/curve/long horn controls, temperate/warm/cold geometry/skin changes, corresponding hidden bones and image/WebGL render acknowledgements. Evidence: `.test-temp/bull-properties-host.json`; source hashes: `.test-temp/bull-source-hashes.json`. No pack source edits or in-game parity claim.
- [ ] General scripts/queries, arithmetic property expressions, multi-controller visibility composition, live game state, animation and advanced materials remain follow-ups.

Local VS Code update only; shared Molang files, Marketplace and tester ZIP unchanged.

## 0.26.5 render-controller preview textures — October 27, 2026 (local update)

- [x] Static owner-scoped render-controller texture inference: direct aliases, ternaries, nested arrays, literal indices and correlated geometry/texture selectors. Reuse the existing Molang lexer, syntax checks and subpack binding context; no runtime evaluator.
- [x] Prefer inferred texture candidates before declared default/first texture; preserve explicit texture-file opens and manual choices. Label controller matches and explain runtime ambiguity, missing/duplicate/unsupported bindings and uncomposited layers. Recompute automatic selection on saved controller changes.
- [x] Compatible selected-pack and pinned sample controller fallback with project override priority; upgrade old preview caches.
- [x] Final syntax checks: 59 passed. Full suite: 284 tests, 283 passed, one skipped, zero failures.
- [x] Read-only SavageCraft audit: cod/salmon egg/fry match their textures; adult salmon retains ocean/river, adult cow variants match climate skins, baby cow retains three skins. Evidence: `.test-temp/controller-savagecraft-audit.json`.
- [x] Native VS Code 1.143.1: image decode/WebGL render assertions for copied cod/salmon egg/fry, vanilla adult salmon and warm/cold cow models; expected aliases and ambiguity text confirmed. Evidence: `.test-temp/controller-preview-host.json`. These checks do not establish visual or Minecraft in-game parity.
- [ ] Runtime state/variable evaluation, animation/visibility, texture-layer composition and in-game comparisons remain follow-ups.

Local installation only; preserve shared Molang work, pack sources, Marketplace and tester ZIP.

## 0.26.3 geometry viewer source actions — October 26, 2026 (local update)

- [x] Native **Open Geometry Viewer to Side** source actions above modern/legacy geometry declarations and client entity/attachable/block geometry references in JSON/JSONC.
- [x] Pass the exact geometry identifier to the side-view command, preserve ambiguous owner/texture choices, and reuse an already-open matching preview. Keep the JSON editor visible and explain that rendering uses saved resources.
- [x] Prefer the entity's default texture alias, otherwise its first texture. Direct texture-file opens take priority; preserve manual/neutral selections on refresh and retain explicit choices for duplicated asset bindings.
- [x] Trust/project scoping, exact command/range and default/manual texture regression tests. Full suite: 273 tests, 272 passed, one skipped; syntax checks passed.
- [x] Native VS Code 1.143.1: execute the action for the second geometry in a multi-model document, confirm one selected model renders in column two with JSON still in column one, verify repeat activation reuses the same panel, and verify a vanilla cod reference has the same action. Evidence: `.test-temp/preview-actions-host.json`.
- [x] Native textured render acknowledgements verify the first salmon skin without a default alias, and the default ocean skin when it is declared after the river skin. Evidence: `.test-temp/vanilla-preview-host.json` includes selected texture IDs/aliases.

Uses the standard Editor: Code Lens setting; existing title/menu actions remain available when source hints are disabled. Local installation only; no pack source edits, Marketplace publication or tester ZIP refresh.

## 0.26.2 vanilla model previews — October 26, 2026 (local update)

- [x] Resolve project bindings against compatible vanilla geometry, including legacy cod/salmon definitions. Prefer project overrides, then explicitly selected installed vanilla packs, then pinned released Mojang samples; label sources and preserve ambiguity choices.
- [x] Retain model/owner payloads in the sample reference cache; upgrade old ID-only caches on demand. Resolve vanilla owners for texture-only overrides while preserving project client definitions.
- [x] Read only approved vanilla resources, constrain paths/sizes/versions, and cache known vanilla PNGs on selection for offline use. Do not guess missing custom texture paths or scan unselected game directories.
- [x] Regression coverage for precedence, cod/salmon, reverse texture ownership, multiple sources, version limits, cache upgrades, offline behavior, traversal and malformed/oversized assets. Full suite: 269 tests, 268 passed, one skipped, zero failures; syntax checks passed.
- [x] Native VS Code 1.143.1 webview assertions: vanilla cod + vanilla texture, vanilla salmon + SavageCraft ocean skin, vanilla salmon + SavageCraft river skin; each decoded an image and drew 48 faces in 32×32 UV space. Evidence: `.test-temp/vanilla-preview-host.json`. Desktop capture was unavailable; this is rendering/load assertion evidence, not a new visual or Minecraft in-game comparison.

Local instance update only; pack sources, tester ZIP and Marketplace remain unchanged. See PREVIEW_VERIFICATION.md for source/cache behavior and remaining limitations.

## 0.26.1 preview correction — October 26, 2026 (local update)

- [x] Correct the Bedrock coordinate/rotation boundary: reflect X coordinates/pivots and convert cube/bone Euler angles to `[-X,-Y,Z]` in right-handed renderer space.
- [x] Correct east/west box atlas strips and signed top/bottom UV corner orientation, including mirrored box layouts and cube mirror overrides.
- [x] Add asymmetric six-face corner assertions, signed per-face UV tests, cow-neck angle and nested pivot regressions. Syntax checks and full suite passed: 257 tests, 256 passed, one skipped, zero failures.
- [x] Native VS Code 1.143.1 visual correction check with copied SavageCraft cow geometry/texture: tucked neck, muzzle/eyes, yellow ear tag, patch continuity, orbit and reset. Pack sources unchanged. See PREVIEW_VERIFICATION.md for hashes and reference conventions.
- [ ] Broader visual golden coverage and Minecraft in-game parity. The original first-milestone checks missed these orientation bugs; do not treat prior successful loading as proof of accuracy.

Local hotfix packaging/installation follows the existing authorization to update this VS Code instance only. Tester ZIP and Marketplace remain unchanged; installation evidence is written to `.test-temp/preview-correction-install.json`.

## Textured model preview milestone — October 26, 2026 (0.26.0 local release)

- [x] Explicit Open Model Preview and side-by-side commands in editor/Explorer; preserve normal editors.
- [x] Saved-index client entity/attachable geometry and texture discovery; reverse texture-to-model lookup; owner/geometry/texture choices and missing-binding explanations.
- [x] Custom block geometry/terrain-atlas candidates, including base/permutation choices; clearly label the single-texture material approximation.
- [x] Local WebGL static cubes, pivots, parent rotations, inflation, box/mirrored/per-face UVs and declared dimensions; crisp PNG/JPEG transparency; orbit, pan, zoom and reset.
- [x] Saved pack changes refresh panels and preserve available selections; trust gate, CSP, media-only webview roots and containment/size-checked selected images.
- [x] Conversion/binding/ambiguity/missing asset/security/refresh tests; native VS Code 1.143.1 UV fixture and copied SavageCraft platypus visual inspection. Read-only SavageCraft audit: 49 files, 97 geometries, 4,296 cube faces, 139 owner bindings.
- [ ] Broader visual golden fixtures for mirrored/per-face orientation, nested rotations, attachables and multi-material block models; native camera-pan and saved-image refresh acceptance coverage.
- [ ] TGA decoding, per-face UV rotation, polygon/texture meshes, full material routing, built-in block geometry, transforms, explicit subpack resolution and vanilla/external assets.
- [ ] Animation and visibility playback using existing Molang assistance; no second evaluator. Advanced materials and intersecting translucent surface sorting.
- [ ] Minecraft in-game comparison. Preview loading/conversion/visual checks do not establish runtime parity.

Evidence, limitations and official rendering references: [PREVIEW_VERIFICATION.md](PREVIEW_VERIFICATION.md). The initial milestone performed no distribution actions. The subsequent user request authorizes packaging and updating local VS Code only as 0.26.0; Marketplace publication and tester ZIP refresh remain excluded. Release checks: syntax passed; 252 Node tests, 251 passed, one skipped, zero failed; exact preview runtime/browser bytes and command contributions verified in the VSIX. Local installation evidence is recorded in `.test-temp/release-install-verification.json` after installation. This release preserves the shared Molang follow-up changes.

Updated: October 26, 2026. Local release source: package 0.26.7; development baseline commit d976b2c.

This current checklist is the durable source of truth. Historical sections below preserve decisions, measurements and release evidence; their proposed priorities are historical. Requests such as “mark X done” or “add Y” update this checklist and record the evidence/date. Check off implementation only with repository evidence; check off Minecraft behavior only with an actual game result.

## Completed

- [x] **C1 — Windows extension and compiler:** sidebar, standard BP/RP build, JS/TS transpilation, diagnostics, output-collision checks and trusted-workspace restrictions.
- [x] **C2 — Deployment and releases:** saved-file auto deploy, ownership/recovery safeguards, stable deploy/export, persistent beta/stable UUIDs, transactional explicit versions, icon handling. Real Release beta disk deployment recorded at 0.1.1; gameplay is separate below.
- [x] **C3 — Engine/API/experiment setup:** target checks, matching Script API typings, beta APIs and revision-stamped experiment lifecycle feed. Compiler-wide TypeScript type checking remains B5.
- [x] **C4 — Editor intelligence:** authored block/item/entity components, loot, recipes, atlases and sounds; compatible official BP/RP fallback; format/compatibility checks and explicit Quick Fixes; validation reports and intended-reference rules.
- [x] **C5 — References and language:** compatible vanilla/project IDs, geometry/assets, mcfunction completion/signatures, static function/tag/objective indexing, Molang basics, scoped navigation/rename, translations and language-key colors.
- [x] **C6 — New project wizard:** Release/Preview, scripting choices, icon/experiments, linked manifests and independent identities; cancellation and existing-folder protection covered by tests.
- [x] **C7 — 0.24.0 client entities:** independent field schema, documented 39-field/217-payload audit, asset declarations, BP/RP links, scoped animation suggestions and owned effect aliases. Full related document schemas remain N1.
- [x] **C8 — Distribution groundwork:** Windows VSIX through 0.25.0 exists locally; 0.25.0 installation confirmed through VS Code CLI and installed Molang file hashes. Logo and TESTING.md supplied. The tester ZIP remains 0.23.1 by explicit user choice; external tester acceptance remains separate.

- [x] **C9 — Molang authoring baseline (0.25.0):** owned parser, 378-entry Learn catalog, contextual completion/snippets, signature guidance, hovers, scoped references and conservative diagnostics. Corpus audit and native VS Code checks passed; 232 Node tests passed, zero failed, one skipped. Packaged and installed locally; evidence below preserves the development/release distinction. Marked done October 26, 2026 at user request.

## In progress

- [ ] **I1 — Windows integration acceptance:** implementation and automated coverage exist; close only after V1–V3 below have recorded results.
- [ ] **I2 — Comprehensive Molang authoring:** C9 remains complete. Supported follow-ups for binding traversal/navigation, runtime-actor boundaries, reviewed overload/version guidance, channel comparison, additional fields and Molang subpack overlays are implemented and verified below. Arbitrary runtime identities, undocumented contracts and full non-Molang B2 remain open.

### Molang authoring baseline — October 26, 2026, released locally in 0.25.0

- [x] Inspect existing parser/providers, tests, tracker, authoring documentation and repository/ancestor instructions; no applicable AGENTS.md found. Preserve the pre-existing tracker edits and untracked archive.
- [x] Workbench-owned lexer/parser, expression field recognition, JSON offset maps, completions/snippets, signature guidance, Learn-linked hovers and conservative syntax/restriction validation.
- [x] Independently assembled Learn catalog: 317 query entries and 61 math entries, canonical aliases, internal/legacy distinction, explicit return/arity/context facts. Reviewed Release/Preview function inventories match.
- [x] BP/RP expression coverage across animations/controllers/render controllers/client entities/attachables, plus particle fields, block/item/entity expressions, worldgen fields, geometry bindings and sound variant keys. Empty/partial expressions and subpack paths are supported.
- [x] Scoped variable/temp discovery, unique owner bindings, resource arrays/aliases, existing-provider coexistence and live/report diagnostic ownership. Unknown runtime names remain valid.
- [x] Documented property/permutation restrictions, pack min_engine_version removals and format_version 1.26.0 cross-string brace support; unknown version/experiment boundaries remain permissive.
- [x] Audit 7,863 vanilla and 721 SavageCraft JSON documents: 11,893 recognized expression strings, zero Molang findings, zero unrecognized expression-like strings. Pack sources unchanged. One used query, query.texture_frame_index, lacks a reviewed Learn catalog entry; it remains unflagged.
- [x] Full Node suite: 233 tests, 232 passed, zero failed, one skipped. Native VS Code development-host checks passed for insertion/cursor placement, nested signatures, single Learn hover, context/empty BP fields, scoped state arguments, escaped ranges and live/report ownership. Dated host evidence is recorded below.
- [x] Update README and schemas/AUTHORING.md with sources, exact coverage, regeneration and remaining gaps.
- [ ] Dynamic actor/transitive bindings, exhaustive query overload names/introduction versions, future Preview differences and active-subpack precedence. Keep these permissive until documented.

The development verification above used the 0.24.0 source version. A subsequent user request authorizes packaging and installing the Molang update locally as 0.25.0. The tester bundle remains 0.23.1 by explicit user choice; Marketplace publication is outside this local release.

### Molang follow-up — October 26, 2026, source only after 0.25.0

- [x] Read applicable instructions, tracker, authoring/audit records and existing implementation/tests; no AGENTS.md found. Preserve the completed C9 baseline and unrelated local work, including concurrent model-preview additions.
- [x] Cycle-safe potential bindings through entity dictionaries, legacy controllers, conditional render bindings and controller aliases; isolate named/shared/duplicate definitions and BP/RP scope. Navigate observed variable assignments, public declarations, state/curve variables, arrays and compound resource bindings. Overlay dirty bound JSON buffers.
- [x] Runtime actor boundary audit: suppress caller-private suggestions/navigation/property references after direct/grouped arrows, including context aliases. Navigate local temporary alias assignments without claiming a known target identity. Undocumented/runtime/external names remain permissive.
- [x] Review 21 current individual query contracts (42 stable/experimental pages); author optional-hand, rendered-item, equipment-index and cooldown overloads plus additional explicit parameter names. Document format minima and no-experiment boundaries separately from unknown engine introductions; do not infer compatibility errors.
- [x] Compare all 378 current Release/Preview table names/descriptions/math signatures and all 21 reviewed individual-page bodies. No differences verified. Support channel-specific catalog entries/overrides and review stops for divergent individual guidance; do not claim Preview parity beyond this evidence.
- [x] Cover empty/constant particle curves/events/pre-effect expressions, scatter chance/coordinate extents and normalized subpack paths. Exclude animation interpolation/hold enums from Molang assistance. Original recognizer comparison: 2,234 enum strings excluded; one constant scatter-chance string added.
- [x] Molang portion of B2: user-friendly authoring resource-subpack picker and schema, declared selection/base default, edited-file context, whole-file overrides, base fallback, sibling isolation, duplicate ambiguity and dirty-buffer refresh. Authoring selection does not modify pack files or Minecraft/build selection.
- [x] Relevant regressions passed (54/54) and the final current workspace suite passed: 252 tests, 251 passed, zero failed, one skipped, including preserved concurrent preview tests. Native authoring-only VS Code host/wrapper passed against shared source 0.26.0 at 3:41:49 PM CDT (20:41:49Z), including baseline insertion/cursor/escape/diagnostic ownership, overloads, subpack picker/overlays, dirty files, variable/resource navigation, single hover and grouped actor boundary. No build/deployment commands were run in that host.
- [x] Repeat compatible Mojang v1.26.50.4 and SavageCraft audits: 8,584 JSON documents, 9,660 actual expression strings (8,015 vanilla / 1,645 project), zero Molang findings and zero unrecognized expression-like strings. All 1,595 project pack files hash-identical. No gameplay verification claimed.
- [ ] Remaining: arbitrary actor identities/computed bindings; query contracts beyond the 21 reviewed, explicit first-engine introductions and undocumented query.texture_frame_index; other asset-consumer ownership; general non-Molang reference/index precedence under B2. Keep unknowns permissive.

This Molang task does not bump versions, package, install, publish, deploy or refresh testers. Concurrent model-preview work advanced the shared source metadata to 0.26.0; that unrelated change is preserved, not attributed to this follow-up. Current-source verification is recorded separately from the completed 0.25.0 baseline. Detailed follow-up evidence is appended to schemas/MOLANG_AUDIT.json; the original baseline audit is preserved.

## Next

Proposed order pending user priority; these are not commitments to implement or publish.

- [ ] **N1 — Related resource document authoring:** extend independent schemas/field inventories to animations, animation controllers, render controllers and attachables. Accept when each selected family has pinned Learn/sample coverage, legacy/current valid and invalid fixtures, correct BP/RP routing, native editor hover/completion checks and packaged-route verification.
- [ ] **N2 — 0.24.0 acceptance evidence:** record a version/date-stamped native VS Code host run for client schema hovers, asset navigation, effect ownership and BP/RP scoping; verify the installed VSIX version. Existing host test code is coverage, not proof of a fresh run. Record failures as separate actionable items.

## Backlog

- [ ] **B1 — Preview references/schema selection:** choose compatible channel/version snapshots with provenance, offline fallback and regression tests proving incompatible newer data is excluded. Current Preview fallback uses compatible released data.
- [ ] **B2 — Subpack precedence:** Molang overlays/ownership/navigation are implemented and verified in the follow-up above. Remaining: extend the same declared file-level selection policy to general asset/localization/reference indexes and their missing/duplicate diagnostics; do not silently merge sibling subpacks or choose a device tier.
- [ ] **B3 — Deeper schema/semantic audits:** historical removals, shape changes, experiments, component payloads and cross-permutation rules; recipe pattern/key consistency and kind exclusivity; Education/material reduction and legacy/server sounds. Close individually with cited boundaries plus valid/invalid versioned fixtures, retaining permissive unknowns.
- [ ] **B4 — Static/runtime reference gaps:** script custom commands, dynamic/helper registrations, unsaved script parameter inference, external types and optional explicit definitions. Accept each supported pattern with navigation/completion tests and conservative handling of ambiguous ownership; avoid executing project scripts.
- [ ] **B5 — Compiler type checking:** optional project-level TypeScript check with matching dependency setup and actionable errors; demonstrate valid/invalid projects while preserving existing transpile behavior.
- [ ] **B6 — Performance and release history:** profile real rebuilds before selecting incremental compilation; consider release ledger/artifact browser after release workflow feedback. Accept measured improvement without stale output, or a versioned ledger with recoverable artifact paths.
- [ ] **B8 — Molang follow-up coverage:** supported static/transitive bindings, runtime-actor privacy boundaries, 21 query contracts, current channel comparison and additional fields are done above. Remaining: documented arbitrary actor identity relations, other asset-consumer ownership, individual contracts for the rest of the query catalog, explicit engine introductions/experiment boundaries and query.texture_frame_index. Review actual future channel differences when they exist. These tasks do not reopen C9; general subpack precedence remains B2.
- [ ] **B7 — Other platforms:** follow Windows acceptance; require platform-specific discovery, safe deployment/recovery and editor/package checks before claiming support.

## Blocked / needs user verification

These require user/game evidence, not additional source-code checkboxes.

- [ ] **V1 — SavageCraft in Minecraft:** record extension/game versions, Release or Preview, world experiments and content-log result; load BP/RP, exercise scripts/entities/items/blocks and confirm saved edits after world reload. A successful build or disk deploy alone does not pass.
- [ ] **V2 — Stable import/update:** import an exported mcaddon and test stable direct deployment separately; confirm stable identity/color icons, beta coexistence, linked packs and existing-world/player upgrade behavior without unwanted duplicate packs. Retain source stable UUID policy already decided.
- [ ] **V3 — External tester smoke test:** follow TESTING.md using the intended VSIX; test new/existing projects, build, deployment and stable export; record environment, actual results and defects. Do not infer completion from the existing tester ZIP.
- [ ] **V4 — Migration runtime compatibility:** initial copy/cleanup is recorded; capture any remaining bridge-only content or runtime errors in the separate SavageCraft copy before claiming full migration compatibility. Preserve the original project.

## Evidence and limits

- Reviewed full PROJECT_TRACKER.md, README.md, CHANGELOG.md, package.json and TESTING.md, recent commits and workspace status. No applicable AGENTS.md was found in the workspace or its ancestor directories.
- package.json and changelog now agree on local release 0.25.0; commit d976b2c is the earlier client-resource baseline. Molang development and local installation evidence is recorded below. No Minecraft gameplay result is inferred.
- HOST_VERIFICATION.json records earlier activation/build/auto-deploy/schema/reference/Molang checks but has no package version or timestamp; do not treat it as comprehensive 0.24.0 acceptance.
- Historical SavageCraft audits report 721 JSON files, zero errors/warnings, with ten intended informational references; those are historical audit results, not a new game validation.
- Fresh checks on October 26, 2026: npm run check passed; npm test completed with 214 tests, 213 passed, 0 failed and 1 skipped. Native VS Code host, package verification and Minecraft were not rerun. No release, deployment or product feature changes were performed.
- Subsequent Molang development verification, October 26, 2026: npm run check and git diff --check passed; npm test completed with 233 tests, 232 passed, zero failed and one skipped. Native VS Code host and its wrapper exited 0 at 12:58:02 PM CDT (17:58:02Z). `schemas/MOLANG_AUDIT.json` preserves corpus counts and host assertions. The wrapper now finds VS Code through PATH when LOCALAPPDATA is sandbox-remapped, retains its Windows process handle for ExitCode, and uses bounded 30-second waits with a three-minute cap. No packaging, installation, publication, tester refresh or real Minecraft deployment was performed; host deployment tests use an isolated fake destination.
- Subsequent authorized local release, October 26, 2026, 1:13 PM CDT: packaged and installed 0.25.0. Package verification passed, including a buildable starter project, isolated SavageCraft compilation, owned Molang catalog/snippet checks and bundled tracker availability. VS Code CLI reports `bsavage81.bedrock-workbench@0.25.0`; installed Molang implementation/catalog hashes match source. VSIX SHA-256: `8d5fcdaa0f82c5afc197b2d44bf5909ceac401c6dfb501298bc32c42071c6ef0`. Packaging used an isolated staging folder to avoid traversing accumulated test fixtures. Tester ZIP remains 0.23.1 with unchanged SHA-256 `60a3c841f57306c3042385234ef04ae4d9c36402f78bf03ce3c2334f3abbdc47`. No Marketplace publication or remote repository push. Detailed local evidence is in `.test-temp/local-release-result.json`.
- Existing untracked `Minecraft Bedrock VSCode Extension.7z` is preserved.

---
## Historical implementation notes (preserved)

Item authoring in 0.15.0: original 52-component item schema, nested Learn hovers, structural constraints and legacy unions; contextual block/item/entity/atlas/sound lists and existing project tag suggestions; array starters; custom item component/parameter parity. All 79 Mojang and 64 SavageCraft item examples pass, and supported references in Mojang's item examples resolve against the matching catalog. Native VS Code checks cover built-ins, custom registries/parameters, live saved-script updates, and source navigation during project refresh. Full 721-file SavageCraft validation reports zero errors/warnings and honors its existing ten intended-reference rules. Release authorized October 24, 2026.

Included in 0.14.1: remove duplicate JSON syntax Problems from build/project validation when VS Code's enabled JSON service owns an open JSON/JSONC document. Workbench still records syntax failures in saved reports and reports closed files or files without native JSON validation. Native VS Code verification confirms one ValueExpected diagnostic after both Validate Pack and Build.

Included in 0.14.0: recognize legacy names and asset paths used by vanilla samples without duplicating completion aliases; normalize item auxiliary-data and entity spawn-event suffixes. Reference cache version 4/local index version 2 refresh old data. SavageCraft rerun: 721 JSON files, 0 errors, 0 warnings, 10 informational findings (previously 185). Remaining findings are numbered villager textures absent from the project and matching Mojang release. Source pack files unchanged; cache and validation report updated.

Included in 0.13.0: collision_box array/object starter completions and a clearer multi-box hover are fixed locally and verified in VS Code. Publication authorized October 24, 2026.

Also included in 0.13.0: custom parameter/reference value completions and new-key snippets supply missing commas before following object properties or array entries, preserving existing commas and skipping JSONC comments. String values are inserted with complete escaped quotes. Unit and native VS Code acceptance checks pass; release verification completed before distribution.

Vanilla validation in 0.13.0: released samples now index full supported vanilla resource identifiers, namespaced unknowns are informational rather than silently skipped, and validation reports list sources. Added an opt-in read-only installed-pack selector with machine-local Release/Preview persistence, declared-version filtering, size limits, and disconnect support. User game directories have not been scanned; tests use isolated fixtures. Included in the authorized 0.13.0 release.

Historical baseline: October 23, 2026; reconciled October 26, 2026.

## Goal

A Windows-first VS Code extension for standard Minecraft Bedrock add-ons, with a compiler we own, TypeScript support, JSON assistance, and a project sidebar.

## Decisions

- Development builds are beta; distributed releases are stable.
- A project's settings select Minecraft Release or Preview independently of its beta/stable build profile.
- Deploy beta automatically on saved or external file changes, additions, and deletions. Unsaved editor buffers are not deployed.
- Export stable builds as `.mcaddon` files.
- Preserve distinct, persistent beta and stable UUID sets, including module identities and cross-pack dependencies.
- Explicit `major.minor.patch` pack versions. Saves never increment versions. Track beta build counts separately from manifest versions. Stable version changes must be deliberate.
- Manual beta/stable deployment and stable export ask for a version. Successful actions synchronize project/source manifests. Bump version uses the same transaction for header/module/linked dependency versions. Stable actions refresh beta locally or redeploy it when auto-deploy is enabled.
- Deploy stable writes directly into the selected installation's regular `behavior_packs`/`resource_packs` folders, with independent stable ownership and UUIDs.
- BP and RP icons are selected from the sidebar and copied into their source packs as `pack_icon.png`. Stable keeps the source colors; beta always grayscales during compilation. No beta-specific icon option. Legacy stable icon selections are migrated into source packs and obsolete profile icon fields are removed.
- The sidebar project row uses the BP icon, falling back to RP. Project and BP/RP thumbnails use content-based cache keys so replacing an icon at the same path refreshes the displayed image.
- Sidebar controls are grouped under collapsible Settings, Pack icons, Beta development, Stable releases, and Project tools headings. Project name/version and build status remain visible at the top. Stable section IDs preserve user expansion choices across updates.
- Development folders and titles use `<profile title> beta <version> BP/RP`. Stable mcaddon filenames and their contained pack folders use the stable title and version without the beta label. Previous owned deployment names are migrated so versions do not leave duplicate packs.
- Standard custom components and commands use the Bedrock Script API. No bridge compiler plugin compatibility requirement.
- Start with Windows, then expand platform support after the initial phase.
- Use a separate SavageCraft copy; preserve the original bridge project.

## Milestones

| Milestone | Status | Acceptance criteria |
| --- | --- | --- |
| Requirements and tracker | Complete | Agreed scope and durable tracker |
| SavageCraft working copy | Complete | 25,193 files verified by SHA-256 before cleanup; bridge tooling removed; migration report recorded |
| Extension foundation | Implemented and tested | VSIX, F5 launch configuration, trusted-workspace handling; activated in VS Code |
| Project settings and sidebar | Implemented | Settings, status and tasks only; Release/Preview target, profile settings and commands. File editing uses VS Code's standard Explorer. |
| Compiler and TypeScript | Implemented and tested | Standard pack compilation, Script API imports preserved, diagnostics; SavageCraft beta build succeeds |
| Beta deployment | Implemented and tested | Debounced serialized builds; ownership checks, in-place file synchronization, stale file removal, two-pack recovery; deployed successfully to the selected real Minecraft Release folders with v0.1.1 |
| Stable deploy/export | Implemented and tested | Direct stable deployment to regular pack folders or mcaddon export; version prompt, profile UUIDs, dependency rewriting and ownership checks |
| Version management | Implemented and tested | Central project/source manifest updates, linked dependency versions, selected release versions and beta refresh; separate local build counter; editor saves leave pack version unchanged |
| JSON autocomplete/validation | Expanded through 0.24.0 | Authored block/item/entity/client schemas, recipes, loot, atlases and sounds; official fallback, project/vanilla references, format checks and localization. Remaining audits are in the current checklist. |
| Integration verification | Partially complete | Compiler tests and VS Code host tests pass; real Minecraft deployment/import and in-game checks remain |

## Test project

Working copy: `projects/SavageCraft v2` (excluded from this extension repository).

Original: `C:\Users\beauj\AppData\Local\com.bridge.dev\bridge\projects\SavageCraft v2`.

Preserve artwork, models, scripts, reviews, audits, backups, and reference material. Only pack source directories should enter builds. Historical documents may mention bridge without constituting a runtime dependency.

## Open implementation questions

- Resolved policy: initialization retains source identities for stable and generates separate beta identities. Existing-player upgrade compatibility still needs in-game confirmation.
- Check for bridge-only syntax in pack content before declaring migration complete.
- Delivered: JavaScript/TypeScript output collisions are build errors (compiler regression coverage).
- Do not claim a selected Minecraft engine version is fully validated until content schemas and Script API versions are checked.
- Automatic deployment updates files on disk; Minecraft may require a world reload to observe changes.

## Verification

- Compiler regression coverage includes directory-junction rejection, two-pack recovery, output collisions, export overwrite prevention, root-directory locks, transient file locks, unchanged files, retained recovery snapshots, file/directory shape changes, human-readable names, owned-folder migration, migration rollback, and unowned name collisions. Restricted environments skip only the junction-creation test.
- VS Code Extension Development Host verifies activation, registered commands, manual builds, automatic create/change/editor-save/delete deployment, unchanged pack version, manifest completions, and schema validation. Results: `HOST_VERIFICATION.json`.
- SavageCraft beta compilation succeeds. Stable artifacts are produced inside the copy's `.bedrock/exports` directory; v0.1.4 uses the human-readable filename `SavageCraft v2 1.0.0.mcaddon`.
- The user enabled automatic deployment in the working project and selected the Minecraft Release folder. After the v0.1.1 EPERM fix, deployment to both real owned beta pack folders succeeded. In-game behavior has not been verified.
- `COPY_VERIFICATION.json` records the initial copy check; the copy's `MIGRATION_REPORT.json` records cleanup.

## Next checks and follow-up work

- v0.1.1 fixes reported Windows EPERM errors by keeping deployed pack root directories in place. Real Release deployment succeeded, and the update was installed locally. Reload VS Code to activate the updated extension in existing windows. File-level write locks can still require closing the world or game.
- Test SavageCraft inside Minecraft Release or Preview; verify world reload and stable import behavior.
- Expand Bedrock content schemas and project-aware file associations beyond the foundational schemas and conventional BP layout.
- Add TypeScript project type checking and better dependency/type-package setup. Current compiler transpiles TS and reports syntax errors; VS Code supplies project type checking.
- Add incremental compilation if full-pack rebuild performance warrants it. Automatic changes are coalesced while builds run.
- Consider a release ledger and historical artifact browser after the explicit version workflow has been exercised.
- Platform expansion follows completion of the Windows phase.

## October 23: engine checks and documentation intelligence

- [x] Check current released engine on opening; ask before synchronizing target and source minimum-engine versions.
- [x] Fetch/cache released Mojang references at or below the project target, with offline fallback.
- [x] Generate conservative component/field schemas from documentation metadata and official item schemas; preserve unrelated workspace associations.
- [x] Provide component/field completions, hovers, and explicit component spelling Quick Fixes.
- [x] Verify editor behavior in an isolated VS Code host.
- [ ] Preview-specific reference data remains; broader compatible released vanilla suggestions delivered in 0.7.0–0.14.0.
- [x] Expand beyond BP blocks/entities/items: official BP/RP fallback plus authored recipes, loot, atlases, sounds and client entities delivered through 0.24.0.

## October 23: Script API dependencies and world experiments

- [x] Per-project Beta Script APIs toggle, synchronized with the Beta APIs world requirement.
- [x] Script dependencies sidebar: listed manifest modules, add module, version check, exact typings installation.
- [x] Prompt on project opening/settings changes for Script API updates based on Release/Preview and regular/beta API choices.
- [x] Transactional manifest changes, stale-prompt protection, dirty-buffer protection, explicit npm install prefix, and disabled lifecycle scripts.
- [x] Individual world experiment requirements filtered by target, retaining saved legacy/custom settings.
- [x] Verify Release and Preview beta npm installations in isolated project folders.
- [x] Superseded by the revision-stamped wiki lifecycle feed below; no authoritative machine-readable catalog is claimed.

## October 23: live experiment reference and checkbox controls

- [x] Verify current Bedrock experiments against the user-supplied Minecraft Wiki page and official lifecycle notes.
- [x] Revision-stamped wiki API updates with Bedrock-only parsing, Release/Preview history, retired entries, and cache fallback.
- [x] Prompt to select new experiment requirements; remember reviewed entries and snooze deferred prompts.
- [x] Refresh on opening/target changes and while VS Code remains open; provide manual Check experiments task.
- [x] Use native sidebar checkboxes with explicit state persistence; show removed requirements without toggle controls.
- [x] Separate cleanup prompt for retired requirements and preserve unverified/custom saved settings.

The earlier static-catalog follow-up is superseded by the revision-stamped wiki source. Unsupported source-layout changes retain the last good catalog and require a parser update.

## October 23: Mojang Creator Tools review

Reviewed [Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) and its published packages. The table records the initial integration priorities; delivered work and remaining limits are recorded under **Creator Tools integration delivered** below.

| Priority | Useful source | Proposed use |
| --- | --- | --- |
| Next | [`@minecraft/bedrock-schemas`](https://github.com/Mojang/bedrock-schemas) and [schema mappings](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/schema/PackageSchemaMapping.ts) | Broaden BP/RP completion, hovers, and validation to recipes, loot tables, spawn rules, particles, models, animations, textures, sounds, and other supported files. Select a compatible release/channel and preserve custom pack paths. |
| Next | [Validation command](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/cli/commands/validate/ValidateCommand.ts) and [manifest checks](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/info/projectGenerators/checkManifest/CheckManifestGenerator.ts) | Evaluate an optional explicit validation task and map useful results into VS Code Problems. Retain our compiler, deployment ownership, UUID profiles, and transactional version changes. |
| Later | [Cross-reference completions](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/langcore/json/CrossReferenceCompletionSource.ts), [JSON diagnostics](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/langcore/json/JsonDiagnostics.ts), and [hovers](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/langcore/json/JsonHoverContent.ts) | Suggest project-defined identifiers and detect broken texture/entity/animation references. |
| Later | [Molang parser](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/langcore/molang/MolangParser.ts) | Add expression diagnostics and targeted editor assistance after evaluating language-core dependencies and version handling. |
| Reference | [ScriptModuleManager](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/manager/ScriptModuleManager.ts) | Compare manifest/npm consistency checks with our existing Release/Preview and regular/beta selection. Do not replace engine-specific selection with an unconditional latest-version update. |

The [experimental flag validator](https://github.com/Mojang/minecraft-creator-tools/blob/main/app/src/info/projectGenerators/checkExperimentalFlagInfo/CheckExperimentalFlagInfoGenerator.ts) inspects whether world experimental gameplay is/was enabled. It is not a live experiment availability catalog, so it does not replace our current wiki/version-history source.

Registry verification on October 23, 2026: `@minecraft/bedrock-schemas` latest = `1.26.50`, beta = `1.26.60-beta.28`; `@minecraft/creator-tools` latest = `0.20.0`. The schema package reports approximately 13.3 MB unpacked, while Creator Tools reports approximately 163.2 MB before its dependencies. Start by evaluating the schema package separately to keep the extension compact. Published tags can change; resolve them again during implementation.

The repository [license](https://github.com/Mojang/minecraft-creator-tools/blob/main/LICENSE.md) is MIT for code, with a separate Minecraft EULA notice for assets under `res/latest/van`. Any reused code must retain the required notices; evaluate assets separately. No external code was copied, package installed, or compiler replaced during this review.

## October 23: Creator Tools integration delivered

- [x] Bundle official Bedrock schema data 1.26.50, scoped to compatible engine targets and configured pack paths, with offline availability.
- [x] Expand BP/RP structural completion, hovers, and validation through a conservative compatibility layer for upstream schema defects.
- [x] Add Validate project to Project tools; show findings in Problems and a local report without deploying or rewriting sources.
- [x] Add project reference indexing, completions, hovers, and Go to Definition for supported identifiers/resources.
- [x] Reuse Mojang's Molang parser/query/math reference with pinned provenance and MIT notices.
- [x] Use incremental updates after the initial index; verify actual SavageCraft content and a VS Code host.
- [ ] Dynamically select/download compatible official schema package releases or Preview snapshots.
- [x] Vanilla identifier resolution delivered through compatible released samples and optional selected installed packs (0.7.0–0.14.0).
- [ ] Subpack precedence remains open.
- [ ] Add deeper audited nested semantic checks as upstream schemas improve.

Measured on SavageCraft during development: 721 JSON documents indexed in about 1.2 seconds, a single saved-file refresh about 10 ms. Full saved-project validation reported no errors/warnings; informational unresolved-reference findings remain qualified as possibly provided by Minecraft/other packs. Measurements vary by machine and cache state.

## October 23: Blockception reference review (no code reuse)

Reviewed the language-server README, feature documentation, vanilla-data README, and separate schema repository documentation. No Blockception implementation, dependency, or schema data was copied into the extension.

- [x] Functions, sounds, particles, literal tags and scoreboard objectives delivered.
- [ ] Script-registered custom command discovery remains open.
- [x] Independent metadata-backed `.mcfunction` completion/signature help, selectors and nested execute delivered; full command validation remains outside this scope.
- [x] Compatible released vanilla metadata, provenance and offline caches delivered.
- [ ] Consider explicit external/runtime definitions in our existing project configuration for values that cannot be discovered from source.

Useful data sources: [Mojang metadata](https://github.com/Mojang/bedrock-samples/tree/main/metadata) includes command, Molang, and vanilla-data modules. Select a compatible sample release rather than following `main` unconditionally. Blockception's [schema mappings](https://github.com/Blockception/Minecraft-bedrock-json-schemas/blob/main/vscode-settings.json) document raw GitHub schema URLs; these are static data resources, not a hosted validation API. Their vanilla-data package is a bundled TypeScript library, not a documented remote service.

Keep Mojang data as the primary source. Any future optional Blockception schema use needs a separate decision: consuming schemas is reuse of third-party data even without copying implementation. The schema repository LICENSE is BSD-3-Clause, and its README additionally references Microsoft documentation CC-BY-4.0/MIT licensing. Preserve applicable attribution and pin a reviewed revision before distribution. No documented hosted language-service endpoint was found in the materials reviewed.

## October 23: independent editor assistance and repository delivered

- [x] Vanilla item/block/entity and other identifier metadata extracted from compatible released Mojang samples, cached with the component reference.
- [x] Vanilla identifiers combined with project IDs in supported JSON value completion contexts.
- [x] Independent mcfunction tokenization, metadata argument completion and signature help, nested execute chains, selector type/tag values, and position arguments.
- [x] Incremental indexing for functions, literal objective/tag declarations, sounds, and particles.
- [x] Original loot-table schema replaces the corresponding official route; schema authoring/migration guide records provenance and constraints.
- [x] Private bsavage81/bedrock-workbench GitHub repository and Windows CI configuration.
- [ ] Broader independently authored schema coverage, with versioned fixtures for each replacement.
- [ ] Statically discover script-registered custom commands and configurable runtime/external definitions.

Preview currently uses compatible released reference data. Command assistance is not a complete command validator; dynamic identifiers and unsupported parameter types remain open. No Blockception implementation or schema data is included.

## October 23: authored schema coverage 0.9.0

- [x] Independently authored schemas for seven recipe variants, item/terrain texture atlases, and client sound definitions replace their official entry points.
- [x] Preserve legacy version strings, string/object ingredients, tag ingredients, object/array unlock forms, tinted texture paths, nullable sound distances, and extension fields.
- [x] Add valid/invalid regression cases, test real runtime routes with custom pack folders, and verify native JSON diagnostics/hovers.
- [x] Reproducible original schema generator and CI check for stale generated JSON.
- [x] Compatibility audit: all 1,895 relevant Mojang v1.26.50.4 sample documents and all 40 relevant SavageCraft documents passed. No add-on source files were changed by this audit.
- [ ] Pattern/key consistency, recipe-kind exclusivity, engine-specific feature availability, and deeper semantic checks.
- [ ] Material reduction/Education recipes, legacy flat sound layouts, and server sound definitions.
- [x] Original block/item/entity component schemas and older-target owned routes delivered through 0.18.0; further payload audits remain open.

Primary references, exact audited scope, and regeneration instructions are recorded in schemas/AUTHORING.md. Unknown extensions remain allowed; validation does not guarantee runtime behavior.

## October 24: original blocks and script-registered components (0.10.0)

- [x] Original block document/state/trait/permutation schema and 23 common components.
- [x] Preserve custom parameters, legacy unions and unknown native/custom extensions.
- [x] Parse JS/TS component registrations without executing project scripts; resolve registry aliases and local/imported constants.
- [x] Separate block/item registries, complete IDs in normal/permutation/legacy contexts, and provide source hover/navigation.
- [x] Refresh registry data after saved source/import changes, renames and deletions.
- [x] Prevent overlapping generated component rules from weakening authored block validation or duplicating assistance.
- [x] Verify 98 Mojang block examples, five SavageCraft blocks, all five SavageCraft block registrations and full 721-document saved-project validation.
- [ ] Broader block component coverage, format-specific availability and cross-permutation semantic checks.
- [ ] Dynamic/helper-generated registration IDs and optional explicit custom parameter schemas; unsaved script overlays.

Exact supported patterns, exclusions and sources are documented in schemas/AUTHORING.md.

## Completed in 0.11.0

- [x] Pack and compatible vanilla block geometry suggestions, including permutations and identifier objects.
- [x] Context-aware terrain/item atlas suggestions and precise project source navigation.
- [x] Custom block/item parameter completions, nested fields, advisory type/example hovers, and source navigation from saved scripts/types and project definitions.
- [x] Unit and native VS Code host verification for custom parameter keys, nested keys, boolean values, hovers, geometry, and material textures.

Remaining: general function argument flow, external package types, unsaved script inference, and additional texture field contexts.

## Completed in 0.12.0 — block audit and completion fixes

- [x] Quoted custom key acceptance inserts a value snippet and opens value suggestions.
- [x] Disable unrelated word-based JSON/JSONC completions in Bedrock workspaces; parameterless custom objects remain quiet.
- [x] Expand authored block rules to 46 components, nested hovers, enum choices, geometry/material visual reuse, and block/item descriptor completions.
- [x] 103 real block examples validated; unit and VS Code host checks passed.
- Release packaging and local installation authorized October 24, 2026.

- [x] Microsoft Learn is a primary requirements source. Component and nested-field documentation links use the official stable Learn pages, with bundled URL metadata and legacy-page coverage.

## 0.14.0 intended references

- Mark as intended Quick Fixes support exact file or project scope.
- Rules are reviewable in project settings, with optional reasons.
- Live checks and validation reports share suppression rules; syntax/schema findings are preserved.
- Native VS Code verification covers both scopes, reports, and removing rules.

### Creative inventory groups

- [x] Vanilla and saved custom catalog group suggestions for block/item menu categories, with legacy spelling by format version.
- [x] Original crafting catalog schema, group starters, icon/content item references, custom group navigation, and refresh on catalog changes.
- [x] New/custom group names remain valid, including names supplied by other packs.

### Format compatibility

- [x] A shared format engine checks declared JSON document versions against the target engine and uses explicit official component/field minima for block/item/entity suggestions and warnings.
- [x] Check root components, block permutations and entity component groups; distinguish field requirements from whole-component requirements, including material instance nesting.
- [x] Apply native JSON schema conditionals to audited shapes and filter metadata/script completions; legacy direct custom-component syntax gets migration warnings.
- [x] Suggest document formats from matching compatible samples, saved files of the same family, and documented BP component boundaries. Keep manifests' numeric schema versions separate.
- [x] Remove unversioned static BP schema overlap and preserve owned schema authoring for older targets without attaching the newer Mojang fallback catalog.
- [ ] Continue auditing historical removals, shape changes, experiment-specific exceptions and unsupported document families. Unknown requirements remain permissive.

### Version-specific component shapes and requirements

- [x] Modern/legacy material ambient-occlusion types and bounds, nested visual materials, field/value rename suggestions, and corrected visual-rotation state names.
- [x] Companion components with permutation inheritance; root-only consumer restrictions; removed food fields and legacy charge behavior warnings.
- [x] Experiment requirements with documented stable boundaries and vanilla/custom voxel-shape distinctions.
- [x] Explicit Quick Fixes for safe renames, boolean conversions, supported project requirements and file format updates within the target ceiling.
- [x] Preserve conflicts and event-based migrations for manual work; retain JSONC comments/unrelated values; omit source edits from saved reports.

### Entity authoring and pack translations

- [x] Original rules for 84 entity components/AI goals, nested events, component groups, filters and properties, with version-aware Learn hovers.
- [x] Conservative self-event/group/property references; enum/boolean values; aliases and state navigation across linked clients/controllers.
- [x] Language-key parsing, raw-message/display-name key suggestions and English-first multilingual hovers, including dirty language buffers.
- [x] Scoped F2/reference support, known project-wide ID renames, standard translated-name synchronization and unambiguous linked property/alias updates.
- [x] Reject collisions/shared binding ambiguity and keep dynamic/external references permissive.
- [x] Audit 128 Mojang and 53 SavageCraft entity examples; inspect the 721-file project without modifying source entities.
- [ ] Broaden component payload audits beyond the curated set and resolve dynamic script/timeline bindings only with reliable ownership evidence.

### New project setup

- [x] Separate Create New Project and Initialize Existing Project commands and welcome actions.
- [x] New-project name/location, shared starter icon, Release/Preview target and JavaScript/TypeScript/no-script choices.
- [x] Target-matched stable/beta Script API dependency selection, optional typings installation and explicit offline version entry.
- [x] Filter experiment choices by lifecycle and channel; record requirements and keep Minecraft world settings separate.
- [x] Generate BP/RP folders, linked manifests, stable/beta UUID profiles, icons, language files and starter code with version 1.0.0.
- [x] Review before writing, cancellation without creating files, exclusive destination ownership and preservation of existing folders.

### Resource-pack client entities

- [x] Independent client-entity schema with Learn field hovers and legacy/current layouts.
- [x] Audit 39 documented fields and 217 vanilla/project client payloads, including detection of newly documented or sampled fields.
- [x] Material declarations, spawn-egg atlas keys, effect references, exact declaration navigation and bidirectional BP/client links.
- [x] BP/RP-scoped animation suggestions, ownership-based sound/particle aliases and legacy controller bindings.
- [x] Reuse Molang assistance in render controllers.
- [ ] Extend independent payload schemas and field inventories to full animation, animation-controller, render-controller and attachable documents.

Material preview development (October 28, 2026): controller passes now carry ordered per-bone material bindings. Basic built-in opaque, cutout, emissive and translucent profiles are recognized; translucent faces disable depth writes and allow equal-depth controller overlays. Unknown/custom/conditional materials are disclosed as approximations. Emissive profiles remain unlit in the current unlit renderer; selective emissive lighting, material inheritance, multi-texture shader routing, villager2 visual acceptance and native-host verification remain unfinished. This source change has not been packaged or installed. Focused checks: `.test-temp/material-tests.log`.

Appearance component selectors (October 28, source development): uniquely matched behavior entities expose authored color, color2, variant, mark_variant and skin_id values from base components/component groups. Base values initialize defaults; group-only values require a choice. Inputs map to matching query reads and appear only when referenced by reachable controller branches. Group combinations are static possibilities, not behavior-event reachability guarantees. Tropical-fish multi-texture color blending remains unfinished; the official controller uses two texture samplers, not a single emissive texture. Not packaged/installed. Checks: `.test-temp/fish-input-tests.log`.

Material parity implementation remains in development: inheritance utility now handles replacement and additive/subtractive states/defines with cycle detection; villager_v2 material profiles use LessEqual depth testing. Ten focused tests passed (`.test-temp/material-inheritance-tests.log`). Runtime material-file discovery/inheritance integration, two-sampler tint shaders, selective emissive lighting and native visual verification remain incomplete. No package or local installation update.

Material source integration (source development): preview now loads JSONC material definitions from the explicitly selected vanilla resource-pack materials directory and project materials, resolves inherited defines/states, and passes depth/culling/depth-write flags into rendering. Project definitions override vanilla definitions by material name. Missing/unknown profiles remain approximations. Multi-texture shading/tinting and native acceptance remain unfinished; no installation update.

Material composition development: two resolved controller texture slots now flow into local PNG/TGA composition with masking and multiplicative tint profiles, palette color/color2 inputs, and alpha-derived emissive preview shading. Twelve focused tests and a composition pixel assertion passed. Current limitations: material composition uses the first bone profile for a pass; exact tropical-fish shader formula/palette and native acceptance are unverified. This is not complete game parity and has not been installed.

Per-bone composition completed (October 28, 2026): resolved material profiles now partition a controller into independent bone groups with separate composed textures, while retaining all parent transforms and controller visibility. Native VS Code 1.143.1 decoded and rendered adjacent bones with distinct material profiles as two independent one-face passes (two faces total); evidence `.test-temp/per-bone-native.json`. Focused suite: 21 passed, one skipped (`.test-temp/per-bone-tests.log`). This is native image/WebGL rendering verification, not a screenshot comparison or Minecraft parity claim. Source change not packaged/installed.
