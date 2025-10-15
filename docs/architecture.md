# Architecture Overview

This document outlines the core modules involved in adjusting GitLab CI job token scopes. Each section explains responsibilities, collaborators, and extension points so new contributors can navigate the codebase quickly.

## Execution Flow
- **CLI (`src/cli.ts`)** – Parses Commander options and routes execution to the script entry points.
- **Script Entrypoints (`src/scripts/adjust-token-scope.ts`)** – Resolve runtime dependencies (GitLab client, optional reporter) and delegate to the service layer.
- **Service Layer (`src/services`)** – Encapsulates orchestration:
  - `TokenScopeAdjuster` owns the end-to-end workflow for a single project or all accessible projects.
  - `DependencyScanner` gathers project metadata, dependency manifests, and extracted dependency projects.
  - `DryRunReporter` persists dry-run results to YAML and tracks report availability.

## GitLab Integration
- **Configuration (`src/config/clientConfig.ts`)** validates `GITLAB_URL` and `GITLAB_TOKEN` before client creation.
- **Client Factory (`src/utils/gitlabHelpers.ts`)** wires configuration into `GitlabClient`, provides helper wrappers, and centralises logging for fetch operations.
- **GitLab Client (`src/gitlab/gitlabClient.ts`)** wraps Axios calls to GitLab REST endpoints, handling pagination and repository traversal. It is injected wherever API access is required so tests can stub the dependency.

## Dependency Processing
- **Scanner (`src/services/dependencyScanner.ts`)** composes helpers to produce a `DependencyScanResult` (project metadata + dependency list). The scanner does not mutate state, enabling re-use and targeted testing.
- **Dependency Processing Utilities (`src/utils/dependencyProcessor.ts`)** fetch and parse dependency files, then either aggregate discovered projects (for dry runs) or request token allowlisting when adjustments are enabled.

## File Processor Registry
- **Registry (`src/processor/fileProcessor.ts`)** exposes `registerFileProcessor`, `resetFileProcessorRegistry`, and `createFileProcessor`.
  - Default processors (`go.mod`, `composer.json`, `package-lock.json`) register on module load.
  - Consumers can register additional processors without editing the core switch statement. Factories receive the current `GitlabClient` so they can fetch supplemental data if needed.
  - Tests and tooling can call `resetFileProcessorRegistry()` to restore the default state.
- **Concrete Processors (`src/processor/*.ts`)** implement the `FileProcessor` contract to extract project identifiers from language-specific manifests.

## Reporting
- **YAML Reporter (`src/report/reportGenerator.ts`)** serialises dry-run results. `DryRunReporter` composes this module to provide initialization, append, and finalize hooks, keeping file system access contained in one place.

## Extensibility at a Glance
- Add a new manifest type by implementing `FileProcessor` and calling `registerFileProcessor('<filename>', factory)`.
- Swap or mock GitLab access by injecting a custom `GitlabClient` into `TokenScopeAdjuster`.
- Customize dry-run persistence by substituting the `DryRunReporter` implementation (same method signature) at construction time.

