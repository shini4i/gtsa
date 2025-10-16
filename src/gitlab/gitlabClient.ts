import axios, { AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import { ProgressReporter } from '../utils/progressReporter';
import { GitlabApiError } from './errors';

export interface GitlabClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  httpClient?: AxiosInstance;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

export class GitlabClient {
  private readonly url: string;
  private readonly token: string;
  private readonly httpClient: AxiosInstance;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly baseUrl: string;

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

  async getProject(id: string) {
    return (await this.executeRequest('get', `projects/${id}`)).data;
  }

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

  async getProjectId(path_with_namespace: string) {
    return (await this.executeRequest('get', `projects/${encodeURIComponent(path_with_namespace)}`)).data.id;
  }

  async isProjectWhitelisted(sourceProjectId: number, depProjectId: number) {
    const allowList = (await this.executeRequest('get', `projects/${depProjectId}/job_token_scope/allowlist`)).data;
    return allowList.some((project: any) => project.id === sourceProjectId);
  }

  async allowCiJobTokenAccess(sourceProjectId: string, targetProjectId: string) {
    await this.executeRequest('post', `projects/${sourceProjectId}/job_token_scope/allowlist`, {
      target_project_id: targetProjectId,
    });
  }

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

  async getFileContent(id: number, file_path: string, branch: string) {
    const encodedFilePath = encodeURIComponent(file_path);
    const response = await this.executeRequest('get', `projects/${id}/repository/files/${encodedFilePath}`, null, { params: { ref: branch } });

    if (response.data.encoding !== 'base64') {
      throw new Error('Unexpected encoding of file content received from GitLab API');
    }

    return Buffer.from(response.data.content, 'base64').toString('utf8');
  }
}

export function NewGitlabClient(Url: string, Token: string, options?: GitlabClientOptions) {
  return new GitlabClient(Url, Token, options);
}
