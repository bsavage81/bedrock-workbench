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

Registered component IDs are suggested at component keys, permutation keys, and legacy custom-component lists, with source/callback hovers and registration navigation. Custom JSON parameter values remain unrestricted: handler interfaces do not provide a reliable parameter schema. Components registered for the opposite pack-content kind receive an informational finding; unresolved/external IDs remain allowed. Runtime-computed IDs, helper-call argument flow, third-party package exports, unsaved source buffers, and proof that registration code is reachable/executed are outside this initial scope.

Verification: all 98 relevant Mojang v1.26.50.4 block examples and all five SavageCraft block definitions passed the authored schema. The registry index found all five SavageCraft block registrations (including the imported FERTILIZABLE constant) separately from three item registrations. Full saved-project validation of 721 JSON files reported zero errors and warnings; informational reference findings may remain.

Primary references consulted October 24, 2026:
- https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-components?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/blockcomponentslist?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_destructible_by_mining?view=minecraft-bedrock-stable
- https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4 (block examples and documentation metadata)
- https://babeljs.io/docs/babel-parser (parser API)
