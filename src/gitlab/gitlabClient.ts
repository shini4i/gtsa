import axios, { AxiosInstance, Method } from 'axios';
import { GitlabApiError } from './errors';
import { AxiosHttpTransport, HttpRequestConfig, HttpResponse, HttpTransport } from './httpTransport';
import type {
  GitlabJobTokenAllowlistEntry,
  GitlabProject,
  GitlabRepositoryFile,
  GitlabRepositoryTreeItem,
} from './types';

/**
 * Optional overrides that influence how the GitLab API client behaves.
 *
 * @property timeoutMs - Request timeout in milliseconds.
 * @property maxRetries - Number of retry attempts for retryable responses.
 * @property retryDelayMs - Base delay between retries in milliseconds.
 * @property httpClient - Custom axios instance to use instead of the default when Axios transport is desired.
 * @property transport - Fully custom HTTP transport implementation for advanced scenarios or testing.
 */
export interface GitlabClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  httpClient?: AxiosInstance;
  transport?: HttpTransport;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

type RequestOverrides = Pick<HttpRequestConfig, 'headers' | 'params'>;

/**
 * Thin wrapper around the GitLab REST API that injects authentication headers and
 * applies resilient retry logic suitable for CLI execution.
 */
export class GitlabClient {
  private readonly url: string;
  private readonly token: string;
  private readonly transport: HttpTransport;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly baseUrl: string;

  /**
   * Creates a new API client bound to the provided GitLab instance and token.
   *
   * @param Url - Base GitLab URL, e.g. `https://gitlab.example.com`.
   * @param Token - Personal access token or CI token with API permissions.
   * @param options - HTTP behaviour overrides such as retries, timeouts, or a custom axios instance.
   */
  constructor(Url: string, Token: string, options: GitlabClientOptions = {}) {
    this.url = Url;
    this.token = Token;
    this.baseUrl = `${this.url}/api/v4`;

    if (options.transport) {
      this.transport = options.transport;
    } else {
      const axiosInstance = options.httpClient ?? axios.create();
      axiosInstance.defaults.baseURL = this.baseUrl;
      axiosInstance.defaults.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.transport = new AxiosHttpTransport(axiosInstance);
    }

    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /**
   * Returns the configured GitLab base URL.
   *
   * @returns Base URL configured for the client.
   */
  get Url(): string {
    return this.url;
  }

  private async executeRequest<T = unknown>(
    method: Method,
    endpoint: string,
    data?: unknown,
    config?: RequestOverrides,
  ): Promise<HttpResponse<T>> {
    const fullEndpoint = `${this.baseUrl}/${endpoint}`;
    const headers = {
      'PRIVATE-TOKEN': this.token,
      'Content-Type': 'application/json',
      ...(config?.headers ?? {}),
    };

    const requestConfig: HttpRequestConfig = {
      method,
      url: endpoint,
      headers,
      data,
      params: config?.params,
    };

    const maxAttempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.transport.request<T>(requestConfig);
      } catch (error) {
        const apiError = GitlabApiError.fromUnknown(error, method, fullEndpoint);
        if (attempt < maxAttempts && apiError.retryable) {
          await this.delay(this.retryDelayMs * attempt);
          continue;
        }
        throw apiError;
      }
    }

    /* istanbul ignore next -- safety net to satisfy exhaustive typing */
    throw new GitlabApiError('GitLab API request exhausted retry attempts.', {
      method,
      endpoint: fullEndpoint,
      retryable: false,
    });
  }

  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetches full project details for the given project ID.
   *
   * @param id - Numeric project identifier as a string.
   * @returns Promise that resolves to the project payload returned by GitLab.
   */
  async getProject(id: string): Promise<GitlabProject> {
    return (await this.executeRequest<GitlabProject>('get', `projects/${id}`)).data;
  }

  /**
   * Iterates through every accessible project, streaming paginated results with a progress indicator.
   *
   * @param perPage - Page size requested from the GitLab API (default 100).
   * @returns Promise that resolves to a list of project objects.
   */
  async getAllProjects(perPage: number = 100, onProgress?: (current: number, total: number) => void): Promise<GitlabProject[]> {
    const projects: GitlabProject[] = [];
    let page = 1;
    let hasNextPage = true;
    let fetchedPages = 0;
    let totalPages = 0;

    while (hasNextPage) {
      const response = await this.executeRequest<GitlabProject[]>('get', 'projects', undefined, {
        params: {
          page,
          per_page: perPage,
        },
      });

      if (!Array.isArray(response.data) || response.data.length === 0) {
        break;
      }

      const totalPagesHeader = response.headers['x-total-pages'];
      if (totalPagesHeader) {
        const parsedTotal = Number(totalPagesHeader);
        if (!Number.isNaN(parsedTotal)) {
          totalPages = parsedTotal;
        }
      }

      fetchedPages++;
      if (onProgress) {
        onProgress(fetchedPages, totalPages);
      }

      projects.push(...response.data);
      const nextPageHeader = response.headers['x-next-page'];
      hasNextPage = Boolean(nextPageHeader && nextPageHeader !== '0');
      page++;
    }

    return projects;
  }

  /**
   * Resolves the numeric project ID for a given `path_with_namespace`.
   *
   * @param path_with_namespace - Full namespace-qualified project path.
   * @returns Promise that resolves to the numeric ID for the project.
   */
  async getProjectId(path_with_namespace: string): Promise<number> {
    return (await this.executeRequest<GitlabProject>(
      'get',
      `projects/${encodeURIComponent(path_with_namespace)}`,
    )).data.id;
  }

  /**
   * Checks whether a dependency project already allows CI job token access from the source project.
   *
   * @param sourceProjectId - Project requesting access.
   * @param depProjectId - Dependency project to inspect.
   * @returns Promise resolving to `true` when the dependency allow list already includes the source project.
   */
  async isProjectWhitelisted(sourceProjectId: number, depProjectId: number): Promise<boolean> {
    const allowList = (await this.executeRequest<GitlabJobTokenAllowlistEntry[]>(
      'get',
      `projects/${depProjectId}/job_token_scope/allowlist`,
    )).data;
    return allowList.some(project => project.id === sourceProjectId);
  }

  /**
   * Adds a project to the CI job token allow list for the given source project.
   *
   * @param sourceProjectId - Project whose allowlist should be updated.
   * @param targetProjectId - Project to allow access for.
   * @returns Promise that resolves once the allow list has been updated.
   */
  async allowCiJobTokenAccess(sourceProjectId: string, targetProjectId: string) {
    await this.executeRequest('post', `projects/${sourceProjectId}/job_token_scope/allowlist`, {
      target_project_id: targetProjectId,
    });
  }

  /**
   * Searches the repository tree for supported dependency manifests.
   *
   * @param id - Target project ID.
   * @param branch - Branch or ref to inspect.
   * @param isMonorepo - When true, traverses the tree recursively to support monorepo layouts.
   * @returns Promise resolving to discovered file paths relative to the repository root.
   */
  async findDependencyFiles(
    id: string,
    branch: string,
    isMonorepo: boolean = false,
    onProgress?: (current: number, total: number) => void,
  ): Promise<string[]> {
    const targetFiles = ['go.mod', 'composer.json', 'package-lock.json'];
    let files: GitlabRepositoryTreeItem[] = [];
    let page = 1;
    let hasNextPage = true;
    let fetchedPages = 0;
    let totalPages = 0;

    while (hasNextPage) {
      const response = await this.executeRequest<GitlabRepositoryTreeItem[]>(
        'get',
        `projects/${id}/repository/tree`,
        undefined,
        {
          params: {
            ref: branch,
            recursive: isMonorepo, //Use isMonorepo flag to decide whether to fetch files recursively
            page,
            per_page: 20,
          },
        });

      const totalPagesHeader = response.headers['x-total-pages'];
      if (totalPagesHeader) {
        const parsedTotal = Number(totalPagesHeader);
        if (!Number.isNaN(parsedTotal)) {
          totalPages = parsedTotal;
        }
      }

      fetchedPages++;
      if (onProgress) {
        onProgress(fetchedPages, totalPages);
      }

      files = files.concat(response.data);
      const nextPage = response.headers['x-next-page'];
      hasNextPage = nextPage !== '' && !isNaN(Number(nextPage));
      page++;
    }

    // If it's a monorepo, files parameter contains path to file
    return files
      .map(file => (isMonorepo ? file.path : file.name))
      .filter((name): name is string => typeof name === 'string' && targetFiles.some(file => name.endsWith(file)));
  }

  /**
   * Downloads the decoded contents of a repository file.
   *
   * @param id - Project identifier.
   * @param file_path - Path to the file within the repository.
   * @param branch - Ref specifying which version of the file to retrieve.
   * @returns Promise resolving to the UTF-8 decoded file contents.
   * @throws Error when GitLab returns an unexpected encoding.
   */
  async getFileContent(id: number, file_path: string, branch: string): Promise<string> {
    const encodedFilePath = encodeURIComponent(file_path);
    const response = await this.executeRequest<GitlabRepositoryFile>(
      'get',
      `projects/${id}/repository/files/${encodedFilePath}`,
      undefined,
      { params: { ref: branch } },
    );

    if (response.data.encoding !== 'base64') {
      throw new Error('Unexpected encoding of file content received from GitLab API');
    }

    return Buffer.from(response.data.content, 'base64').toString('utf8');
  }
}

/**
 * Convenience factory that returns a {@link GitlabClient} with the provided settings.
 *
 * @param Url - Base GitLab URL.
 * @param Token - API token used for authentication.
 * @param options - Client configuration overrides.
 * @returns Instantiated {@link GitlabClient}.
 */
export function NewGitlabClient(Url: string, Token: string, options?: GitlabClientOptions) {
  return new GitlabClient(Url, Token, options);
}
