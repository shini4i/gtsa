import { FileProcessor } from './fileProcessor';
import { formatError } from '../utils/errorFormatter';
import LoggerService from '../services/logger';

/**
 * Shape of Composer repository entries relevant for dependency extraction.
 *
 * @property type - Repository type as defined in Composer metadata.
 * @property url - Repository target URL.
 */
interface Repository {
  type: string;
  url: string;
}

/**
 * Extracts GitLab-hosted repositories referenced within `composer.json` manifests.
 */
export class ComposerProcessor implements FileProcessor {
  private readonly unsupportedEndpoints = new Set<string>();

  /**
   * Parses a Composer manifest and captures dependency repository paths hosted on GitLab.
   *
   * @param fileContent - Raw JSON text from `composer.json`.
   * @param gitlabUrl - Base GitLab URL used to strip hostnames from repository URLs.
   * @returns Promise resolving to a list of dependency `path_with_namespace` strings.
  */
  extractDependencies(
    fileContent: string,
    gitlabUrl: string,
    logger: LoggerService,
    projectId: number,
  ): Promise<string[]> {
    const dependencies: string[] = [];
    const strippedUrl = gitlabUrl.replace('https://', '');

    try {
      const composerJson = JSON.parse(fileContent);
      if (composerJson.repositories && typeof composerJson.repositories === 'object') {
        for (const [key, repo] of Object.entries(composerJson.repositories)) {
          const repository = repo as Repository;
          if (repository.url && repository.url.includes(strippedUrl)) {
            if (this.isGroupEndpoint(repository.url, gitlabUrl, logger, projectId)) {
              continue;
            }

            const formattedDep = repository.url.replace(`https://${strippedUrl}/`, '');
            dependencies.push(formattedDep);
          } else {
            logger.logProject(
              projectId,
              `Skipping repository '${key}' with URL '${repository.url}' of unknown type '${repository.type}'`,
              'warn',
            );
          }
        }
      }
    } catch (error) {
      logger.logProject(projectId, `Failed to parse composer.json file: ${formatError(error)}`, 'error');
    }

    return Promise.resolve(dependencies);
  }

  private isGroupEndpoint(url: string, gitlabUrl: string, logger: LoggerService, projectId: number): boolean {
    try {
      const parsed = new URL(url);
      if (this.extractHost(parsed.origin) !== this.extractHost(gitlabUrl)) {
        return false;
      }

      const pathname = parsed.pathname.toLowerCase();
      if (!pathname.startsWith('/api/v4/groups/') && !pathname.startsWith('/api/v4/group/')) {
        return false;
      }

      if (!this.unsupportedEndpoints.has(pathname)) {
        this.unsupportedEndpoints.add(pathname);
        logger.logProject(
          projectId,
          `Skipping GitLab group package endpoint '${parsed.pathname}'. Group-level Composer packages cannot be allowlisted automatically.`,
          'warn',
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return url.replace(/^https?:\/\//, '').toLowerCase();
    }
  }
}
