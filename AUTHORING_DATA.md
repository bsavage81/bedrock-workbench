# Independently updatable authoring data

Implementation and local verification: October 27, 2026. Initial audit baseline: 0.26.6. Concurrent preview work subsequently advanced
the shared checkout to 0.26.7. The owner then authorized the 0.26.8 extension
update, public MIT source and public data setup. The verified VSIX was installed
locally; the tester bundle remains unchanged. Stable and Preview public data releases are live.

## Audit and release baseline

The source repository is `bsavage81/bedrock-workbench`; the owner requested making it public under MIT on October 27, 2026. Its latest
published release was 0.24.0; the shared tester bundle was 0.23.1. The workspace
already contained uncommitted Molang, model-preview and authoring changes at
0.26.6. Those files were retained. No repository AGENTS.md was found.

Existing integration points:

| Consumer | Before | Integration |
| --- | --- | --- |
| `reference.cjs` | Target-bounded Mojang release, 24-hour project cache, excluded prereleases and Preview tag suffixes | Accept real `-preview` tags for Preview projects; cache records requested and actual source channel; use compatible published reference facts when available |
| `official-schemas.cjs` | Bundled official package plus independently authored replacements; generated target-aware local schemas | Owned replacements come from the active registry; immutable data-version directory changes VS Code associations and report validators |
| `editor.cjs` | Mojang completions, spelling diagnostics and component schema associations | Channel and data revision participate in invalidation; refresh uses the active owned schemas and compatibility facts |
| `content-editor.cjs`, `content.cjs` | Indexed project and cached vanilla facts | Data revision invalidates indexes; refresh recomputes open-document diagnostics and reference providers |
| `documentation.cjs`, `format-versions.cjs`, `filters.cjs`, `entity-authoring.cjs` | Bundled Learn descriptions/links, minimum versions, filters, event alternatives | Existing consumers read identity-preserving registry objects |
| `molang.cjs` | Bundled catalog/guidance and derived lookup tables | Registry commit rebuilds derived entries/maps; the Workbench lexer/parser stays executable extension code |

## Supported public payload

`src/authoring-data.cjs` is the exact allowlist: nine owned schema families
(block, item, entity, client entity, creative catalog, recipe, loot table,
texture atlas, sound definitions), Learn links/descriptions, declarative
component/field minimum-format facts, filter facts, Molang catalog/guidance,
event forms, and optional generated Mojang reference facts. JSON only.

The official npm schema catalog/adaptation code, project/manifest configuration
schemas, structural compatibility transforms/fixes, parser grammar, resource
binding behavior and editor code remain bundled. New executable behavior or
changes to a consumer's expected data shape require an extension update.
Never copy third-party extension schemas or code into the generator.

Game models, textures, images, raw owner/controller preview assets, vanilla
translations, local projects, extension source files and source-repository Git history are
excluded from the public payload. Preview assets continue through their existing
explicit-source/pinned-archive path.

## Manifest, compatibility and channels

The public repository is `bsavage81/bedrock-workbench-data`. It contains the bootstrap README and license; immutable releases are enabled.
`data-public/README.md` and `data-public/LICENSE` are reviewed bootstrap files;
they are not a copy of the source repository.

The mutable indexes are anonymous raw URLs on `main`:
`feeds/stable.json` and `feeds/preview.json`. Each has a data-format version,
channel, generation timestamp and retained historical snapshot entries. The
formal contract is `schemas/authoring-update-manifest.schema.json`; runtime
validation additionally checks ordered version ranges, exact trusted asset URLs,
duplicate IDs, source provenance, timestamps and actual Preview availability.

Each snapshot uses an immutable release tag `data-<id>` with `snapshot.json`.
Entries include minimum/maximum extension version, minimum/maximum Minecraft
version, exact source commit revisions, source channel/availability, license and
attribution, SHA-256, byte count and generation time. Format v1 currently uses
inclusive three-part version ranges, not arbitrary semver expressions. The
generator starts conservatively with an exact extension and Minecraft version;
broaden coverage only after representative older-target/format testing.

Historical entries must remain in feeds. A newer entry cannot replace data for
an older target unless its explicit coverage includes that target. The existing
`format-versions.cjs` project-target and document `format_version` gates still
apply inside selected schemas/catalogs. Unknown runtime constructs stay permissive.
The updater never lowers the project target or rewrites pack files.

Preview requires an actual prerelease archive and pinned source revision. The
verified live source tags were `v1.26.50.4` (Stable) and
`v1.26.60.30-preview` (Preview). Equal documentation inventories are recorded as
equal; no differences are invented. If Preview is absent, generation stops for
that channel. The legacy samples fallback may use Stable data below a Preview
target, but records `sourceChannel: stable`; it does not publish it as Preview.
Preview metadata omissions are compared with actual Preview vanilla entities.
Only missing Stable component documentation still used by those entities can be
carried forward; each entry is attributed to its Stable source and its generated
constraints are checked against Preview fixtures. Unexplained missing entries
hold publication for review. Beta schema directories remain excluded by the existing conservative reference
extractor; prerelease selection does not imply every experimental field is known.

## Client operation and recovery

The extension checks on trusted project open and every six hours while open
(a half-hour timer invokes the throttled check). Last-attempt times are persisted
per channel/target. `bedrock.authoringData.autoUpdate` disables background checks.
Manual `Bedrock: Refresh Authoring Data` bypasses throttling. Settings in the
Bedrock sidebar show active version, channel, source and update failure state;
`Bedrock: Authoring Data Status` offers refresh and rollback. Routine checks do
not display popups. Details go to the Bedrock Workbench output channel.

Downloads use no sign-in or authorization header. Only the hardcoded public
repository feed URLs and versioned release URLs are allowed. Redirects are
checked before following them and limited to GitHub release-asset hosts. Limits:
1 MiB manifest, 24 MiB snapshot, 45-second overall attempt, bounded JSON depth
and node count. The envelope accepts only allowlisted filenames; there is no
archive extraction or download-controlled filesystem path. Reject prototype keys,
external schema references, invalid schemas, broken schema refs, incompatible
catalog types, unsupported formats and mismatched checksums/IDs/channels.

Content-addressed files and a temporary-file/rename pointer commit prevent partial
activation. Providers commit synchronously through one registry, then refresh
generated associations/indexes. Failed service refresh restores both the pointer
and active registry. Concurrent checks join the same promise; target changes,
disposal and rollback cancel in-flight work. Startup revalidates checksums and
compatibility of the active and previous records. Corrupt active data can fall
back to the previous record, then bundled data.

A shared-storage lease prevents concurrent updates and rollbacks in separate
VS Code windows. It recovers a lease from a definitely exited process after
one minute, or an abandoned incomplete lease write after two minutes.

`Bedrock: Roll Back Authoring Data` selects the previous record (or bundled
fallback) and holds the rejected ID so automatic checks do not immediately
reapply it. A later distinct reviewed ID can update normally. The local cache
retains the active and previous pointers; older content-addressed files are not
automatically pruned, but only those two pointers are used for offline selection.
Other historical target versions can be downloaded from retained feed entries
when online. Checksums provide integrity within the trusted GitHub repository;
format v1 does not add an independent signing key or protect against compromise
of that repository's publisher account.

## Generation and maintenance

The owner chose a one-person review arrangement: review each candidate and commit
its exact content/compatibility fingerprint in `data-public/reviewed.json` in the
source repository. The public data repository's manual Actions workflow checks
out that exact source revision, fetches official inputs, verifies schemas and
fixtures, and builds only approved candidates. The separate publisher job uses
only the data repository's own `GITHUB_TOKEN`, rechecks the approved fingerprint
at the pinned source commit, enforces immutable releases, verifies anonymous
downloads, and only then advances the channel feed. No cross-repository credential
or self-approved GitHub environment is used. A reviewed unchanged fingerprint is
not published twice. This is an owner review, not independent two-person review.

The data workflow is `data-public/.github/workflows/refresh.yml` in this source
tree and `.github/workflows/refresh.yml` in the data repository. It currently has
manual dispatch only. Scheduled publication remains disabled pending an explicit
request; the source repository's own candidate workflow is also manual only.

1. Run `npm ci`, `npm run check`, and `npm test`.
2. Run `node tools/fetch-authoring-inputs.cjs .test-temp/data-inputs`. It detects
   actual Stable and Preview samples, records commits and hashes, verifies Learn
   Markdown blobs, and saves the source notices and Molang tables.
3. Run `node tools/build-authoring-data.cjs .test-temp/data-inputs .test-temp/data-output stable <unique-id>`
   and repeat for `preview`. Candidates must compile schemas, cover component
   hovers, validate vanilla fixtures and pass candidate-loaded project regressions.
   For historical coverage set `BEDROCK_DATA_CHANNEL` and the exact official
   `BEDROCK_DATA_SOURCE_TAG`. For historical Preview also set a compatible
   `BEDROCK_DATA_STABLE_TAG` no newer than the Preview source.
4. Review each local `verification.json`, source changes, generated catalogs,
   attribution and compatibility implications. Unapproved candidates stop and
   produce no `verified.json`; do not upload candidate artifacts publicly.
   Add the exact reviewed fingerprint to `data-public/reviewed.json`, commit it
   and push the reviewed source. The fingerprint binds source revisions, data
   families, reference facts, notices and compatibility ranges.
5. Repeat generation to confirm the reviewed fingerprint passes, then dispatch
   the data repository workflow with `publish=false` to verify Actions. Dispatch
   with `publish=true` for the requested channel only after checks pass. Data
   releases contain only `snapshot.json` and `manifest.json`. The publisher
   refuses altered data, duplicate fingerprints and mutable releases. It retains
   existing feed entries for older targets.
6. Use `powershell -File tools/test-host.ps1 -Tests test/authoring-data-host.cjs`
   for real VS Code completion, hover, validation, rollback and fallback checks.
   Source code, schemas and parser behavior evolve under the MIT extension license;
   official references and third-party components keep their own notices.

Public source attribution: authored data MIT; Microsoft Learn CC-BY-4.0; sample
facts retain Mojang's LICENSE.md/Minecraft EULA notice; Creator Tools MIT notice
is retained as supporting attribution. Snapshots embed full notices. The owner has also selected MIT for the extension's own code; third-party notices remain applicable.

## Verification evidence and remaining publication gates

Local evidence lives under `.test-temp/`: `authoring-data-host.json`,
`data-inputs/inputs.json`, `data-output/<channel>/verification.json`,
`data-unit-tests.log`, and `authoring-full-tests.log`. Real-source candidates
for each channel validated 485 vanilla documents with zero fixture failures,
zero missing linked Learn pages and zero missing owned component hovers.
The initial 0.26.8 candidates were reviewed, including source-tagged Preview fallback descriptions for twelve components still used by Preview vanilla. The owner selected fingerprint-based review for this one-person project. Data publication uses the data repository's scoped Actions token; a real Actions run and anonymous release verification remain deployment gates. Both public feeds are now published as immutable releases, verified anonymously and activated successfully in native VS Code.

Final local verification: syntax checks passed; full suite 311 tests (309 passed,
two skipped, zero failures); eleven updater/service regressions passed; native
VS Code authoring host passed on 0.26.8. Both channel candidates passed their
61 candidate-loaded regressions and 485 vanilla fixtures. The maintained evidence
summary is `schemas/AUTHORING_DATA_AUDIT.json`. The public repository has its README/license and immutable releases enabled; both channels are published and verified.

Published October 27, 2026: Stable `run-40587848516-1-stable` and Preview
`run-40587710657-1-preview`. Both release workflows passed, including immutable
release checks and anonymous asset checksums. Native VS Code loaded both feeds
without GitHub sign-in. Scheduled publication remains disabled. Raw Learn HTML
hashes are retained in `inputAudit`; review binds extracted content and pinned
source revisions, so unrelated page chrome does not invalidate reviewed data.

Scheduled data checks are enabled every six hours (at minute 23 UTC). Both Stable
and Preview are built and tested. Only previously reviewed fingerprints publish;
new or incompatible content remains held for review. Manual dispatch supports
`both` to exercise the same two-channel path.
