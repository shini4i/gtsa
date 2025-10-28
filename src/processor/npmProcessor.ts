import { FileProcessor } from './fileProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import { formatError } from '../utils/errorFormatter';
import LoggerService from '../services/logger';

/**
 * Minimal subset of fields parsed from an npm `package-lock.json` file.
 *
 * @property dependencies - Top-level dependency map keyed by package name.
 */
interface PackageLock {
  dependencies: Record<string, Dependency>;
}

/**
 * Tree node describing a single dependency entry within a lockfile.
 *
 * @property version - Resolved semantic version for the dependency.
 * @property resolved - Full URL where the package tarball was downloaded.
 * @property integrity - Integrity hash as recorded in the lockfile.
 * @property peer - Indicates whether the dependency is a peer dependency.
 * @property dependencies - Nested dependencies for this node.
 */
interface Dependency {
  version: string;
  resolved: string;
  integrity: string;
  peer?: boolean;
  dependencies?: Record<string, Dependency>;
}

/**
 * Processes npm `package-lock.json` files to discover GitLab package dependencies.
 */
export class NpmProcessor implements FileProcessor {
  private gitlabClient: GitlabClient;

  /**
   * @param gitlabClient - GitLab client used to resolve dependency project details.
   */
  constructor(gitlabClient: GitlabClient) {
    this.gitlabClient = gitlabClient;
  }

  /**
   * Parses an npm lockfile looking for dependency entries resolved from the GitLab instance.
   *
   * @param fileContent - Raw JSON contents of `package-lock.json`.
   * @param gitlabUrl - Base GitLab URL used to normalise project identifiers.
   * @param logger - Logger used for emitting diagnostic messages.
   * @param projectId - Identifier of the project currently being processed.
   * @returns Promise resolving to a de-duplicated list of dependency project paths.
   */
  async extractDependencies(
    fileContent: string,
    gitlabUrl: string,
    logger: LoggerService,
    projectId: number,
  ): Promise<string[]> {
    const packageLock: PackageLock = JSON.parse(fileContent);
    const projectIds = new Set<string>();
    const stack = [packageLock.dependencies];

    while (stack.length > 0) {
      const deps = stack.pop();
      if (!deps) continue;

      for (const details of Object.values(deps)) {
        await this.processDependency(details, gitlabUrl, projectIds, stack, logger, projectId);
      }
    }

    return Array.from(projectIds);
  }

  private async processDependency(
    details: Dependency,
    gitlabUrl: string,
    projectIds: Set<string>,
    stack: Record<string, Dependency>[],
    logger: LoggerService,
    projectId: number,
  ) {
    if (details.resolved) {
      const dependencyProjectId = this.extractProjectId(details.resolved, gitlabUrl);
      if (dependencyProjectId) {
        await this.addProjectToSet(dependencyProjectId, projectIds, logger, projectId);
      }
      if (details.dependencies) {
        stack.push(details.dependencies);
      }
    }
  }

  private async addProjectToSet(
    projectId: string,
    projectIds: Set<string>,
    logger: LoggerService,
    sourceProjectId: number,
  ) {
    try {
      const project = await this.gitlabClient.getProject(projectId);
      if (project.path_with_namespace) {
        projectIds.add(project.path_with_namespace);
      }
    } catch (error) {
      logger.logProject(
        sourceProjectId,
        `Error fetching project ${projectId}: ${formatError(error)}`,
        'error',
      );
    }
  }

  private extractProjectId(resolvedUrl: string, gitlabUrl: string): string | null {
    const escapedGitlabUrl = escapeRegExp(gitlabUrl);
    const regex = new RegExp(`${escapedGitlabUrl}/api/v4/projects/(\\d+)/packages`);
    const match = regex.exec(resolvedUrl);
    return match ? match[1] : null;
  }
}

/**
 * Escapes a string for safe inclusion within a regular expression literal.
 *
 * @param value - The raw string value to escape.
 * @returns A regex-safe version of the input string.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
}
