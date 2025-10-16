import { NewClientConfig } from '../config/clientConfig';
import { GitlabApiError } from '../gitlab/errors';
import { GitlabClient, GitlabClientOptions, NewGitlabClient } from '../gitlab/gitlabClient';
import { formatError } from './errorFormatter';

/**
 * Loads and validates the GitLab client configuration from environment variables.
 *
 * @returns An object containing the URL and token for the GitLab client.
 */
function createGitlabClientConfig(): { url: string; token: string } {
  const config = NewClientConfig();
  return { url: config.Url!, token: config.Token! };
}

/**
 * Lazily constructs an authenticated GitLab client using environment configuration.
 *
 * @returns Promise resolving to a GitLab client ready for API interactions.
 */
export async function getGitlabClient(): Promise<GitlabClient> {
  const { url, token } = createGitlabClientConfig();
  const options = createGitlabClientOptions();
  return options ? NewGitlabClient(url, token, options) : NewGitlabClient(url, token);
}

/**
 * Logs key metadata for the provided project.
 *
 * @param project - Project payload returned by GitLab.
 * @returns Promise that resolves once logging completes.
 */
async function logProjectDetails(project: any): Promise<void> {
  console.log('Project name:', project.path_with_namespace);
  console.log('Default branch:', project.default_branch);
}

/**
 * Rethrows errors encountered when fetching project details or dependency files with contextual logging.
 *
 * @param error - Original error thrown by the GitLab client.
 * @param projectId - Project identifier related to the failure.
 * @param context - Description of the attempted operation.
 * @throws The original error after logging.
 */
async function handleFetchError(error: any, projectId: number, context: string): Promise<void> {
  console.error(`Failed to ${context} for project ID ${projectId}: ${formatError(error)}`);
  throw error;
}

/**
 * Parses and validates numeric environment variables used for GitLab HTTP configuration.
 *
 * @param name - Environment variable name to read.
 * @param min - Optional minimum acceptable value (inclusive).
 * @returns Parsed integer value when present; otherwise `undefined`.
 * @throws Error when the variable is present but invalid or below the minimum value.
 */
function parseNumberEnv(name: string, min?: number): number | undefined {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`${name} must be a valid integer, but received "${rawValue}"`);
  }

  if (min !== undefined && parsedValue < min) {
    throw new Error(`${name} must be greater than or equal to ${min}, but received ${parsedValue}`);
  }

  return parsedValue;
}

/**
 * Builds GitLab client HTTP resilience options from the environment.
 *
 * @returns Populated options when any overrides are provided; otherwise `undefined`.
 */
function createGitlabClientOptions(): GitlabClientOptions | undefined {
  const timeoutMs = parseNumberEnv('GITLAB_HTTP_TIMEOUT_MS', 1);
  const maxRetries = parseNumberEnv('GITLAB_HTTP_MAX_RETRIES', 0);
  const retryDelayMs = parseNumberEnv('GITLAB_HTTP_RETRY_DELAY_MS', 0);

  const options: GitlabClientOptions = {};

  if (timeoutMs !== undefined) {
    options.timeoutMs = timeoutMs;
  }

  if (maxRetries !== undefined) {
    options.maxRetries = maxRetries;
  }

  if (retryDelayMs !== undefined) {
    options.retryDelayMs = retryDelayMs;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * Fetches project metadata and logs high-level information.
 *
 * @param gitlabClient - GitLab client used for the request.
 * @param projectId - Project identifier to fetch.
 * @returns Promise resolving to the project object, or `null` if not found.
 * @throws Error when the project cannot be retrieved for reasons other than not found.
 */
export async function fetchProjectDetails(gitlabClient: GitlabClient, projectId: number) {
  try {
    const project = await gitlabClient.getProject(projectId.toString());
    await logProjectDetails(project);
    return project;
  } catch (error) {
    if (error instanceof GitlabApiError && error.statusCode === 404) {
      console.warn(`Project ID ${projectId} not found or inaccessible. Skipping.`);
      return null;
    }
    await handleFetchError(error, projectId, 'fetch project details');
  }
}

/**
 * Emits console output summarising discovered dependency files.
 *
 * @param dependencyFiles - Paths to dependency manifests.
 * @returns Promise that resolves after logging.
 */
async function logDependencyFiles(dependencyFiles: string[]): Promise<void> {
  if (dependencyFiles.length === 0) {
    console.warn('No dependency files found');
  } else {
    console.log('Found the following dependency files:', dependencyFiles);
  }
}

/**
 * Retrieves dependency manifests for a project and reports the findings.
 *
 * @param gitlabClient - GitLab client responsible for API calls.
 * @param projectId - Numeric project identifier.
 * @param defaultBranch - Branch against which to query the repository tree.
 * @param monorepo - When true, performs a recursive tree traversal (monorepo support).
 * @returns Promise resolving to an array of manifest paths; empty array when none are found or accessible.
 * @throws Error when GitLab returns an unexpected response.
 */
export async function fetchDependencyFiles(gitlabClient: GitlabClient, projectId: number, defaultBranch: string, monorepo: boolean) {
  try {
    const dependencyFiles = await gitlabClient.findDependencyFiles(projectId.toString(), defaultBranch, monorepo);
    await logDependencyFiles(dependencyFiles);
    return dependencyFiles;
  } catch (error) {
    if (error instanceof GitlabApiError && error.statusCode === 404) {
      console.warn(`Repository tree not found for project ID ${projectId}; proceeding without dependency files.`);
      return [];
    }
    await handleFetchError(error, projectId, 'fetch dependency files');
  }
}
