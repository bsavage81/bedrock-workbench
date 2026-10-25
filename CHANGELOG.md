# Changelog

## Unreleased

## 0.22.1 — October 25, 2026

- Keep language keys visible when custom theme colors have not resolved by supplying explicit light/dark fallback colors.

## 0.22.0 — October 25, 2026

- Color language-file keys by category and show clickable pack usage references in key hovers, including implicit entity/item/block and spawn egg names plus unsaved JSON and script references.

- Add projectile component and nested impact-effect schemas, Learn hovers, parameter completions, particle choices, damage ranges, and legacy anchor/bounce forms.

- Add complete pickup_items parameter hovers, including search_height and pickup_same_items_as_in_hand, defaults, item descriptors and versioned pickup callbacks.

## 0.21.0 — October 25, 2026

- Review all component root descriptions against Microsoft Learn, updating owned and imported hovers while preserving clearer authored guidance and compatibility notes.

- Add give_item/take_item interaction hovers and defaults, plus missing adjacent interaction and nested effect fields. Cover inventory-loot references and document the version-specific swing default.

- Add stay_near_noteblock parameter hovers, both breathable timer spellings and block-list hints, and a precise can_fly pathfinding description.

- Add random_hover parameter hovers and fill missing standard AI-goal priority metadata. Respect the 1.26.20 hover_height range-object boundary while preserving legacy arrays.

- Add both go_and_give_items delivery goals, including all documented parameters, nested throw triggers and goal-specific Learn links.

- Add balloonable component/parameter hovers, numeric defaults and attach/detach event reference suggestions.

- Add ambient_sound_interval nested condition/event_name hovers and completion fields, including first-match selection and fallback behavior.

- Add nested hurt_on_condition rules and Learn-linked hovers for damage_conditions cause and damage_per_tick. Include the new component in hover-coverage checks.

## 0.20.0 — October 25, 2026

- Extend inline translation previews to vanilla namespaced item/block references, including block items and legacy language keys from Mojang serialization metadata. Continue showing vanilla text references and respecting project translation overrides.
- Complete offspring property_inheritance keys from the current entity declarations, inserting an object value and preserving mutation settings. Exclude keys already present and connect property hover/navigation/rename.
- Add complete parameter hovers and suggestions for random_swim, swim_wander, swim_idle and flocking. Fill missing damage-sensor and seat-position descriptions and audit named parameter hover coverage.
- Add avoid_mob_type entity_types entry hovers/completions for distance, speeds, visibility, cooldown and priority, plus the documented avoidance-goal fields.
- Add nested filter completions and Learn hovers: test-specific subjects/operators/domains/values, vanilla/project families, typed asset references and declared property values.
- Correct movement.sway from a numeric attribute to its documented movement-control fields, defaults, suggestions and parameter hovers.
- Add move_to_block field rules, enum suggestions, vanilla/project target-block references and arrival/stay event hints. Preserve object/array trigger forms and vector/object target offsets.
- Suggest file-declared events for event values, including empty/unquoted values and foreign-target hints. Correct quoted-value completion filtering while keeping foreign-target events outside local rename/validation ownership.
- Explain the 1.26.10 pushable split in component/field hovers and warn when the legacy component is used in affected entity formats.
- Add the missing move_towards_restriction AI goal, with Learn-linked hovers and priority, speed and control-flag completions.
- Preserve full component descriptions when Mojang metadata contains duplicate cross-references with numeric IDs, including behavior.open_door. Filter numeric placeholders from cached hover text and refresh older reference indexes.

## 0.19.0 — October 25, 2026

- Complete translation-capable fields from both target-matched vanilla and project language files, showing translated text in the suggestions. Prefer project overrides and keep vanilla keys read-only during renames.
- Show supplied translations beside JSON values in theme-aware green italic text instead of on the key hover. Keep other languages on the preview hover and refresh previews for unsaved language edits.

## 0.18.0 — October 24, 2026

- Expand original entity authoring to 84 curated components/AI goals, nested event responses, filters, groups and properties, with version-aware Learn hovers.
- Add scoped event/group/property, alias and controller-state suggestions, navigation and informational reference checks. Connect known client/controller aliases and synced properties.
- Parse pack language files by key and show English-first supplied translations in hovers, including identifiers and unsaved language edits; complete explicit translation/display-name fields.
- Add Find References and F2 rename for known symbols and typed references, synchronizing standard translated-name keys across locales and static RawMessage references. Refuse collisions and ambiguous shared controller bindings.

## 0.17.0 — October 24, 2026

- Add version-specific material ambient-occlusion types/ranges and field/value spellings for redstone, precipitation and entity feeding. Correct visual-rotation state names.
- Validate documented component companions, root-only redstone consumers, removed food effects, and experiment requirements with stable-release boundaries.
- Add explicit Quick Fixes for compatible field/value renames, boolean ambient-occlusion conversion, project experiment requirements, removed fields and file format updates within the target ceiling.
- Preserve conflicts and legacy script events for manual migration; avoid duplicate native material diagnostics and keep source edits out of validation reports.

## 0.16.0 — October 24, 2026

- Add shared format-version checks for document/engine compatibility, block/item/entity component and field minima, permutations, component groups, and custom-component syntax.
- Apply version-aware native schemas and metadata suggestions without overlapping unversioned static BP schemas. Keep owned authoring available for older targets.
- Suggest formats from compatible sample documents and matching saved project files, while preserving existing document versions and numeric manifest schema versions.
- Add an explicit refresh tool for official documentation requirements and regression tests distinguishing field minima from component minima. Unknown historical/experimental requirements remain permissive.

## 0.15.1 — October 24, 2026

- Suggest vanilla creative inventory groups and saved custom catalog groups for block and item menu categories, using legacy spelling for older format versions.
- Add an original crafting item catalog schema with custom-group and loose-item starters, icon/content item suggestions, and structural validation.
- Refresh custom group suggestions on catalog changes, navigate to definitions, and link group hovers to Microsoft Learn. Keep new and external group names allowed.

## 0.15.0 — October 24, 2026

- Add independently authored rules for 52 built-in/legacy item components, with nested validation, Microsoft Learn hovers, value choices, and array-entry starters.
- Complete block selectors, item ingredients/conversions/ammunition/storage, projectile entities, icon atlas names, sounds, and existing project item tags in the appropriate fields.
- Verify custom item component registration, nested parameter hints, boolean choices, source hovers/navigation, legacy ID arrays, and saved-script refresh; keep custom values permissive.
- Expand vanilla reference acceptance for the new typed item contexts and refresh older caches without duplicating completion aliases.
- Keep project navigation available during successful settings rediscovery.

## 0.14.1 — October 24, 2026

- Show one JSON syntax diagnostic for open JSON/JSONC documents by deferring to VS Code's enabled JSON service.
- Preserve Workbench syntax findings in saved reports and for closed files or unavailable native JSON validation.
- Remove earlier Workbench syntax entries when native JSON validation takes ownership; retain other build and validation findings.

## 0.14.0 — October 24, 2026

- Recognize legacy vanilla names and referenced assets from compatible samples, including recipes/trades, attachables, and particles. Normalize entity spawn-event and item auxiliary-data suffixes for reference checks.
- Keep validation-only aliases separate from canonical completion names; rebuild older reference caches.
- Add Mark as intended Quick Fixes for unresolved references, scoped to a file or the project. Rules live in project settings, accept optional reasons, and can be reviewed or removed from Project tools.
- Apply intended-reference rules to live checks and whole-project validation; retain suppressed findings in the report without hiding syntax or schema errors.

## 0.13.0 — October 24, 2026

- Offer collision-box array and single-box starters, including box entries within arrays; clarify supported forms in the Learn-linked hover.
- Add missing commas when accepting Workbench value suggestions or new custom key/value snippets before a following sibling. Preserve existing separators and JSONC comments.
- Expand the vanilla samples catalog to geometry, animation/controllers, loot tables, particles, sounds, and texture paths. Check unknown minecraft-prefixed names when catalog data is available, while keeping unresolved references informational.
- Add optional read-only indexing of explicitly selected installed vanilla packs, with machine-local Release/Preview selections, version checks, caching, and disconnect support. Validation reports record reference sources.
- Add vanilla item/table name completion and checks for loot entries.

## 0.12.0 — October 24, 2026

- Expand authored block rules to 46 current/legacy components, including random offsets, flower pots, visuals, redstone, connections, containers, and particle settings. Add nested field descriptions and value choices.
- Offer project/vanilla block IDs in placement filters and item IDs in mining-tool selectors; complete held/embedded geometry and material references.
- Link component and field documentation to Microsoft Learn stable pages using an official navigation catalog, with legacy-page and custom-component guide coverage.
- Complete custom keys with quoted value snippets and value suggestions, while preserving existing values.
- Disable unrelated word-based suggestions for workspace JSON/JSONC so parameterless component objects stay quiet. Preserve schema and project-aware completions.

## 0.11.0 — October 24, 2026

- Complete custom block/item parameter keys, nested fields, and example values from saved script usage, TypeScript types, and existing project definitions; add type/source hovers and Go to Definition. Hints do not impose validation requirements.
- Complete block geometry fields with pack models and compatible vanilla block geometries, including permutation and object forms.
- Resolve material instances, destruction particles, item icons, blocks.json, and flipbook atlas tiles against the appropriate project and compatible vanilla texture atlases. Keep image-path fields separate.
- Navigate directly to project atlas entries and geometry identifiers; refresh the reference cache to include vanilla atlas names.

## 0.10.0 — October 24, 2026

- Add original block document/state/trait/permutation schemas and 23 common component definitions, with audited nested structural checks and legacy unions.
- Statically discover block/item custom components from JS/TS registration calls, registry aliases, local constants, and relative imported/reexported constants without executing project code.
- Complete registered IDs in components, permutations, and legacy custom-component arrays; add registration hovers, callbacks, and Go to Definition, with saved-file refreshes.
- Keep arbitrary custom parameters and unresolved/external components permissive; identify item/block registry mismatches as informational findings.
- Keep authored block component assistance authoritative over overlapping generated documentation schemas.

## 0.9.5 — October 24, 2026

- Show one preferred spelling per loot function/condition while keeping namespaced aliases valid.
- Keep new function objects focused on the function selector; preserve conditions validation and completion when explicitly present or relevant to the selected function.
- Suppress automatic suggestions for arrays inserted directly inside arrays.

## 0.9.4 — October 24, 2026

- Automatically open available JSON suggestions after inserting empty arrays, objects, and quoted strings in pack files, including subsequent list entries and inserted property values.
- Keep automatic popups scoped to the active pack editor, honor disabled trigger-character suggestions, and discard stale responses after edits or cursor moves.

## 0.9.3 — October 24, 2026

- Add loot condition starters, condition-name suggestions, and conditional parameter completion on pools, entries, and functions.
- Cover probability, entity/variant, and tool predicates, including tool-tag filters and numeric ranges, while preserving unknown condition extensions.

## 0.9.2 — October 24, 2026

- Add loot function starter snippets inside empty arrays, function-name suggestions, and parameter completion based on the selected function.
- Include documented function parameters, namespaced aliases, and conservative nested validation while keeping unknown engine functions open.

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
