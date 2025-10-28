import { FileProcessor } from './fileProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import { formatError } from '../utils/errorFormatter';
import LoggerService from '../services/logger';

interface ComposerLockFile {
  packages?: ComposerPackage[];
  'packages-dev'?: ComposerPackage[];
}

interface ComposerPackage {
  source?: ComposerPackageSource;
  dist?: ComposerPackageDist;
}

interface ComposerPackageSource {
  url?: string;
}

interface ComposerPackageDist {
  url?: string;
}

type ApiReference =
  | { type: 'id'; value: string }
  | { type: 'path'; value: string };

/**
 * Extracts GitLab-hosted dependencies from Composer lockfiles.
 */
export class ComposerLockProcessor implements FileProcessor {
  private readonly projectCache = new Map<string, string | null>();
  private readonly unsupportedReferences = new Set<string>();

  constructor(private readonly gitlabClient: GitlabClient) {
  }

  async extractDependencies(
    fileContent: string,
    gitlabUrl: string,
    logger: LoggerService,
    projectId: number,
  ): Promise<string[]> {
    let lockfile: ComposerLockFile;

    try {
      lockfile = JSON.parse(fileContent);
    } catch (error) {
      logger.logProject(projectId, `Failed to parse composer.lock file: ${formatError(error)}`, 'error');
      return [];
    }

    const packages = [
      ...(lockfile.packages ?? []),
      ...(lockfile['packages-dev'] ?? []),
    ];

    if (packages.length === 0) {
      return [];
    }

    const dependencies = new Set<string>();
    const host = this.extractHost(gitlabUrl);

    for (const composerPackage of packages) {
      const urls = [
        composerPackage.source?.url,
        composerPackage.dist?.url,
      ].filter((value): value is string => Boolean(value));

      for (const url of urls) {
        if (this.isUnsupportedEndpoint(url, host, logger, projectId)) {
          continue;
        }

        const directPath = this.extractProjectPath(url, host);
        if (directPath) {
          dependencies.add(directPath);
          continue;
        }

        const apiReference = this.extractApiReference(url, host);
        if (!apiReference) {
          continue;
        }

        if (apiReference.type === 'path') {
          dependencies.add(apiReference.value);
          continue;
        }

        const resolvedPath = await this.resolveProjectId(apiReference.value, logger, projectId);
        if (resolvedPath) {
          dependencies.add(resolvedPath);
        }
      }
    }

    return Array.from(dependencies);
  }

  private extractHost(url: string): string {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return url.replace(/^https?:\/\//, '').toLowerCase();
    }
  }

  private normalizeProjectPath(pathname: string): string | null {
    let normalized = pathname.replace(/^\/+/, '');
    if (!normalized) {
      return null;
    }

    const archiveDelimiter = normalized.indexOf('/-/');
    if (archiveDelimiter !== -1) {
      normalized = normalized.slice(0, archiveDelimiter);
    }

    normalized = normalized.replace(/\.git$/i, '');

    if (!normalized) {
      return null;
    }

    try {
      return decodeURIComponent(normalized);
    } catch {
      return normalized;
    }
  }

  private extractProjectPath(url: string, host: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== host) {
        return null;
      }

      const normalized = this.normalizeProjectPath(parsed.pathname);
      if (!normalized) {
        return null;
      }

      if (normalized.toLowerCase().startsWith('api/v4/projects/')) {
        return null;
      }

      return normalized;
    } catch {
      // Fall through to scp-like SSH URLs
    }

    const scpLikeMatch = url.match(/^git@([^:]+):(.+)$/i);
    if (!scpLikeMatch) {
      return null;
    }

    const [, hostname, path] = scpLikeMatch;
    if (hostname.toLowerCase() !== host) {
      return null;
    }

    const normalized = this.normalizeProjectPath(path);
    if (!normalized) {
      return null;
    }

    if (normalized.toLowerCase().startsWith('api/v4/projects/')) {
      return null;
    }

    return normalized;
  }

  private extractApiReference(url: string, host: string): ApiReference | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== host) {
        return null;
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      const projectsIndex = segments.findIndex(segment => segment === 'projects');
      if (projectsIndex === -1 || projectsIndex === segments.length - 1) {
        return null;
      }

      const reference = decodeURIComponent(segments[projectsIndex + 1]);
      if (!reference) {
        return null;
      }

      if (/^\d+$/.test(reference)) {
        return { type: 'id', value: reference };
      }

      return { type: 'path', value: reference };
    } catch {
      return null;
    }
  }

  private isUnsupportedEndpoint(
    url: string,
    host: string,
    logger: LoggerService,
    projectId: number,
  ): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== host) {
        return false;
      }

      const pathname = parsed.pathname.toLowerCase();
      if (!pathname.startsWith('/api/v4/groups/') && !pathname.startsWith('/api/v4/group/')) {
        return false;
      }

      if (!this.unsupportedReferences.has(pathname)) {
        this.unsupportedReferences.add(pathname);
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

  private async resolveProjectId(
    id: string,
    logger: LoggerService,
    sourceProjectId: number,
  ): Promise<string | null> {
    if (this.projectCache.has(id)) {
      return this.projectCache.get(id) ?? null;
    }

    try {
      const project = await this.gitlabClient.getProject(id);
      const path = project.path_with_namespace ?? null;
      this.projectCache.set(id, path);
      return path;
    } catch (error) {
      this.projectCache.set(id, null);
      logger.logProject(
        sourceProjectId,
        `Error fetching project ${id}: ${formatError(error)}`,
        'error',
      );
      return null;
    }
  }
}
