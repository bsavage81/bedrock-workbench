# Workbench schema direction

Workbench schemas are authored independently from format documentation and tested behavior. Existing official Mojang schema coverage remains available while we replace individual routes with tested schemas we maintain.

First migrated route: `schemas/loot-table.schema.json`, used instead of the bundled Mojang loot-table entry point for compatible targets. It checks document/pool/entry structure and numeric ranges while allowing unknown fields and condition/function extensions. It is deliberately not a complete runtime validator.

As of 0.9.2, loot function entries also provide starter snippets, function-name suggestions, and conditional parameter completion/validation for documented functions. Known namespaced aliases are supported; unknown function identifiers and extension fields remain open. Trade-only functions are not offered as loot starters. These definitions are maintained by the original generator alongside the other Workbench schemas. References checked October 24, 2026: https://learn.microsoft.com/en-us/minecraft/creator/documents/lootandtradetablefunctions?view=minecraft-bedrock-stable and Mojang v1.26.50.4 sample loot tables.

As of 0.9.3, conditions on pools, entries, and functions share starter snippets, name suggestions, and selected-condition parameter schemas. This includes probability tests, entity/variant predicates, and match_tool fields with range_min/range_max ranges and item-tag filters. Unknown identifiers and extension fields remain open; validation does not prove the condition is available in every engine/context. References checked October 24, 2026: https://learn.microsoft.com/en-us/minecraft/creator/documents/loottableconditions?view=minecraft-bedrock-stable and Mojang v1.26.50.4 sample loot tables.

References consulted (October 23, 2026):
- https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoloottables?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/documents/createloottable?view=minecraft-bedrock-stable

For each additional route:
1. Record the documentation source and supported format/engine versions.
2. Write original schema structure and descriptions, with local references only.
3. Add valid and invalid fixtures, including extensions and version-sensitive forms.
4. Check representative projects before replacing the existing association.
5. Keep unsupported fields permissive until evidence supports stricter validation.

## Original routes in 0.9.0

`recipe.schema.json` covers shaped, shapeless, furnace, brewing mix/container, smithing transform, and smithing trim. It checks nested ingredient/result types, counts, shaped pattern/key structure, and essential variant fields. It accepts string/object ingredients, item tags, object/array results, object/array unlock conditions, older two-part format versions, and legacy transforms without templates. Unknown recipe kinds remain structurally open; material reduction and engine-specific availability are not yet audited. Pattern-to-key consistency is a future semantic check.

Recipe tag strings suggest built-in stations appropriate to the recipe kind. An open string alternative preserves custom station tags. Internal `deprecated` tags found in vanilla samples are not suggested as crafting stations.

`texture-atlas.schema.json` covers RP item and terrain atlases, including string paths, arrays, and path objects with tint/overlay settings. Optional pack/atlas labels stay optional for existing add-ons. It does not verify that an image exists.

`sound-definitions.schema.json` covers the `sound_definitions` map, string/object audio entries, typed playback settings, nullable distances, and legacy flag strings. Category values stay open. Legacy flat root layouts and server sound definitions are outside this first audited scope.

These replacements currently use the existing schema runtime for engine targets 1.26.50 and newer; individual documents retain their older format versions. Other routes still use the official Mojang package. Unknown extension fields remain allowed. This is structural validation, not proof that a recipe/sound works in-game.

Definitions are maintained in `tools/generate-owned-schemas.cjs`; run `npm run schemas:generate` to recreate the checked-in JSON files. The generator reads no third-party schema files. Regression cases are maintained separately in `test/authored-schemas.test.cjs`.

Primary references consulted October 23, 2026:
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitionlist?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_shaped?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_shapeless?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_furnace?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_potionbrewing?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_potionbrewingmix?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_smithingtransform?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/recipereference/examples/recipedefinitions/minecraftrecipe_smithingtrim?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/documents/addcustomsounds?view=minecraft-bedrock-stable
- https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4 (actual recipes, texture atlases, and sound definitions; no sample assets/schema implementations redistributed)

Next candidates: deeper entity/block/item component checks. Metadata-derived documentation must retain its source/provenance separately from our authored validation rules. Do not treat the newest format as mandatory for older valid documents.

Completion behavior in 0.9.5: discriminator patterns accept namespaced aliases without adding those aliases to the name dropdown. Each name has one preferred completion spelling. New function objects initially offer the function selector; explicit conditions remain validated through a pattern property, and selected functions may offer conditions where relevant. This preserves the documented syntax while reducing initial completion noise.

## Block schemas and script registrations (0.10.0)

The original block schema is maintained in tools/block-schema.cjs and emitted to schemas/block.schema.json by the common generator. It replaces the official block entry point and the previous foundational block schema. This first batch covers the document wrapper, identifier, menu category, states, placement traits, permutations, and 23 common component definitions. Remaining built-in component names/fields can still receive compatible Mojang documentation assistance; overlapping authored rules are omitted from that generated reference to preserve our types and one hover source.

Audited shapes include friction/light values, mining/explosion unions, box vectors, geometry, materials, transformations, color representations, tick intervals, placement filters, loot, tags, and liquid interaction settings. Legacy forms and unknown fields remain open. Engine/format-specific feature availability, geometry/material pairing across permutations, state-expression evaluation, and the remaining built-in component payloads are future work. Material ambient-occlusion booleans remain accepted for older document versions.

Custom block and item registries are analyzed separately using the pinned Node-compatible @babel/parser package (MIT, shipped with its dependency notices). src/script-components.cjs is original Workbench analysis code. It never executes imports, handlers, constructors, or project statements. Discovery supports string literals, constant concatenation/templates/object members, lexical registry aliases, and relative named/default/namespace imports and reexports. Saved JS/TS source changes, renamed/deleted scripts, and imported-constant changes rebuild the registry view. Only behavior-pack source files up to 2 MiB each are inspected; type declaration files and ignored directories are excluded.

Registered component IDs are suggested at component keys, permutation keys, and legacy custom-component lists, with source/callback hovers and registration navigation. Custom JSON parameter values remain unrestricted. Components registered for the opposite pack-content kind receive an informational finding; unresolved/external IDs remain allowed. Runtime-computed IDs, general helper-call argument flow, third-party package exports, unsaved source buffers, and proof that registration code is reachable/executed are outside this initial scope.

In 0.11.0, custom parameter assistance combines callback second-argument `params` reads, literal-ID `getComponent(...).customComponentParameters.params` reads, supported TypeScript annotations/assertions, and saved block/item configurations. Nested keys, inferred types, scalar examples, boolean choices, and source navigation are advisory only. Unknown fields remain valid; this is not a runtime parameter contract. Local and direct relative imported types are supported; arbitrary function argument flow and external package type resolution are not. Existing project examples can contribute suggestions even when scripts are unavailable.

Geometry and texture suggestions are resolved by field context in src/content.cjs. Block geometries include pack IDs and vanilla full_block/cross; full_block_v1 requires both document format and target >= 1.26.0. Terrain/item atlas aliases come from project atlases and the compatible cached Mojang release; project aliases take precedence. Raw image-path fields remain separate. The reference cache intelligence version is 2 to refresh older atlas-free indexes. Go to Definition targets atlas keys and geometry identifiers.

Verification: all 98 relevant Mojang v1.26.50.4 block examples and all five SavageCraft block definitions passed the authored schema. The registry index found all five SavageCraft block registrations (including the imported FERTILIZABLE constant) separately from three item registrations. Full saved-project validation of 721 JSON files reported zero errors and warnings; informational reference findings may remain.

Primary references consulted October 24, 2026:
- https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-components?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_destructible_by_mining?view=minecraft-bedrock-stable
- https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4 (block examples and documentation metadata)
- https://babeljs.io/docs/babel-parser (parser API)

## Block coverage and documentation links (0.12.0)

0.14.0 false-positive correction: canonical command names are not exhaustive names for pack serialization. The vanilla collector now records typed references actually used in compatible vanilla recipes/trades/loot/entities and client entity/attachable/particle files. These form a separate validation-acceptance set, not duplicate completion names and not assertions that arbitrary unknown names are valid. This also covers hardcoded resources referenced by vanilla but absent from text-only sample assets. Entity spawn-event suffixes and item auxiliary-data suffixes are normalized for existence checks. Unknown names are still reported, including typo regression cases. Intelligence cache version 4 and local index version 2 rebuild older indexes. SavageCraft findings fell from 185 informational findings to 10; all remaining findings are numbered villager textures missing in the project and the matching release's complete Git tree. No BP/RP source files were changed during the investigation.

0.14.0 intended references: unresolved-reference diagnostics carry a stable code and typed reference identity. Quick Fixes persist exact type/value matches, optionally scoped to a project-relative file, under validation.ignoredReferences. The optional reason is editable in project settings. Only bedrock.missingReference findings are eligible; syntax, schema, manifest, and other diagnostics cannot be suppressed by these rules. The same matcher filters live checks and project validation, whose report retains suppressedIssues with their matching rules. Review intended references opens project settings; deleting a rule restores findings. Native VS Code verification covers file scope, project scope, whole-project reports, and restoring live findings after removal.

0.13.0 collision-box fix: collision_box already validated boolean/object/array forms, but generic JSON completion did not surface an array starter. The component now supplies an explicit Collision box array snippet and shared box definitions supply an object-entry starter. The hover lists all four forms and the 1.26.0 stable availability of multiple boxes. Cache build 12 refreshes installed schema copies on the next release. Unit checks cover two-box validation and malformed entries; native VS Code checks cover boolean/object/array choices, array-entry completion, and the updated Learn-linked hover.

0.13.0 separator fix: src/completion-key.cjs now scans significant JSONC tokens after the completed value. Workbench custom parameter, legacy component-ID, and project/vanilla reference value completions replace full escaped scalar values and add a comma only before a following sibling. Existing commas and closing delimiters are preserved. New custom key/value snippets use the same separator check. Native JSON schema suggestions retain their own separator handling. Tests cover comments, quoted/boolean values, arrays, existing commas, and final entries; actual completion edits in VS Code parse successfully after acceptance.

0.13.0 vanilla validation: reference intelligence version 3 includes compatible samples pack identifiers alongside metadata, atlases, raw texture names, geometry, animation/controllers, loot tables, particles, and sounds. src/vanilla.cjs shares identifier extraction between archive and selected on-disk packs. Resolution merges project and known vanilla identifiers; unresolved references remain informational and explicitly allow external packs. Namespaced values are checked only when that identifier category has available catalog data; unqualified item/block/entity aliases resolve against minecraft-prefixed IDs. Loot entry item/table names now use the corresponding catalog.

Optional local indexing requires an explicit folder-picker choice and a declared installed version. Machine-global extension state remembers separate Release/Preview selections; absolute game paths are not written into project settings. Supported layouts are samples-style singular BP/RP, game Content/data or data behavior_packs/resource_packs vanilla directories, or a selected pack root. No directory links are followed, files are not executed, and game files are never modified. Indexing caps individual JSON at 8 MiB, total JSON at 128 MiB, and directory entries at 100,000. Local caches live under ignored .bedrock/reference; newer-than-target data is excluded and a warning is recorded. Local versions are user-declared; game upgrades require updating the selection/version. Samples are incomplete and the current release selector excludes prereleases, so local Preview data supplements the compatible release fallback rather than proving exhaustive Preview support. Validation reports retain source/version provenance. Unit and native VS Code tests verify vanilla typo diagnostics, valid identifiers, opt-in/cancel/disconnect behavior, and read-only local indexing.

Documentation source policy: use the official Microsoft Learn Minecraft Creator stable documentation (https://learn.microsoft.com/en-us/minecraft/creator/?view=minecraft-bedrock-stable) alongside compatible released Mojang samples. Learn is a primary source for requirements, field meanings, prerequisites, format changes, and experiment restrictions. Review conflicts and historical format behavior before strengthening validation; a current page alone must not invalidate supported older content.

Every component documentation hover links to Microsoft Learn. src/documentation-links.json contains URL metadata from Microsoft's public navigation and page index; refresh it explicitly with tools/update-documentation-links.cjs. Only names and paths are retained, not documentation text or schema code. Known block/item/entity components, goals and triggers resolve to published component pages; unmapped names fall back to their Learn component list. Custom block/item components link to the official custom-components tutorial while retaining their local script provenance. Generated reference descriptions keep their Mojang release attribution separately from the Learn destination. Bundled schema adaptation adds Learn links to component/field descriptions too. Cache build 11 refreshes previously adapted hover text. Offline hovers use the bundled URL catalog; viewing linked web pages requires connectivity.

tools/block-components.cjs supplements our authored rules with 46 total component definitions, including the two reported omissions: random_offset (x/y/z, range min/max, steps) and the parameterless flower_pottable. The samples metadata snapshot lacks these names, so their availability must not depend on that generated reference. Each authored component has a documentation link; nested structural fields have descriptions. The official-schema cache build advances to 10 to replace previously cached block rules.

Added families include chest obstruction, connections, destruction particles, held/embedded visuals, precipitation, redstone consumption/production/conductivity, support, replaceability, block-entity metadata/containers, and note instruments. Historical component forms remain accepted, with deprecated/internal component names hidden from new-key suggestions. Old propogates_power and snow_log_no_collision spellings remain accepted without duplicate preferred completions. No third-party schemas are used.

Block/item identifier suggestions are deliberately scoped: placement_filter condition block_filter strings and descriptor names use project/vanilla blocks; destructible_by_mining item_specific_speeds item strings and descriptor names use items. Tags remain Molang expressions. Item/embedded geometry and material fields reuse the appropriate geometry/terrain-atlas completion paths, including permutations. This is structural and authoring assistance, not exhaustive format/experiment/runtime validation. Format availability and root-only restrictions are documented in component hovers; conditional enforcement of all historical engine rules remains future work.

Validation: 98 relevant Mojang v1.26.50.4 examples plus five SavageCraft blocks pass. VS Code host checks assert hovers for both reported components and nested offset fields; range-key completion; no fields inside flower_pottable; separate block/item lists; and continued custom parameter assistance.

Additional primary references consulted October 24, 2026 (stable view):
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_random_offset
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_flower_pottable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_embedded_visual
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_item_visual
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_block_entity
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_instrument_sound
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_precipitation_interactions
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_collision_box
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_placement_filter
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_liquid_detection
