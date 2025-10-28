import { ComposerLockProcessor } from './composerLockProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import LoggerService from '../services/logger';

describe('ComposerLockProcessor', () => {
  let gitlabClient: jest.Mocked<GitlabClient>;
  let processor: ComposerLockProcessor;
  let logger: LoggerService;

  beforeEach(() => {
    gitlabClient = {
      getProject: jest.fn(),
    } as unknown as jest.Mocked<GitlabClient>;
    processor = new ComposerLockProcessor(gitlabClient);
    logger = {
      logProject: jest.fn(),
    } as unknown as LoggerService;
  });

  it('extracts dependencies from source and dist URLs', async () => {
    gitlabClient.getProject.mockImplementation(async (id: string) => {
      if (id === '123') {
        return { path_with_namespace: 'group/api-resolved' } as never;
      }
      throw new Error(`Unexpected project id ${id}`);
    });

    const fileContent = JSON.stringify({
      packages: [
        {
          source: { url: 'https://gitlab.example.com/group/app.git' },
        },
        {
          dist: { url: 'https://gitlab.example.com/api/v4/projects/123/packages/composer/download' },
        },
      ],
      'packages-dev': [
        {
          source: { url: 'git@gitlab.example.com:group/dev-tool.git' },
        },
        {
          dist: { url: 'https://gitlab.example.com/api/v4/projects/group%2Fencoded-packages/archive.zip' },
        },
      ],
    });

    const dependencies = await processor.extractDependencies(
      fileContent,
      'https://gitlab.example.com',
      logger,
      42,
    );

    expect(dependencies.sort()).toEqual([
      'group/app',
      'group/api-resolved',
      'group/dev-tool',
      'group/encoded-packages',
    ].sort());
    expect(gitlabClient.getProject).toHaveBeenCalledWith('123');
  });

  it('returns an empty array when no packages are present', async () => {
    const fileContent = JSON.stringify({
      packages: [],
      'packages-dev': [],
    });

    const dependencies = await processor.extractDependencies(
      fileContent,
      'https://gitlab.example.com',
      logger,
      7,
    );

    expect(dependencies).toEqual([]);
    expect(gitlabClient.getProject).not.toHaveBeenCalled();
  });

  it('logs an error when lockfile cannot be parsed', async () => {
    const dependencies = await processor.extractDependencies(
      'not json',
      'https://gitlab.example.com',
      logger,
      99,
    );

    expect(dependencies).toEqual([]);
    expect(logger.logProject).toHaveBeenCalledWith(
      99,
      expect.stringContaining('Failed to parse composer.lock file'),
      'error',
    );
  });

  it('logs and skips dependencies when project lookup fails', async () => {
    gitlabClient.getProject.mockRejectedValue(new Error('boom'));

    const fileContent = JSON.stringify({
      packages: [
        {
          dist: { url: 'https://gitlab.example.com/api/v4/projects/456/packages/composer/download' },
        },
      ],
    });

    const dependencies = await processor.extractDependencies(
      fileContent,
      'https://gitlab.example.com',
      logger,
      55,
    );

    expect(dependencies).toEqual([]);
    expect(logger.logProject).toHaveBeenCalledWith(
      55,
      expect.stringContaining('Error fetching project 456:'),
      'error',
    );
  });

  it('warns when encountering group package endpoints and skips them', async () => {
    const fileContent = JSON.stringify({
      packages: [
        {
          dist: { url: 'https://gitlab.example.com/api/v4/groups/240/-/packages/composer/packages.json' },
        },
        {
          source: { url: 'https://gitlab.example.com/api/v4/groups/240/-/packages/composer/packages.json' },
        },
      ],
    });

    const dependencies = await processor.extractDependencies(
      fileContent,
      'https://gitlab.example.com',
      logger,
      77,
    );

    expect(dependencies).toEqual([]);
    expect(gitlabClient.getProject).not.toHaveBeenCalled();
    expect(logger.logProject).toHaveBeenCalledWith(
      77,
      "Skipping GitLab group package endpoint '/api/v4/groups/240/-/packages/composer/packages.json'. Group-level Composer packages cannot be allowlisted automatically.",
      'warn',
    );
  });
});
