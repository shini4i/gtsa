# Performance & Resource Use

This document captures the guardrails added for the "Performance & Resource Use" initiative and explains how to
exercise them when operating the token scope adjuster at scale.

## Dependency Processing Throughput

Dependency updates now execute with a bounded worker pool (default concurrency: `5`) and share memoised project lookups
across the entire session. The behaviour can be tuned with the `GITLAB_DEPENDENCY_CONCURRENCY` environment variable or
programmatically through the optional `concurrency` parameter exposed by `processDependencies`.

Run the synthetic benchmark to see the impact of concurrency and caching on a typical workload:

```bash
npm run benchmark
```

Example output when executed on a 2023 MacBook Pro (Apple M2 Max):

```
Dependency Processing Benchmark
================================

Scenario: Baseline sequential processing (100 dependencies, 100 unique, concurrency=1)
  Run 1: 818.33ms | lookups=100 | allowlistChecks=100 | writes=100

Scenario: Bounded parallelism (100 dependencies, 100 unique, concurrency=5)
  Run 1: 162.29ms | lookups=100 | allowlistChecks=100 | writes=100

Scenario: Warm caches on repeated dependency set (100 dependencies, 25 unique, concurrency=5)
  Run 1: 39.46ms | lookups=25 | allowlistChecks=25 | writes=25
  Run 2: 0.27ms | lookups=0 | allowlistChecks=0 | writes=0
```

- **Sequential vs Parallel:** Bounding concurrency at five workers reduces synthetic processing time by roughly 80%
  compared to the sequential baseline without issuing more than five simultaneous GitLab requests.
- **Memoisation Effect:** Once a dependency is processed, both the GitLab project lookup and allow list checks are
  cached. Subsequent runs avoid any remote calls (see Run 2 above), which is particularly beneficial when the same
  dependencies appear across multiple projects.

When operating in environments with stricter API rate limits, lower the worker count via
`GITLAB_DEPENDENCY_CONCURRENCY=<desired_limit>` before invoking the CLI.

## Project Enumeration Filters

Running the CLI with `--all` now accepts a focused set of filters that reduce the API surface area:

- `--projects-per-page <number>` – adjust page size (1–100).
- `--projects-page-limit <number>` – stop pagination after a fixed number of pages.
- `--projects-search <query>` – restrict projects by name/path match.
- `--projects-membership` / `--projects-owned` – limit to projects tied to the token.
- `--projects-archived` – include archived projects (disabled by default).
- `--projects-simple` – request lightweight payloads to reduce response size.
- `--projects-min-access-level <level>` – filter out projects below a given access level.
- `--projects-order-by <field>` with `--projects-sort <direction>` – control sorting for deterministic batching.
- `--projects-visibility <scope>` – constrain results to a specific visibility.

These options are forwarded directly to `GitlabClient.getAllProjects`, enabling tailored scans without additional API
round-trips. Combine them with concurrency tuning to balance throughput and GitLab resource consumption.
