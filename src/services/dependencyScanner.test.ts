import { DependencyScanner } from './dependencyScanner';
import { fetchDependencyFiles, fetchProjectDetails } from '../utils/gitlabHelpers';
import { processAllDependencyFiles } from '../utils/dependencyProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import LoggerService from './logger';

jest.mock('../utils/gitlabHelpers');
jest.mock('../utils/dependencyProcessor');

const fetchProjectDetailsMock = fetchProjectDetails as jest.MockedFunction<typeof fetchProjectDetails>;
const fetchDependencyFilesMock = fetchDependencyFiles as jest.MockedFunction<typeof fetchDependencyFiles>;
const processAllDependencyFilesMock = processAllDependencyFiles as jest.MockedFunction<typeof processAllDependencyFiles>;

describe('DependencyScanner', () => {
  let gitlabClient: GitlabClient;
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    gitlabClient = {} as GitlabClient;
    logger = {
      logProject: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
  });

  it('returns null when project details are unavailable', async () => {
    fetchProjectDetailsMock.mockResolvedValue(null);
    const scanner = new DependencyScanner(gitlabClient, logger);

    const result = await scanner.scan(1, false);

    expect(result).toBeNull();
    expect(logger.logProject).not.toHaveBeenCalled();
    expect(fetchDependencyFilesMock).not.toHaveBeenCalled();
  });

  it('collates dependencies from fetched manifests', async () => {
    fetchProjectDetailsMock.mockResolvedValue({
      id: 1,
      path_with_namespace: 'group/project',
      default_branch: 'main',
    } as any);
    fetchDependencyFilesMock.mockResolvedValue(['package.json']);
    processAllDependencyFilesMock.mockResolvedValue(['dep1', 'dep2']);
    const scanner = new DependencyScanner(gitlabClient, logger);

    const result = await scanner.scan(1, true);

    expect(fetchDependencyFilesMock).toHaveBeenCalledWith(
      gitlabClient,
      1,
      'main',
      true,
      logger,
    );
    expect(processAllDependencyFilesMock).toHaveBeenCalledWith(
      gitlabClient,
      1,
      'main',
      ['package.json'],
      logger,
    );
    expect(result).toEqual({
      projectId: 1,
      projectName: 'group/project',
      defaultBranch: 'main',
      dependencies: ['dep1', 'dep2'],
    });
    expect(logger.logProject).toHaveBeenCalledWith(1, 'Processing project group/project (ID: 1)');
    expect(logger.logProject).toHaveBeenCalledWith(1, 'Default branch: main');
  });

  it('defaults to an empty manifest list when none are returned', async () => {
    fetchProjectDetailsMock.mockResolvedValue({
      id: 1,
      path_with_namespace: 'group/project',
      default_branch: 'main',
    } as any);
    fetchDependencyFilesMock.mockResolvedValue(undefined as unknown as string[]);
    processAllDependencyFilesMock.mockResolvedValue([]);
    const scanner = new DependencyScanner(gitlabClient, logger);

    await scanner.scan(1, false);

    expect(processAllDependencyFilesMock).toHaveBeenCalledWith(
      gitlabClient,
      1,
      'main',
      [],
      logger,
    );
  });
});
