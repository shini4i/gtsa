import { GitlabClient } from '../gitlab/gitlabClient';
import { fetchDependencyFiles, fetchProjectDetails } from '../utils/gitlabHelpers';
import { processAllDependencyFiles } from '../utils/dependencyProcessor';
import LoggerService from './logger';

/**
 * Result returned by the dependency scanner containing project metadata and discovered dependencies.
 *
 * @property projectId - Numeric identifier of the scanned project.
 * @property projectName - Namespace-qualified project name.
 * @property defaultBranch - Branch against which manifests were resolved.
 * @property dependencies - List of dependency project paths.
 */
export interface DependencyScanResult {
  projectId: number;
  projectName: string;
  defaultBranch: string;
  dependencies: string[];
}

/**
 * High-level helper that orchestrates dependency discovery using GitLab helpers and file processors.
 */
export class DependencyScanner {
  /**
   * @param gitlabClient - API client used to query projects and repository trees.
   */
  constructor(private readonly gitlabClient: GitlabClient, private readonly logger: LoggerService) {}

  /**
   * Scans the specified project for dependency manifests and extracts GitLab-hosted dependencies.
   *
   * @param projectId - Project identifier to scan.
   * @param monorepo - Whether to enable recursive repository traversal.
   * @returns Scan result or `null` when the project cannot be inspected.
   * @throws DependencyProcessingError when dependency manifests fail to process.
   */
  async scan(projectId: number, monorepo: boolean): Promise<DependencyScanResult | null> {
    const project = await fetchProjectDetails(this.gitlabClient, projectId, this.logger);
    if (!project) {
      return null;
    }

    this.logger.logProject(projectId, `Processing project ${project.path_with_namespace} (ID: ${projectId})`);
    this.logger.logProject(projectId, `Default branch: ${project.default_branch}`);

    let dependencyFiles = await fetchDependencyFiles(
      this.gitlabClient,
      projectId,
      project.default_branch,
      monorepo,
      this.logger,
    );

    if (!dependencyFiles) {
      dependencyFiles = [];
    }

    const dependencies = await processAllDependencyFiles(
      this.gitlabClient,
      projectId,
      project.default_branch,
      dependencyFiles,
      this.logger,
    );

    return {
      projectId,
      projectName: project.path_with_namespace,
      defaultBranch: project.default_branch,
      dependencies,
    };
  }
}
