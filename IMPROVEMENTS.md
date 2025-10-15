# Improvement Plan

This checklist captures agreed-upon enhancements for `@shini4i/gitlab-token-scope-adjuster`. Each item is framed so an AI or contributor can pick it up, work asynchronously, and update progress. Mark checkboxes as work completes.

## Preparation
- [ ] Confirm repo is on latest `main` and note outstanding branches that may conflict.
- [ ] Create tracking issue or project board entry linking to this plan.

## Architecture & Extensibility
- [x] Extract orchestration logic in `src/scripts/adjust-token-scope.ts` into service-style modules (command runner, dependency scanner, reporting).
- [x] Introduce a processor registry so new file handlers can be added without editing `fileProcessor.ts`.
- [x] Document the new module boundaries (short ADR or architecture note).

## Error Handling & Resilience
- [ ] Implement typed error objects for GitLab/API failures with consistent messages and status codes.
- [ ] Ensure callers either handle or propagate errors explicitly instead of logging and continuing silently.
- [ ] Add retry and timeout configuration for outbound HTTP calls.

## Performance & Resource Use
- [ ] Implement concurrency control and memoization in dependency processing to reduce duplicate GitLab lookups.
- [ ] Allow filtering/pagination parameters when fetching all projects to avoid scanning unnecessary entries.
- [ ] Benchmark large-project scenarios and document performance expectations.

## Developer Experience
- [ ] Wrap Axios usage in an injectable transport layer to simplify testing.
- [ ] Centralize CLI flag definitions and help text in a declarative schema.
- [ ] Provide typed interfaces for GitLab responses instead of `any`.

## Observability
- [ ] Replace direct `console` calls with a configurable logger supporting log levels and structured output.
- [ ] Add quiet/verbose flags to control log verbosity.
- [ ] Ensure progress reporting gracefully degrades in non-TTY environments when logger is active.

## Configuration & Security
- [ ] Support additional config sources (dotenv file, CLI overrides, config file).
- [ ] Redact sensitive tokens from logs and error messages.
- [ ] Document minimum required GitLab permissions and security considerations.

## Testing & QA
- [ ] Add integration tests that execute the CLI end-to-end with mocked GitLab responses.
- [ ] Expand processor unit tests to cover malformed inputs and edge cases.
- [ ] Set up coverage thresholds in Jest and enforce them in CI.

## Documentation & Community
- [ ] Create `CONTRIBUTING.md` with coding standards, test commands, and review expectations.
- [ ] Add issue and PR templates tailored to feature requests and bug reports.
- [ ] Publish architecture diagrams or explanation in `docs/` for new contributors.
- [ ] Outline a public roadmap or release cadence in README or project board.
