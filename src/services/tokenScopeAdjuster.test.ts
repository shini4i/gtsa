import { AdjustAllProjectsError, TokenScopeAdjuster } from './tokenScopeAdjuster';
import { DependencyScanner } from './dependencyScanner';
import { DryRunReporter } from './reportingService';
import { processDependencies } from '../utils/dependencyProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import LoggerService from './logger';

jest.mock('../utils/dependencyProcessor');

describe('TokenScopeAdjuster', () => {
  const mockProcessDependencies = processDependencies as jest.MockedFunction<typeof processDependencies>;
  let scannerMock: { scan: jest.Mock };
  let gitlabClientMock: { getAllProjects: jest.Mock };
  let adjuster: TokenScopeAdjuster;
  let gitlabClient: GitlabClient;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    scannerMock = { scan: jest.fn() };
    gitlabClientMock = { getAllProjects: jest.fn() };
    gitlabClient = gitlabClientMock as unknown as GitlabClient;
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
    adjuster = new TokenScopeAdjuster(
      gitlabClient,
      logger,
      scannerMock as unknown as DependencyScanner,
    );
  });

  describe('adjustProject', () => {
    test('returns project entry in dry-run mode and logs dependencies', async () => {
      scannerMock.scan.mockResolvedValue({
        projectId: 1,
        projectName: 'group/project-1',
        defaultBranch: 'main',
        dependencies: ['dep1', 'dep2'],
      });

      const entry = await adjuster.adjustProject(1, { dryRun: true, monorepo: false });

      expect(entry).toEqual({
        projectId: 1,
        projectName: 'group/project-1',
        dependencies: ['dep1', 'dep2'],
      });
      expect(logger.startProject).toHaveBeenCalledWith(1);
      expect(logger.logProject).toHaveBeenCalledWith(
        1,
        'Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:',
      );
      expect(logger.logProject).toHaveBeenCalledWith(1, '- dep1');
      expect(logger.logProject).toHaveBeenCalledWith(1, '- dep2');
      expect(logger.completeProject).toHaveBeenCalledWith(1, 'Dry run completed.');
      expect(mockProcessDependencies).not.toHaveBeenCalled();
    });

    test('processes dependencies when not in dry-run mode', async () => {
      scannerMock.scan.mockResolvedValue({
        projectId: 1,
        projectName: 'group/project-1',
        defaultBranch: 'main',
        dependencies: ['dep1'],
      });

      const entry = await adjuster.adjustProject(1, { dryRun: false, monorepo: false });

      expect(entry).toBeNull();
      expect(mockProcessDependencies).toHaveBeenCalledWith(gitlabClient, ['dep1'], 1, logger);
      expect(logger.completeProject).toHaveBeenCalledWith(1, 'Token scope updated successfully.');
    });

    test('logs an error when no dependencies are found', async () => {
      scannerMock.scan.mockResolvedValue({
        projectId: 1,
        projectName: 'group/project-1',
        defaultBranch: 'main',
        dependencies: [],
      });

      const entry = await adjuster.adjustProject(1, { dryRun: false, monorepo: false });

      expect(entry).toBeNull();
      expect(logger.logProject).toHaveBeenCalledWith(1, 'No dependencies found to process.', 'warn');
      expect(logger.completeProject).toHaveBeenCalledWith(1, 'No dependency changes required.');
      expect(mockProcessDependencies).not.toHaveBeenCalled();
    });

    test('returns null when scanner cannot obtain project', async () => {
      scannerMock.scan.mockResolvedValue(null);

      const entry = await adjuster.adjustProject(1, { dryRun: true, monorepo: false });

      expect(entry).toBeNull();
      expect(logger.failProject).toHaveBeenCalledWith(1, 'Project could not be processed because metadata was unavailable.');
      expect(mockProcessDependencies).not.toHaveBeenCalled();
    });
  });

  describe('adjustAllProjects', () => {
    test('warns when no projects are returned', async () => {
      gitlabClientMock.getAllProjects.mockResolvedValue([]);

    const entries = await adjuster.adjustAllProjects({ dryRun: false, monorepo: false });

    expect(entries).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('No projects available to process.');
    expect(logger.clearGlobalProgress).toHaveBeenCalled();
    });

    test('skips projects without an ID', async () => {
      gitlabClientMock.getAllProjects.mockResolvedValue([
        { id: 1, path_with_namespace: 'existing', default_branch: 'main' },
        { path_with_namespace: 'missing-id', default_branch: 'main' } as any,
      ]);
      jest.spyOn(adjuster, 'adjustProject').mockResolvedValue(null);

      await adjuster.adjustAllProjects({ dryRun: false, monorepo: false });

      expect(logger.warn).toHaveBeenCalledWith('Encountered a project without an ID, skipping...');
      expect(adjuster.adjustProject).toHaveBeenCalledTimes(1);
      expect(logger.clearGlobalProgress).toHaveBeenCalled();
    });

    test('collects entries and interacts with reporter in dry-run mode', async () => {
      const reporter = {
        initialize: jest.fn(),
        append: jest.fn(),
        finalize: jest.fn(),
      } as unknown as DryRunReporter;
      const expectedEntry = {
        projectId: 1,
        projectName: 'group/project-1',
        dependencies: ['dep'],
      };

      gitlabClientMock.getAllProjects.mockResolvedValue([{ id: 1, path_with_namespace: 'group/project-1', default_branch: 'main' }]);
      jest.spyOn(adjuster, 'adjustProject').mockResolvedValue(expectedEntry);

      const entries = await adjuster.adjustAllProjects({ dryRun: true, monorepo: false, reporter });

      expect(logger.setTotalProjects).toHaveBeenCalledWith(1);
      expect(reporter.initialize).toHaveBeenCalled();
      expect(reporter.append).toHaveBeenCalledWith(expectedEntry);
      expect(reporter.finalize).toHaveBeenCalled();
      expect(entries).toEqual([expectedEntry]);
      expect(logger.clearGlobalProgress).toHaveBeenCalled();
    });

    test('logs errors from project adjustments and throws aggregated error', async () => {
      gitlabClientMock.getAllProjects.mockResolvedValue([{ id: 1, path_with_namespace: 'group/project-1', default_branch: 'main' }]);
      const expectedError = new Error('boom');
      jest.spyOn(adjuster, 'adjustProject').mockRejectedValue(expectedError);

      await expect(adjuster.adjustAllProjects({ dryRun: false, monorepo: false })).rejects.toBeInstanceOf(AdjustAllProjectsError);

      expect(logger.failProject).toHaveBeenCalledWith(1, 'Failed to adjust token scope: boom');
      expect(logger.clearGlobalProgress).toHaveBeenCalled();
    });
  });
});
