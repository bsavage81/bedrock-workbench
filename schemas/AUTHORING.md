# Workbench schema direction

Workbench schemas are authored independently from format documentation and tested behavior. Do not translate or copy Blockception schema files. Existing official Mojang schema coverage remains available while we replace individual routes with tested schemas we maintain.

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

Next candidates: recipes, texture atlases, sound definitions, then deeper entity/block/item component checks. Metadata-derived documentation must retain its source/provenance separately from our authored validation rules. Do not treat the newest format as mandatory for older valid documents.
