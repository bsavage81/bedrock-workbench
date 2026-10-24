# Workbench schema direction

Workbench schemas are authored independently from format documentation and tested behavior. Existing official Mojang schema coverage remains available while we replace individual routes with tested schemas we maintain.

First migrated route: `schemas/loot-table.schema.json`, used instead of the bundled Mojang loot-table entry point for compatible targets. It checks document/pool/entry structure and numeric ranges, permits unknown fields, and leaves condition/function payloads open. It is deliberately not a complete runtime validator.

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
