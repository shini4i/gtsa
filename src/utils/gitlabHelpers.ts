import { NewClientConfig } from '../config/clientConfig';
import { GitlabApiError } from '../gitlab/errors';
import { GitlabClient, GitlabClientOptions, NewGitlabClient } from '../gitlab/gitlabClient';
import { formatError } from './errorFormatter';

/**
 * Creates the GitLab client configuration.
 * @returns {Object} An object containing the URL and token for the GitLab client.
 */
function createGitlabClientConfig(): { url: string; token: string } {
  const config = NewClientConfig();
  return { url: config.Url!, token: config.Token! };
}

/**
 * Creates a new GitLab client instance.
 * @returns {Promise<GitlabClient>} A promise that resolves to a GitLab client instance.
 */
export async function getGitlabClient(): Promise<GitlabClient> {
  const { url, token } = createGitlabClientConfig();
  const options = createGitlabClientOptions();
  return options ? NewGitlabClient(url, token, options) : NewGitlabClient(url, token);
}

/**
 * Logs the details of a project.
 * @param {Object} project - The project object containing details to log.
 * @returns {Promise<void>} A promise that resolves when the logging is complete.
 */
async function logProjectDetails(project: any): Promise<void> {
  console.log('Project name:', project.path_with_namespace);
  console.log('Default branch:', project.default_branch);
}

/**
 * Handles errors that occur during fetch operations.
 * @param {Error} error - The error object.
 * @param {number} projectId - The ID of the project for which the error occurred.
 * @param {string} context - The context in which the error occurred.
 * @returns {Promise<void>} A promise that resolves when the error handling is complete.
 */
async function handleFetchError(error: any, projectId: number, context: string): Promise<void> {
  console.error(`Failed to ${context} for project ID ${projectId}: ${formatError(error)}`);
  throw error;
}

/**
 * Parses numeric environment variables for GitLab HTTP configuration.
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
 * Fetches the details of a project.
 * @param {GitlabClient} gitlabClient - The GitLab client instance.
 * @param {number} projectId - The ID of the project to fetch details for.
 * @returns {Promise<Object>} A promise that resolves to the project details.
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
 * Logs the list of dependency files.
 * @param {string[]} dependencyFiles - The list of dependency files to log.
 * @returns {Promise<void>} A promise that resolves when the logging is complete.
 */
async function logDependencyFiles(dependencyFiles: string[]): Promise<void> {
  if (dependencyFiles.length === 0) {
    console.warn('No dependency files found');
  } else {
    console.log('Found the following dependency files:', dependencyFiles);
  }
}

/**
 * Fetches the dependency files for a project.
 * @param {GitlabClient} gitlabClient - The GitLab client instance.
 * @param {number} projectId - The ID of the project to fetch dependency files for.
 * @param {string} defaultBranch - The default branch of the project.
 * @param {boolean} monorepo - Flag indicating whether the project should be treated as a monorepo or not.
 * @returns {Promise<string[]>} A promise that resolves to the list of dependency files.
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
