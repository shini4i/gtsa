import { GitlabClient } from '../gitlab/gitlabClient';
import { processDependencies } from '../utils/dependencyProcessor';
import { ProjectReportEntry } from '../report/reportGenerator';
import { DependencyScanner } from './dependencyScanner';
import { DryRunReporter } from './reportingService';
import { formatError } from '../utils/errorFormatter';
import LoggerService from './logger';

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
   * @param logger - Logger responsible for rendering CLI output.
   * @param scanner - Optional custom dependency scanner instance (defaults to the built-in scanner).
   */
  constructor(
    private readonly gitlabClient: GitlabClient,
    private readonly logger: LoggerService,
    scanner?: DependencyScanner,
  ) {
    this.scanner = scanner ?? new DependencyScanner(gitlabClient, logger);
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
    this.logger.startProject(projectId);
    const result = await this.scanner.scan(projectId, options.monorepo);
    if (!result) {
      this.logger.failProject(projectId, 'Project could not be processed because metadata was unavailable.');
      return null;
    }

    if (!result.dependencies || result.dependencies.length === 0) {
      this.logger.logProject(projectId, 'No dependencies found to process.', 'warn');
      this.logger.completeProject(projectId, 'No dependency changes required.');
      return null;
    }

    if (options.dryRun) {
      this.logger.logProject(projectId, 'Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:');
      result.dependencies.forEach(dependency => this.logger.logProject(projectId, `- ${dependency}`));
      this.logger.completeProject(projectId, 'Dry run completed.');
      return {
        projectName: result.projectName,
        projectId: result.projectId,
        dependencies: result.dependencies,
      };
    }

    await processDependencies(this.gitlabClient, result.dependencies, result.projectId, this.logger);
    this.logger.completeProject(projectId, 'Token scope updated successfully.');
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
    const projects = await this.gitlabClient.getAllProjects(100, (current, total) => {
      this.logger.updateGlobalProgress('Fetching projects', current, total > 0 ? total : undefined);
    });

    if (!projects || projects.length === 0) {
      this.logger.warn('No projects available to process.');
      this.logger.clearGlobalProgress();
      return [];
    }

    const collectedEntries: ProjectReportEntry[] = [];
    const failures: ProjectAdjustmentFailure[] = [];

    this.logger.setTotalProjects(projects.length);

    if (options.dryRun && options.reporter) {
      await options.reporter.initialize();
    }

    for (const project of projects) {
      if (!project?.id) {
        this.logger.warn('Encountered a project without an ID, skipping...');
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
        this.logger.failProject(project.id, `Failed to adjust token scope: ${formatError(error)}`);
        failures.push({ projectId: project.id, cause: error });
      }
    }

    if (options.dryRun && options.reporter) {
      options.reporter.finalize();
    }

    this.logger.clearGlobalProgress();

    if (failures.length > 0) {
      const summary = failures
        .map(failure => `project ${failure.projectId}: ${(failure.cause instanceof Error && failure.cause.message) ? failure.cause.message : 'Unknown error'}`)
        .join('; ');
      throw new AdjustAllProjectsError(failures, `Failed to adjust token scope for ${failures.length} project(s): ${summary}`);
    }

    return collectedEntries;
  }
}
