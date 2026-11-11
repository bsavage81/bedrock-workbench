# Bedrock Workbench authoring data

Public data repository: https://github.com/bsavage81/bedrock-workbench-data

The extension and its generators are open source at https://github.com/bsavage81/bedrock-workbench. Only generated declarative
JSON snapshots, versioned manifests and attribution belong in the public repo.
Snapshots are published only after the owner reviews and commits their exact
content and compatibility fingerprints in the source repository. The data
repository workflow uses its own GitHub token; no cross-repository secret is
needed. Scheduled publication runs every six hours for reviewed fingerprints.

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
passing tests and source/fixture coverage audits, and immutable releases enabled
on this repository. Preview absence is reported;
Stable content is never relabeled as Preview.

Scheduled data checks are enabled every six hours (at minute 23 UTC). Both Stable
and Preview are built and tested. Verified official-source changes publish under the automatic policy;
inherited or authored changes remain held for review. Manual dispatch supports
`both` to exercise the same two-channel path.

## Publication policy — November 11, 2026

Official Mojang sample metadata and Microsoft Learn extractions can publish without a new owner fingerprint after schema, coverage, vanilla fixtures and candidate-loaded regressions pass. `data-public/reviewed.json` records SHA-256 baselines for our authored schemas, links and Molang guidance; changes to these require review. This is not an official-schema-only payload: our schemas remain independently authored. Inherited Stable definitions in Preview require explicit fingerprint review, and incompatible inherited definitions always block publication. Absent Stable components unused by Preview samples are audited without failing the build.

Each channel uses its own reusable verify/publish workflow, so a blocked Preview does not block Stable. Full candidate reports and regression logs upload even on failure. Ordinary review holds succeed without a publication marker; actual validation failures remain failures. The publisher independently rechecks the source-commit policy and artifact fingerprint before publishing. Keep immutable releases, anonymous download verification, checksum checks and historic feed entries enabled. Update authored baselines only after reviewing their changes; never approve a conflicting fixture by adding its fingerprint.

## Preview precedence policy — November 11, 2026

Official Preview definitions replace Stable definitions in full for Preview projects, including changed types and removed fields. Do not merge old Stable fields back into a provided Preview component. These official replacements can publish automatically after integrity, provenance, compatibility, coverage and regression checks; no new owner fingerprint is required merely because Preview differs from Stable.

Only components absent from Preview metadata and confirmed in actual Preview samples can inherit Stable data. Known fallback contents are pinned in `automatic.fallbackHashes` in the source policy, excluding the changing source tag; the snapshot still records and verifies the actual Stable source tag/revision. Unchanged fallbacks with passing fixture validation do not block future official Preview updates. New or changed fallback contents, conflicting fixtures, and changes to independently authored schemas remain held. Once Preview supplies a replacement, the entire inherited definition and its fallback restriction disappear. This supersedes the earlier blanket requirement to fingerprint-review every snapshot containing inherited definitions.
