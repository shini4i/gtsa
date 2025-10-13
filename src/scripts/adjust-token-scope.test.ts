import { adjustTokenScope, adjustTokenScopeForAllProjects } from './adjust-token-scope';
import { GitlabClient } from '../gitlab/gitlabClient';
import { ProjectReportEntry, writeYamlReport } from '../report/reportGenerator';
import { fetchDependencyFiles, fetchProjectDetails, getGitlabClient } from '../utils/gitlabHelpers';
import { processAllDependencyFiles, processDependencies } from '../utils/dependencyProcessor';

jest.mock('../utils/gitlabHelpers');
jest.mock('../utils/dependencyProcessor');
jest.mock('../report/reportGenerator');

describe('adjust-token-scope', () => {
  const mockGetGitlabClient = getGitlabClient as jest.MockedFunction<typeof getGitlabClient>;
  const mockFetchProjectDetails = fetchProjectDetails as jest.MockedFunction<typeof fetchProjectDetails>;
  const mockFetchDependencyFiles = fetchDependencyFiles as jest.MockedFunction<typeof fetchDependencyFiles>;
  const mockProcessAllDependencyFiles = processAllDependencyFiles as jest.MockedFunction<typeof processAllDependencyFiles>;
  const mockProcessDependencies = processDependencies as jest.MockedFunction<typeof processDependencies>;
  const mockWriteYamlReport = writeYamlReport as jest.MockedFunction<typeof writeYamlReport>;

  const gitlabClientStub: Partial<GitlabClient> = {
    getAllProjects: jest.fn(),
  };

  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetGitlabClient.mockResolvedValue(gitlabClientStub as GitlabClient);
    (gitlabClientStub.getAllProjects as jest.Mock).mockResolvedValue([
      { id: 1, path_with_namespace: 'group/project-1' },
      { id: 2, path_with_namespace: 'group/project-2' },
    ]);

    mockFetchProjectDetails.mockImplementation(async (_client, projectId) => ({
      id: projectId,
      path_with_namespace: `group/project-${projectId}`,
      default_branch: 'main',
    }));

    mockFetchDependencyFiles.mockResolvedValue(['package-lock.json']);
    mockProcessAllDependencyFiles.mockImplementation(async (_client, projectId) => projectId === 1 ? ['dep1', 'dep2'] : []);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('writes report when dry-run is enabled with report path', async () => {
    await adjustTokenScopeForAllProjects(true, false, 'report.yaml');

    const expectedEntries: ProjectReportEntry[] = [
      {
        projectName: 'group/project-1',
        projectId: 1,
        dependencies: ['dep1', 'dep2'],
      },
    ];

    expect(mockWriteYamlReport).toHaveBeenNthCalledWith(1, [], 'report.yaml');
    expect(mockWriteYamlReport).toHaveBeenNthCalledWith(2, expectedEntries, 'report.yaml');
    expect(mockProcessDependencies).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Dry run report initialized at report.yaml');
    expect(logSpy).toHaveBeenCalledWith('Dry run report updated with group/project-1');
    expect(logSpy).toHaveBeenCalledWith('Dry run report available at report.yaml');
  });

  test('does not write report when dry-run disabled', async () => {
    await adjustTokenScopeForAllProjects(false, false, 'report.yaml');
    expect(mockWriteYamlReport).not.toHaveBeenCalled();
    expect(mockProcessDependencies).toHaveBeenCalled();
  });

  test('handles failures when writing report gracefully', async () => {
    mockWriteYamlReport.mockRejectedValueOnce(new Error('write failed'));
    await adjustTokenScopeForAllProjects(true, false, 'report.yaml');
    expect(mockWriteYamlReport).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith('Failed to initialize dry run report at report.yaml:', expect.any(Error));
    expect(logSpy).toHaveBeenCalledWith('Dry run report available at report.yaml');
  });

  test('still logs dependency information when generating report', async () => {
    await adjustTokenScopeForAllProjects(true, false, 'report.yaml');

    expect(logSpy).toHaveBeenCalledWith('Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:');
    expect(logSpy).toHaveBeenCalledWith('- dep1');
    expect(logSpy).toHaveBeenCalledWith('- dep2');
  });

  test('warns when report cannot be generated', async () => {
    mockWriteYamlReport.mockRejectedValue(new Error('write failed'));
    await adjustTokenScopeForAllProjects(true, false, 'report.yaml');
    expect(warnSpy).toHaveBeenCalledWith('Dry run report could not be generated at report.yaml due to earlier errors.');
    expect(logSpy).not.toHaveBeenCalledWith('Dry run report available at report.yaml');
  });

  test('returns early when project details cannot be retrieved', async () => {
    mockFetchProjectDetails.mockImplementationOnce(async () => null);

    await adjustTokenScope(1, false, false);

    expect(warnSpy).toHaveBeenCalledWith('Skipping project ID 1 because details could not be retrieved.');
    expect(mockProcessAllDependencyFiles).not.toHaveBeenCalled();
  });

  test('falls back to an empty dependency file list when helper returns null', async () => {
    mockFetchDependencyFiles.mockResolvedValueOnce(null as unknown as string[]);
    mockProcessAllDependencyFiles.mockResolvedValueOnce(['dep-only']);

    await adjustTokenScope(1, true, false);

    expect(mockProcessAllDependencyFiles).toHaveBeenCalledWith(gitlabClientStub, 1, 'main', []);
    expect(mockProcessDependencies).not.toHaveBeenCalled();
  });

  test('warns and exits when no projects are available', async () => {
    (gitlabClientStub.getAllProjects as jest.Mock).mockResolvedValueOnce([]);

    await adjustTokenScopeForAllProjects(false, false, 'report.yaml');

    expect(warnSpy).toHaveBeenCalledWith('No projects available to process.');
    expect(mockFetchProjectDetails).not.toHaveBeenCalled();
  });

  test('skips projects without an id', async () => {
    (gitlabClientStub.getAllProjects as jest.Mock).mockResolvedValueOnce([
      { id: 1, path_with_namespace: 'group/project-1' },
      { path_with_namespace: 'group/missing-id' },
      { id: 2, path_with_namespace: 'group/project-2' },
    ]);

    await adjustTokenScopeForAllProjects(false, false);

    expect(warnSpy).toHaveBeenCalledWith('Encountered a project without an ID, skipping...');
    expect(mockFetchProjectDetails).toHaveBeenCalledTimes(2);
  });

  test('logs an error when adjusting a project fails', async () => {
    const expectedError = new Error('boom');
    mockFetchProjectDetails
      .mockImplementationOnce(async (_client, projectId) => ({
        id: projectId,
        path_with_namespace: `group/project-${projectId}`,
        default_branch: 'main',
      }))
      .mockImplementationOnce(async () => {
        throw expectedError;
      });

    await adjustTokenScopeForAllProjects(false, false);

    expect(errorSpy).toHaveBeenCalledWith('Failed to adjust token scope for project ID 2:', expectedError);
  });
});
