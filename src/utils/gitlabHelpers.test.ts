import { fetchDependencyFiles, fetchProjectDetails, getGitlabClient } from './gitlabHelpers';
import { GitlabClient, NewGitlabClient } from '../gitlab/gitlabClient';
import { NewClientConfig } from '../config/clientConfig';
import { GitlabApiError } from '../gitlab/errors';
import LoggerService from '../services/logger';

jest.mock('../gitlab/gitlabClient');
jest.mock('../config/clientConfig');

describe('gitlabHelpers', () => {
  let mockGitlabClient: jest.Mocked<GitlabClient>;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockGitlabClient = new GitlabClient('https://gitlab.example.com', 'test-token') as jest.Mocked<GitlabClient>;
    (GitlabClient as jest.Mock).mockReturnValue(mockGitlabClient);
    logger = {
      setTotalProjects: jest.fn(),
      startProject: jest.fn(),
      setProjectName: jest.fn(),
      logProject: jest.fn(),
      updateProjectProgress: jest.fn(),
      updateGlobalProgress: jest.fn(),
      clearGlobalProgress: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      completeProject: jest.fn(),
      failProject: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchProjectDetails', () => {
    it('should fetch project details successfully', async () => {
      const projectId = 1;
      const projectDetails = {
        id: projectId,
        path_with_namespace: 'namespace/project',
        default_branch: 'main',
      };
      mockGitlabClient.getProject.mockResolvedValue(projectDetails);

      const result = await fetchProjectDetails(mockGitlabClient, projectId, logger);
      expect(result).toEqual(projectDetails);
      expect(mockGitlabClient.getProject).toHaveBeenCalledWith(projectId.toString());
      expect(logger.setProjectName).toHaveBeenCalledWith(projectId, 'namespace/project');
      expect(logger.logProject).not.toHaveBeenCalledWith(projectId, 'Default branch: main');
    });

    it('should log an error and rethrow if fetching project details fails', async () => {
      const projectId = 1;
      const error = new Error('Failed to fetch project details');
      mockGitlabClient.getProject.mockRejectedValue(error);

      await expect(fetchProjectDetails(mockGitlabClient, projectId, logger)).rejects.toThrow(error);
      expect(mockGitlabClient.getProject).toHaveBeenCalledWith(projectId.toString());
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch project details for project ID 1'));
    });

    it('returns null and warns when project details 404', async () => {
      const projectId = 1;
      const apiError = new GitlabApiError('Not Found', {
        method: 'get',
        endpoint: 'projects/1',
        statusCode: 404,
        retryable: false,
      });
      mockGitlabClient.getProject.mockRejectedValue(apiError);

      const result = await fetchProjectDetails(mockGitlabClient, projectId, logger);

      expect(result).toBeNull();
      expect(mockGitlabClient.getProject).toHaveBeenCalledWith(projectId.toString());
      expect(logger.logProject).toHaveBeenCalledWith(projectId, 'Project ID 1 not found or inaccessible. Skipping.', 'warn');
    });
  });

  describe('fetchDependencyFiles', () => {
    it('should fetch dependency files successfully', async () => {
      const projectId = 1;
      const defaultBranch = 'main';
      const dependencyFiles = ['file1.txt', 'file2.txt'];
      mockGitlabClient.findDependencyFiles.mockResolvedValue(dependencyFiles);

      const result = await fetchDependencyFiles(mockGitlabClient, projectId, defaultBranch, false, logger);
      expect(result).toEqual(dependencyFiles);
      expect(mockGitlabClient.findDependencyFiles).toHaveBeenCalledWith(projectId.toString(), defaultBranch, false, expect.any(Function));
      expect(logger.logProject).toHaveBeenCalledWith(projectId, 'Found dependency files: file1.txt, file2.txt');
    });

    it('should log a warning and return an empty array if no dependency files are found', async () => {
      const projectId = 1;
      const defaultBranch = 'main';
      mockGitlabClient.findDependencyFiles.mockResolvedValue([]);

      const result = await fetchDependencyFiles(mockGitlabClient, projectId, defaultBranch, false, logger);
      expect(result).toEqual([]);
      expect(mockGitlabClient.findDependencyFiles).toHaveBeenCalledWith(projectId.toString(), defaultBranch, false, expect.any(Function));
      expect(logger.logProject).toHaveBeenCalledWith(projectId, 'No dependency files found.', 'warn');
    });

    it('should log an error and rethrow if fetching dependency files fails', async () => {
      const projectId = 1;
      const defaultBranch = 'main';
      const error = new Error('Failed to fetch dependency files');
      mockGitlabClient.findDependencyFiles.mockRejectedValue(error);

      await expect(fetchDependencyFiles(mockGitlabClient, projectId, defaultBranch, false, logger)).rejects.toThrow(error);
      expect(mockGitlabClient.findDependencyFiles).toHaveBeenCalledWith(projectId.toString(), defaultBranch, false, expect.any(Function));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch dependency files for project ID 1'));
    });

    it('returns empty array and warns when repository tree 404', async () => {
      const projectId = 1;
      const defaultBranch = 'main';
      const apiError = new GitlabApiError('Tree Not Found', {
        method: 'get',
        endpoint: 'projects/1/repository/tree',
        statusCode: 404,
        retryable: false,
      });
      mockGitlabClient.findDependencyFiles.mockRejectedValue(apiError);

      const result = await fetchDependencyFiles(mockGitlabClient, projectId, defaultBranch, false, logger);

      expect(result).toEqual([]);
      expect(logger.logProject).toHaveBeenCalledWith(
        projectId,
        'Repository tree not found for project ID 1; proceeding without dependency files.',
        'warn',
      );
    });

    it('updates progress and emits consumer progress events', async () => {
      const projectId = 7;
      const defaultBranch = 'main';
      const onProgress = jest.fn();

      mockGitlabClient.findDependencyFiles.mockImplementation(async (_project, _branch, _monorepo, progressCallback) => {
        progressCallback?.(1, 0);
        progressCallback?.(2, 4);
        return ['package.json'];
      });

      const result = await fetchDependencyFiles(mockGitlabClient, projectId, defaultBranch, true, logger, onProgress);

      expect(result).toEqual(['package.json']);
      expect(logger.updateProjectProgress).toHaveBeenNthCalledWith(1, projectId, 1, undefined, 'Fetching repository tree');
      expect(logger.updateProjectProgress).toHaveBeenNthCalledWith(2, projectId, 2, 4, 'Fetching repository tree');
      expect(onProgress).toHaveBeenCalledWith(1, 0);
      expect(onProgress).toHaveBeenCalledWith(2, 4);
    });
  });

  describe('getGitlabClient', () => {
    it('creates a client using configuration values', async () => {
      (NewClientConfig as jest.Mock).mockReturnValue({
        Url: 'https://gitlab.example.com',
        Token: 'test-token',
      });
      (NewGitlabClient as unknown as jest.Mock).mockReturnValue('client-instance');

      const client = await getGitlabClient();

      expect(NewClientConfig).toHaveBeenCalled();
      expect(NewGitlabClient).toHaveBeenCalledWith('https://gitlab.example.com', 'test-token');
      expect(client).toBe('client-instance');
    });

    it('passes HTTP resilience options from environment variables', async () => {
      (NewClientConfig as jest.Mock).mockReturnValue({
        Url: 'https://gitlab.example.com',
        Token: 'test-token',
      });
      (NewGitlabClient as unknown as jest.Mock).mockReturnValue('client-instance');

      process.env.GITLAB_HTTP_TIMEOUT_MS = '15000';
      process.env.GITLAB_HTTP_MAX_RETRIES = '3';
      process.env.GITLAB_HTTP_RETRY_DELAY_MS = '250';

      const client = await getGitlabClient();

      expect(NewGitlabClient).toHaveBeenCalledWith('https://gitlab.example.com', 'test-token', {
        timeoutMs: 15000,
        maxRetries: 3,
        retryDelayMs: 250,
      });
      expect(client).toBe('client-instance');

      delete process.env.GITLAB_HTTP_TIMEOUT_MS;
      delete process.env.GITLAB_HTTP_MAX_RETRIES;
      delete process.env.GITLAB_HTTP_RETRY_DELAY_MS;
    });

    it('throws when HTTP configuration values are invalid', async () => {
      (NewClientConfig as jest.Mock).mockReturnValue({
        Url: 'https://gitlab.example.com',
        Token: 'test-token',
      });

      process.env.GITLAB_HTTP_TIMEOUT_MS = 'invalid';

      await expect(getGitlabClient()).rejects.toThrow('GITLAB_HTTP_TIMEOUT_MS must be a valid integer');

      delete process.env.GITLAB_HTTP_TIMEOUT_MS;
    });

    it('enforces minimum values for HTTP configuration overrides', async () => {
      (NewClientConfig as jest.Mock).mockReturnValue({
        Url: 'https://gitlab.example.com',
        Token: 'test-token',
      });

      process.env.GITLAB_HTTP_MAX_RETRIES = '-1';

      await expect(getGitlabClient()).rejects.toThrow('GITLAB_HTTP_MAX_RETRIES must be greater than or equal to 0, but received -1');

      delete process.env.GITLAB_HTTP_MAX_RETRIES;
    });
  });
});
