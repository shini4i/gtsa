import { adjustTokenScope, adjustTokenScopeForAllProjects } from './adjust-token-scope';
import { getGitlabClient } from '../utils/gitlabHelpers';
import { TokenScopeAdjuster } from '../services/tokenScopeAdjuster';
import { DryRunReporter } from '../services/reportingService';
import LoggerService from '../services/logger';

jest.mock('../utils/gitlabHelpers');
jest.mock('../services/tokenScopeAdjuster');
jest.mock('../services/reportingService');

describe('adjust-token-scope entrypoints', () => {
  const mockGetGitlabClient = getGitlabClient as jest.MockedFunction<typeof getGitlabClient>;
  const TokenScopeAdjusterMock = TokenScopeAdjuster as unknown as jest.MockedClass<typeof TokenScopeAdjuster>;
  const DryRunReporterMock = DryRunReporter as unknown as jest.MockedClass<typeof DryRunReporter>;

  const gitlabClientStub = {} as any;
  const loggerStub = {
    setTotalProjects: jest.fn(),
    updateGlobalProgress: jest.fn(),
    clearGlobalProgress: jest.fn(),
  } as unknown as LoggerService;
  const adjusterInstance = {
    adjustProject: jest.fn(),
    adjustAllProjects: jest.fn(),
  };
  const reporterInstance = {
    initialize: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn(),
  } as unknown as DryRunReporter;

  beforeEach(() => {
    jest.resetAllMocks();
    mockGetGitlabClient.mockResolvedValue(gitlabClientStub);
    TokenScopeAdjusterMock.mockImplementation(() => adjusterInstance as unknown as TokenScopeAdjuster);
    DryRunReporterMock.mockImplementation(() => reporterInstance);
    adjusterInstance.adjustProject.mockResolvedValue(null);
    adjusterInstance.adjustAllProjects.mockResolvedValue([]);
  });

  test('adjustTokenScope delegates to TokenScopeAdjuster', async () => {
    await adjustTokenScope(42, true, false, loggerStub);

    expect(mockGetGitlabClient).toHaveBeenCalled();
    expect(TokenScopeAdjusterMock).toHaveBeenCalledWith(gitlabClientStub, loggerStub);
    expect(adjusterInstance.adjustProject).toHaveBeenCalledWith(42, { dryRun: true, monorepo: false });
  });

  test('adjustTokenScopeForAllProjects passes reporter when dry-run and report provided', async () => {
    await adjustTokenScopeForAllProjects(true, true, 'report.yaml', loggerStub, undefined);

    expect(mockGetGitlabClient).toHaveBeenCalled();
    expect(TokenScopeAdjusterMock).toHaveBeenCalledWith(gitlabClientStub, loggerStub);
    expect(DryRunReporterMock).toHaveBeenCalledWith('report.yaml', loggerStub);
    expect(adjusterInstance.adjustAllProjects).toHaveBeenCalledWith({
      dryRun: true,
      monorepo: true,
      reporter: reporterInstance,
      projectQuery: undefined,
      concurrency: undefined,
      projectTimeoutMs: undefined,
    });
  });

  test('adjustTokenScopeForAllProjects omits reporter when not in dry-run mode', async () => {
    await adjustTokenScopeForAllProjects(false, false, 'report.yaml', loggerStub, undefined);

    expect(DryRunReporterMock).not.toHaveBeenCalled();
    expect(adjusterInstance.adjustAllProjects).toHaveBeenCalledWith({
      dryRun: false,
      monorepo: false,
      reporter: undefined,
      projectQuery: undefined,
      concurrency: undefined,
      projectTimeoutMs: undefined,
    });
  });

  test('adjustTokenScopeForAllProjects forwards project filters to the adjuster', async () => {
    const projectQuery = { search: 'runner', perPage: 50 };

    await adjustTokenScopeForAllProjects(true, false, undefined, loggerStub, projectQuery);

    expect(adjusterInstance.adjustAllProjects).toHaveBeenCalledWith({
      dryRun: true,
      monorepo: false,
      reporter: undefined,
      projectQuery,
      concurrency: undefined,
      projectTimeoutMs: undefined,
    });
  });

  test('adjustTokenScopeForAllProjects reads concurrency and timeout from environment', async () => {
    process.env.GITLAB_PROJECT_CONCURRENCY = '6';
    process.env.GITLAB_PROJECT_TIMEOUT_MS = '120000';

    await adjustTokenScopeForAllProjects(true, false, undefined, loggerStub, undefined);

    expect(adjusterInstance.adjustAllProjects).toHaveBeenLastCalledWith({
      dryRun: true,
      monorepo: false,
      reporter: undefined,
      projectQuery: undefined,
      concurrency: 6,
      projectTimeoutMs: 120000,
    });

    delete process.env.GITLAB_PROJECT_CONCURRENCY;
    delete process.env.GITLAB_PROJECT_TIMEOUT_MS;
  });
});
