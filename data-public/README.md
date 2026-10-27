# Bedrock Workbench authoring data

Public data repository: https://github.com/bsavage81/bedrock-workbench-data

The extension and its generators are open source at https://github.com/bsavage81/bedrock-workbench. Only generated declarative
JSON snapshots, versioned manifests and attribution belong in the public repo.
Snapshots are published only after source and compatibility review. Scheduled
publication is controlled separately in the private build repository.

When enabled, `feeds/stable.json` and `feeds/preview.json` retain an index of
compatible historical releases. Each entry points to the immutable release
asset `data-<id>/snapshot.json`, includes its SHA-256 and byte length, source
revisions, data-format version, generation time, extension coverage, Minecraft
coverage and actual source channel. Downloads require no GitHub account.

Our authored data uses MIT. Microsoft Learn excerpts retain CC-BY-4.0.
Mojang sample facts retain upstream attribution and LICENSE.md/Minecraft EULA
notices. Creator Tools is a supporting reference; no parser code is included.
Snapshots contain full source notices. No game models, images, vanilla
translations, project content, extension code or repository history is
published.

Maintenance and review instructions are in the source repository's
`AUTHORING_DATA.md`. Publication requires a reviewed candidate fingerprint,
passing tests and source/fixture coverage audits, an approved Actions environment,
and immutable releases enabled on this repository. Preview absence is reported;
Stable content is never relabeled as Preview.
