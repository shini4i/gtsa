import axios, { AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import { ProgressReporter } from '../utils/progressReporter';
import { GitlabApiError } from './errors';

/**
 * Optional overrides that influence how the GitLab API client behaves.
 *
 * @property timeoutMs - Request timeout in milliseconds.
 * @property maxRetries - Number of retry attempts for retryable responses.
 * @property retryDelayMs - Base delay between retries in milliseconds.
 * @property httpClient - Custom axios instance to use instead of the default.
 */
export interface GitlabClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  httpClient?: AxiosInstance;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

/**
 * Thin wrapper around the GitLab REST API that injects authentication headers and
 * applies resilient retry logic suitable for CLI execution.
 */
export class GitlabClient {
  private readonly url: string;
  private readonly token: string;
  private readonly httpClient: AxiosInstance;
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

    this.httpClient = options.httpClient ?? axios.create();
    this.httpClient.defaults.baseURL = this.baseUrl;
    this.httpClient.defaults.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  private async executeRequest(method: Method, endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<any> {
    const fullEndpoint = `${this.baseUrl}/${endpoint}`;
    const headers = {
      'PRIVATE-TOKEN': this.token,
      'Content-Type': 'application/json',
      ...(config?.headers || {}),
    };

    const axiosConfig: AxiosRequestConfig = {
      ...config,
      method,
      url: endpoint,
      headers,
      data,
    };

    const maxAttempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.httpClient.request(axiosConfig);
      } catch (error) {
        const apiError = GitlabApiError.fromUnknown(error, method, fullEndpoint);
        if (attempt < maxAttempts && apiError.retryable) {
          await this.delay(this.retryDelayMs * attempt);
          continue;
        }
        throw apiError;
      }
    }
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
  async getProject(id: string) {
    return (await this.executeRequest('get', `projects/${id}`)).data;
  }

  /**
   * Iterates through every accessible project, streaming paginated results with a progress indicator.
   *
   * @param perPage - Page size requested from the GitLab API (default 100).
   * @returns Promise that resolves to a list of project objects.
   */
  async getAllProjects(perPage: number = 100) {
    const projects: any[] = [];
    let page = 1;
    let hasNextPage = true;
    const progress = new ProgressReporter('Fetching projects');
    let fetchedPages = 0;

    while (hasNextPage) {
      const response = await this.executeRequest('get', 'projects', null, {
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
        const totalPages = Number(totalPagesHeader);
        if (!Number.isNaN(totalPages)) {
          progress.setTotal(totalPages);
        }
      }

      fetchedPages++;
      progress.update(fetchedPages);

      projects.push(...response.data);
      const nextPageHeader = response.headers['x-next-page'];
      hasNextPage = Boolean(nextPageHeader && nextPageHeader !== '0');
      page++;
    }

    if (fetchedPages > 0) {
      progress.finish();
    }

    return projects;
  }

  /**
   * Resolves the numeric project ID for a given `path_with_namespace`.
   *
   * @param path_with_namespace - Full namespace-qualified project path.
   * @returns Promise that resolves to the numeric ID for the project.
   */
  async getProjectId(path_with_namespace: string) {
    return (await this.executeRequest('get', `projects/${encodeURIComponent(path_with_namespace)}`)).data.id;
  }

  /**
   * Checks whether a dependency project already allows CI job token access from the source project.
   *
   * @param sourceProjectId - Project requesting access.
   * @param depProjectId - Dependency project to inspect.
   * @returns Promise resolving to `true` when the dependency allow list already includes the source project.
   */
  async isProjectWhitelisted(sourceProjectId: number, depProjectId: number) {
    const allowList = (await this.executeRequest('get', `projects/${depProjectId}/job_token_scope/allowlist`)).data;
    return allowList.some((project: any) => project.id === sourceProjectId);
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
  async findDependencyFiles(id: string, branch: string, isMonorepo: boolean = false) {
    const targetFiles = ['go.mod', 'composer.json', 'package-lock.json'];
    let files: any[] = [];
    let page = 1;
    let hasNextPage = true;
    const progress = new ProgressReporter(`Fetching repository tree for ${id}`);
    let fetchedPages = 0;

    while (hasNextPage) {
      const response = await this.executeRequest('get', `projects/${id}/repository/tree`, null, {
        params: {
          ref: branch,
          recursive: isMonorepo, //Use isMonorepo flag to decide whether to fetch files recursively
          page,
          per_page: 20,
        },
      });

      const totalPagesHeader = response.headers['x-total-pages'];
      if (totalPagesHeader) {
        const totalPages = Number(totalPagesHeader);
        if (!Number.isNaN(totalPages)) {
          progress.setTotal(totalPages);
        }
      }

      fetchedPages++;
      progress.update(fetchedPages);

      files = files.concat(response.data);
      const nextPage = response.headers['x-next-page'];
      hasNextPage = nextPage !== '' && !isNaN(Number(nextPage));
      page++;
    }

    if (fetchedPages > 0) {
      progress.finish();
    }

    // If it's a monorepo, files parameter contains path to file
    return files.map((f: { path: any; name: any; }) => isMonorepo ? f.path : f.name)
      .filter((name: string) => targetFiles.some(file => name.endsWith(file)));
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
  async getFileContent(id: number, file_path: string, branch: string) {
    const encodedFilePath = encodeURIComponent(file_path);
    const response = await this.executeRequest('get', `projects/${id}/repository/files/${encodedFilePath}`, null, { params: { ref: branch } });

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
