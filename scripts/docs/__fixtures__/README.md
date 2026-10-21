# docs:check fixtures

Isolated good/bad trees, one per check, that `check.test.ts` runs the checks
against to prove each rule bites on a violation and passes when clean — without
touching the real docs. The `CheckContext` for each is built inline in the test
(that test-side object is the "fixture manifest").

These are intentionally minimal — and, in the `bad/` trees, intentionally broken:
dead links, missing metadata, brittle references, a missing README area, a
command that is not a script. They carry no `.ts`, so they are never typechecked
and never collected as tests. The one non-markdown file is
`readme-commands/*/package.fixture.json`: the command check needs a package
manifest to check against, and naming it `package.fixture.json` keeps it out of
every tool that looks for a real `package.json`.
