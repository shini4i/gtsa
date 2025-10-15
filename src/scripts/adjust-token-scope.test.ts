import { adjustTokenScope, adjustTokenScopeForAllProjects } from './adjust-token-scope';
import { getGitlabClient } from '../utils/gitlabHelpers';
import { TokenScopeAdjuster } from '../services/tokenScopeAdjuster';
import { DryRunReporter } from '../services/reportingService';

jest.mock('../utils/gitlabHelpers');
jest.mock('../services/tokenScopeAdjuster');
jest.mock('../services/reportingService');

describe('adjust-token-scope entrypoints', () => {
  const mockGetGitlabClient = getGitlabClient as jest.MockedFunction<typeof getGitlabClient>;
  const TokenScopeAdjusterMock = TokenScopeAdjuster as unknown as jest.MockedClass<typeof TokenScopeAdjuster>;
  const DryRunReporterMock = DryRunReporter as unknown as jest.MockedClass<typeof DryRunReporter>;

  const gitlabClientStub = {} as any;
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
    await adjustTokenScope(42, true, false);

    expect(mockGetGitlabClient).toHaveBeenCalled();
    expect(TokenScopeAdjusterMock).toHaveBeenCalledWith(gitlabClientStub);
    expect(adjusterInstance.adjustProject).toHaveBeenCalledWith(42, { dryRun: true, monorepo: false });
  });

  test('adjustTokenScopeForAllProjects passes reporter when dry-run and report provided', async () => {
    await adjustTokenScopeForAllProjects(true, true, 'report.yaml');

    expect(mockGetGitlabClient).toHaveBeenCalled();
    expect(TokenScopeAdjusterMock).toHaveBeenCalledWith(gitlabClientStub);
    expect(DryRunReporterMock).toHaveBeenCalledWith('report.yaml');
    expect(adjusterInstance.adjustAllProjects).toHaveBeenCalledWith({
      dryRun: true,
      monorepo: true,
      reporter: reporterInstance,
    });
  });

  test('adjustTokenScopeForAllProjects omits reporter when not in dry-run mode', async () => {
    await adjustTokenScopeForAllProjects(false, false, 'report.yaml');

    expect(DryRunReporterMock).not.toHaveBeenCalled();
    expect(adjusterInstance.adjustAllProjects).toHaveBeenCalledWith({
      dryRun: false,
      monorepo: false,
      reporter: undefined,
    });
  });
});
