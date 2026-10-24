# Bedrock VS Code Extension — project tracker

Included in 0.13.0: collision_box array/object starter completions and a clearer multi-box hover are fixed locally and verified in VS Code. Publication authorized October 24, 2026.

Also included in 0.13.0: custom parameter/reference value completions and new-key snippets supply missing commas before following object properties or array entries, preserving existing commas and skipping JSONC comments. String values are inserted with complete escaped quotes. Unit and native VS Code acceptance checks pass; release verification completed before distribution.

Vanilla validation in 0.13.0: released samples now index full supported vanilla resource identifiers, namespaced unknowns are informational rather than silently skipped, and validation reports list sources. Added an opt-in read-only installed-pack selector with machine-local Release/Preview persistence, declared-version filtering, size limits, and disconnect support. User game directories have not been scanned; tests use isolated fixtures. Included in the authorized 0.13.0 release.

Updated: October 23, 2026

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
| JSON autocomplete/validation | Foundation implemented | Project and manifest schemas; partial item/block/entity schemas; schema completion and diagnostics verified in VS Code |
| Integration verification | Partially complete | Compiler tests and VS Code host tests pass; real Minecraft deployment/import and in-game checks remain |

## Test project

Working copy: `projects/SavageCraft v2` (excluded from this extension repository).

Original: `C:\Users\beauj\AppData\Local\com.bridge.dev\bridge\projects\SavageCraft v2`.

Preserve artwork, models, scripts, reviews, audits, backups, and reference material. Only pack source directories should enter builds. Historical documents may mention bridge without constituting a runtime dependency.

## Open implementation questions

- Confirm which existing stable UUIDs should be retained for players already using SavageCraft. Default: retain source identities for stable, generate separate beta identities.
- Check for bridge-only syntax in pack content before declaring migration complete.
- Resolve JavaScript/TypeScript filename collisions as build errors rather than silently overwriting.
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
- [ ] Preview-specific reference data and broader vanilla identifier suggestions.
- [ ] Expand coverage beyond behavior-pack blocks, entities, and items.

## October 23: Script API dependencies and world experiments

- [x] Per-project Beta Script APIs toggle, synchronized with the Beta APIs world requirement.
- [x] Script dependencies sidebar: listed manifest modules, add module, version check, exact typings installation.
- [x] Prompt on project opening/settings changes for Script API updates based on Release/Preview and regular/beta API choices.
- [x] Transactional manifest changes, stale-prompt protection, dirty-buffer protection, explicit npm install prefix, and disabled lifecycle scripts.
- [x] Individual world experiment requirements filtered by target, retaining saved legacy/custom settings.
- [x] Verify Release and Preview beta npm installations in isolated project folders.
- [ ] Automatically discover future experiment additions/retirements from a machine-readable authoritative catalog.

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
- [ ] Expand reference resolution to vanilla identifiers and subpack precedence.
- [ ] Add deeper audited nested semantic checks as upstream schemas improve.

Measured on SavageCraft during development: 721 JSON documents indexed in about 1.2 seconds, a single saved-file refresh about 10 ms. Full saved-project validation reported no errors/warnings; informational unresolved-reference findings remain qualified as possibly provided by Minecraft/other packs. Measurements vary by machine and cache state.

## October 23: Blockception reference review (no code reuse)

Reviewed the language-server README, feature documentation, vanilla-data README, and separate schema repository documentation. No Blockception implementation, dependency, or schema data was copied into the extension.

- [ ] Extend our existing project index with functions, sounds, particles, tags, scoreboard objectives, and statically identifiable script-registered custom commands.
- [ ] Build independent context-aware `.mcfunction` completion and signature help from Mojang command metadata plus project definitions. Handle selectors and nested `execute` syntax explicitly.
- [ ] Add vanilla identifier resolution from version-compatible Mojang sample metadata, retaining provenance and offline caches.
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
- [ ] Expand original schemas into entity/block/item components and support original routes independently of the current 1.26.50 reference-package floor.

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
