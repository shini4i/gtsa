import { GitlabClient } from '../gitlab/gitlabClient';
import { processDependencies } from '../utils/dependencyProcessor';
import { ProjectReportEntry } from '../report/reportGenerator';
import { DependencyScanner } from './dependencyScanner';
import { DryRunReporter } from './reportingService';
import { formatError } from '../utils/errorFormatter';

/**
 * Options controlling how a single project adjustment is executed.
 *
 * @property dryRun - When true, only reports the adjustments without applying them.
 * @property monorepo - Enables recursive dependency discovery for monorepo repositories.
 */
export interface AdjustProjectOptions {
  dryRun: boolean;
  monorepo: boolean;
}

/**
 * Extends single-project options with reporter support for dry-run execution across multiple projects.
 *
 * @property reporter - Optional YAML reporter used when `dryRun` is enabled.
 */
export interface AdjustAllProjectsOptions extends AdjustProjectOptions {
  reporter?: DryRunReporter;
}

/**
 * Describes a project that failed to adjust along with the underlying error.
 *
 * @property projectId - Identifier of the project that failed to adjust.
 * @property cause - Underlying error or rejection reason.
 */
export interface ProjectAdjustmentFailure {
  projectId: number;
  cause: unknown;
}

/**
 * Aggregated error thrown when at least one project fails during bulk adjustment.
 *
 * @property failures - Collection of per-project failure details.
 */
export class AdjustAllProjectsError extends Error {
  readonly failures: ProjectAdjustmentFailure[];

  constructor(failures: ProjectAdjustmentFailure[], message?: string) {
    super(message ?? `Failed to adjust token scope for ${failures.length} project(s).`);
    this.name = 'AdjustAllProjectsError';
    this.failures = failures;
  }
}

/**
 * Coordinates dependency discovery and CI job token allow list updates for GitLab projects.
 */
export class TokenScopeAdjuster {
  private readonly scanner: DependencyScanner;

  /**
   * Creates a new adjuster bound to a GitLab client and dependency scanner.
   *
   * @param gitlabClient - API client used for GitLab interactions.
   * @param scanner - Optional custom dependency scanner instance (defaults to the built-in scanner).
   */
  constructor(private readonly gitlabClient: GitlabClient, scanner?: DependencyScanner) {
    this.scanner = scanner ?? new DependencyScanner(gitlabClient);
  }

  /**
   * Adjusts the CI job token scope for a single project, optionally returning dry-run data.
   *
   * @param projectId - Project identifier to process.
   * @param options - Execution flags such as dry-run and monorepo traversal.
   * @returns Report entry when in dry-run mode, otherwise `null`.
   * @throws DependencyProcessingError when dependency updates fail.
   */
  async adjustProject(projectId: number, options: AdjustProjectOptions): Promise<ProjectReportEntry | null> {
    const result = await this.scanner.scan(projectId, options.monorepo);
    if (!result) {
      return null;
    }

    if (!result.dependencies || result.dependencies.length === 0) {
      console.error('No dependencies found to process.');
      return null;
    }

    if (options.dryRun) {
      console.log('Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:');
      result.dependencies.forEach(dependency => console.log(`- ${dependency}`));
      return {
        projectName: result.projectName,
        projectId: result.projectId,
        dependencies: result.dependencies,
      };
    }

    await processDependencies(this.gitlabClient, result.dependencies, result.projectId);
    return null;
  }

  /**
   * Iterates over every accessible project, applying token scope adjustments and aggregating dry-run results.
   *
   * @param options - Execution flags and optional reporter for persisting dry-run output.
   * @returns Collected dry-run report entries when applicable.
   * @throws AdjustAllProjectsError when one or more projects fail.
   */
  async adjustAllProjects(options: AdjustAllProjectsOptions): Promise<ProjectReportEntry[]> {
    const projects = await this.gitlabClient.getAllProjects();

    if (!projects || projects.length === 0) {
      console.warn('No projects available to process.');
      return [];
    }

    const collectedEntries: ProjectReportEntry[] = [];
    const failures: ProjectAdjustmentFailure[] = [];

    if (options.dryRun && options.reporter) {
      await options.reporter.initialize();
    }

    for (const project of projects) {
      if (!project?.id) {
        console.warn('Encountered a project without an ID, skipping...');
        continue;
      }

      try {
        const entry = await this.adjustProject(project.id, options);

        if (entry) {
          collectedEntries.push(entry);

          if (options.dryRun && options.reporter) {
            await options.reporter.append(entry);
          }
        }
      } catch (error) {
        console.error(`Failed to adjust token scope for project ID ${project.id}: ${formatError(error)}`);
        failures.push({ projectId: project.id, cause: error });
      }
    }

    if (options.dryRun && options.reporter) {
      options.reporter.finalize();
    }

    if (failures.length > 0) {
      const summary = failures
        .map(failure => `project ${failure.projectId}: ${(failure.cause instanceof Error && failure.cause.message) ? failure.cause.message : 'Unknown error'}`)
        .join('; ');
      throw new AdjustAllProjectsError(failures, `Failed to adjust token scope for ${failures.length} project(s): ${summary}`);
    }

    return collectedEntries;
  }
}
