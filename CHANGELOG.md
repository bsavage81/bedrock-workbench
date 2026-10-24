# Changelog

## 0.9.1 — October 23, 2026

- Suggest built-in station tags inside recipe tag strings, scoped to the recipe type, while continuing to allow custom tags.

## 0.9.0 — October 23, 2026

- Replace recipe, item/terrain atlas, and client sound-definition entry points with independently authored Workbench schemas.
- Validate recipe variant fields and nested ingredient/result types, pattern/key shapes, counts, unlock forms, atlas paths, and sound playback settings while preserving documented legacy forms and unknown extensions.
- Add reproducible schema generation, compatibility/invalid-case tests, native VS Code diagnostics and hover checks, and packaged-route verification.
- Document sources, audited scope, and remaining version/semantic limits in schemas/AUTHORING.md.

## 0.8.1 — October 23, 2026

- Remove the duplicate component hover provider; let VS Code's JSON schema hover own component and field documentation. Generated schemas retain versioned documentation links and type information.

## 0.8.0 — October 23, 2026

- Add target-compatible Mojang vanilla identifier suggestions to supported JSON reference fields.
- Add `.mcfunction` command/argument completion and signature help from Mojang metadata, including nested execute chains, selectors, coordinates, and project function/objective/tag references.
- Index project functions, declared scoreboard objectives/tags, sounds, and particles incrementally.
- Begin independently maintained schemas with loot-table structural validation and an authored-schema migration guide. No Blockception code or schema data is included.
- Prepare the private GitHub repository and Windows CI checks.

## 0.7.0 — October 23, 2026

- Bundle Mojang Bedrock schemas 1.26.50 for broader offline BP/RP assistance on compatible targets, with exact pack/file scoping and conservative adapters for upstream generator defects.
- Add Validate project with Problems integration and a saved validation report: JSON/manifest structure, duplicate UUIDs/identifiers, script entries, linked dependency versions, structural schemas, references, and basic Molang checks.
- Add project identifier/resource value completions, hovers, and Go to Definition, with informational unresolved references.
- Reuse Mojang Creator Tools' Molang parser/query/math documentation with pinned provenance and MIT attribution for expression diagnostics and editor assistance.
- Cache content indexes and refresh changed files incrementally; retain file events during project-setting rediscovery.
- Retry temporary Windows locks when atomically replacing JSON settings/cache files.
## 0.6.0 — October 23, 2026

- Replace experiment display rows with native VS Code checkboxes that save explicit On/Off states.
- Refresh the experiment catalog from revision-stamped Minecraft Wiki Bedrock lists and history, respecting Release/Preview, upcoming, historical, deprecated, and removed switches.
- Ask which new experiment requirements to enable; remember reviews and snooze deferred prompts without blocking builds.
- Disable controls for confirmed retired switches and offer explicit cleanup of saved requirements; preserve unknown/custom settings.
- Add manual experiment checks/source link, daily reference caching, periodic checks while VS Code runs, and offline/parser-failure fallback.
- Correct the fallback retirement boundary for custom biomes and include retired custom projectile information.
## 0.5.0 — October 23, 2026

- Add Script dependencies and World experiments sidebar sections, plus a Beta Script APIs setting linked to the Beta APIs world requirement.
- Check declared Script API modules and existing npm typings on project opening/settings changes; prompt before updating manifests and installing exact matching typings.
- Select regular/beta dependencies for Release or Preview, exclude internal variants, and distinguish manifest versions from game-specific npm versions.
- Add dependency and typings tasks, preserve pack versions/UUIDs, and protect stale prompts and dirty source/package files.
- Install into an explicit project directory with lifecycle scripts disabled and explicit shared type dependencies for Preview packages.
- Track version/channel-filtered experiment requirements; retain saved legacy/custom settings without changing Minecraft world files.
- Check the Preview engine separately when the project targets Preview.
## 0.4.0 — October 23, 2026

- Check the current released engine when a project opens; offer an approved, transactional target/minimum-engine update without blocking builds.
- Cache version-compatible Mojang documentation metadata and item schemas from released bedrock-samples text archives.
- Generate component/field schemas for configured BP paths; add documentation hovers, completions, conservative validation, and explicit spelling Quick Fixes.
- Add manual target check and reference refresh controls under Settings; retain cached references offline.
## 0.3.2 — October 23, 2026

- Organize the sidebar into collapsible Settings, Pack icons, Beta development, Stable releases, and Project tools headings.
- Keep project identity and build status visible at the top; retain section expansion state during refreshes.

## 0.3.1 — October 23, 2026

- Show the BP pack icon beside the project name, with RP as a fallback.
- Refresh project and BP/RP icon thumbnails using image-content cache keys when `pack_icon.png` changes.

## 0.3.0 — October 23, 2026

- Add BP and RP pack icon selectors with current-image thumbnails in the sidebar.
- Validate selected PNGs and copy them into source packs as `pack_icon.png`.
- Always grayscale beta icons during compilation, preserving source colors and transparency.
- Remove per-profile icon settings; migrate previous stable icon selections into source packs.

## 0.2.0 — October 23, 2026

- Add Deploy stable directly to Minecraft's regular behavior/resource pack folders.
- Ask for a version on manual beta/stable deployment and stable export; cancellation leaves versions unchanged.
- Synchronize project and source manifest versions after successful manual deployment/export, then refresh beta after stable actions.
- Fix Bump version to update both source manifests, module versions, and linked BP/RP dependency versions.
- Preserve comments, UUIDs, and Script API dependency versions; recover original version files on write failure.

## 0.1.4 — October 23, 2026

- Name development folders and pack titles as `SavageCraft v2 beta 1.0.0 BP` and `RP`.
- Name stable exports `SavageCraft v2 1.0.0.mcaddon`, with matching BP/RP folders inside.
- Migrate owned UUID-named and previous-version folders without changing pack identities or renaming roots held open by Minecraft.

## 0.1.3 — October 23, 2026

- Remove the redundant Project settings sidebar entry. Select the project name at the top to open settings.

## 0.1.2 — October 23, 2026

- Keep the Bedrock sidebar focused on settings, status, and tasks.
- Remove the duplicate BP/RP file browser; use VS Code's standard Explorer for project files.

## 0.1.1 — October 23, 2026

- Fix Windows EPERM deployment errors caused by renaming pack folders held open by Minecraft.
- Synchronize changed files inside existing owned pack folders and skip unchanged files.
- Retry temporary file locks and snapshot changed/deleted files before synchronization.
- Restore previous files on failure; retain recovery snapshots and journals if restoration is blocked.

## 0.1.0 — October 23, 2026

- Project sidebar with pack browser and build commands.
- Separate beta/stable identities, branding and icons.
- TypeScript/JavaScript compilation and JSON normalization.
- Release/Preview development deployment on saved and external file changes.
- Ownership-checked replacement, stale-file removal and rollback on replacement failure.
- Stable `.mcaddon` export with explicit versions and overwrite prevention.
- Foundational project, manifest, item, block and entity JSON schemas.
- Project tracker and Windows compiler/VS Code integration tests.
