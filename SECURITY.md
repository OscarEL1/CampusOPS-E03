# Starter security status

## Current baseline — 2026-08-25, compatible maintenance

The distributed lockfile reports **0 critical, 0 high, 0 medium and 0 low** known vulnerabilities in both `npm audit --json` (including development dependencies) and `npm audit --omit=dev --json`. Clean installation, public feedback, backend self-tests, dependency API checks, full course contract regression and the native Android debug build passed. The starter ZIP is independently installed and audited before handoff.

- Expo remains on SDK 57; its resolved patch changes from 57.0.15 to 57.0.16. React Native 0.86.2, React 19.2.3, TypeScript 6 and Node 22.22.0 remain unchanged.
- Metro 0.84.5 replaces the affected image parser dependency. A scoped override aligns the React Native CLI branch to the same compatible patch, within its declared `^0.84.3` range. `image-size` is absent from this lockfile, not excluded from the audit.
- A scoped override replaces only xcode 3.0.1's uuid dependency with the CommonJS security backport 11.1.1. Its used `v4()` API, project identifier generation/serialization and buffer-bound checks were tested.
- No forced downgrade, advisory suppression, disabled test or weaker quality gate was used. Keep the supplied lockfile and install with `npm ci`.
- Reaudit after changes and before release. Zero known advisories is a dated result, not a guarantee of security. Untrusted code still requires disposable, isolated execution without instructor secrets.

Upstream fixes: [Metro 0.84.5](https://github.com/react/metro/releases/tag/v0.84.5) and [uuid 11.1.1](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).

## Historical baseline — superseded by the current section

Audit date: 2026-08-21.

The clean operational re-audit with Node 22.22.0 reports 0 critical, 8 high, 7 medium and 0 low vulnerable package findings. The only direct finding is `expo` (high) because it brings the affected build-tool graph; the remaining findings are transitive. The concrete advisory roots exposed by npm are two high-severity `image-size` denial-of-service issues used through Metro and one medium-severity `uuid` bounds-check issue used through the Xcode/config tooling.

A non-forced `npm audit fix --package-lock-only` was tested in a temporary copy. It reduced none of the 15 findings. npm's remaining proposal changes Expo 57 to Expo 53 as a semver-major/breaking remediation; that would violate the selected React Native baseline and was not applied. The complete direct/transitive classification is stored in `reports/operational/dependency-audit.json` in the instructor workspace.

Operational treatment:

- CI fails on any critical advisory and preserves the complete audit output as evidence.
- High/medium findings remain visible and must be re-audited before the starter is released and after any lockfile change.
- Student repositories execute only in isolated, disposable runners without production credentials, host secrets, Docker socket or trusted caches.
- Untrusted images/artifacts are not opened on the instructor host; Metro, build and artifact inspection run in the isolated checkout.
- A dependency update requires a recorded decision plus typecheck, lint, tests, hidden checks and release build validation.

This is a documented toolchain risk, not evidence that a student submission is secure.
### Historical CampusOps recheck — 2026-08-25, before remediation

Before remediation, `npm audit --omit=dev --json` with the unchanged lockfile reported 0 critical, 5 high, 10 medium and 0 low affected package findings (15 total). That was a registry reclassification, not a remediation: no dependency or lockfile version changed during contextualization. The direct finding was Expo (medium); all 5 high findings were transitive in the image-size/Metro toolchain. This historical result is superseded by the compatible maintenance documented at the top.
