import { DryRunReporter } from './reportingService';
import { writeYamlReport } from '../report/reportGenerator';
import { formatError } from '../utils/errorFormatter';
import LoggerService from './logger';

jest.mock('../report/reportGenerator');
jest.mock('../utils/errorFormatter');

const writeYamlReportMock = writeYamlReport as jest.MockedFunction<typeof writeYamlReport>;
const formatErrorMock = formatError as jest.MockedFunction<typeof formatError>;

describe('DryRunReporter', () => {
  const reportPath = '/tmp/report.yaml';
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    formatErrorMock.mockImplementation(error => (error instanceof Error ? error.message : String(error)));
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
  });

  it('initialises report storage and marks reporter ready', async () => {
    writeYamlReportMock.mockResolvedValue(undefined);
    const reporter = new DryRunReporter(reportPath, logger);

    await reporter.initialize();

    expect(writeYamlReportMock).toHaveBeenCalledWith([], reportPath);
    expect(logger.info).toHaveBeenCalledWith(`Dry run report initialized at ${reportPath}`);
  });

  it('logs an error when initialisation fails', async () => {
    const failure = new Error('permission denied');
    writeYamlReportMock.mockRejectedValue(failure);
    const reporter = new DryRunReporter(reportPath, logger);

    await reporter.initialize();

    expect(formatErrorMock).toHaveBeenCalledWith(failure);
    expect(logger.error).toHaveBeenCalledWith(
      `Failed to initialize dry run report at ${reportPath}: ${failure.message}`,
    );
  });

  it('buffers entries when reporter is not ready', async () => {
    const reporter = new DryRunReporter(reportPath, logger);
    const entry = {
      projectId: 1,
      projectName: 'group/project',
      dependencies: ['dep'],
    };

    await reporter.append(entry);

    expect(writeYamlReportMock).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('persists entries when reporter is ready', async () => {
    writeYamlReportMock.mockResolvedValue(undefined);
    const reporter = new DryRunReporter(reportPath, logger);
    const entry = {
      projectId: 1,
      projectName: 'group/project',
      dependencies: ['dep'],
    };

    await reporter.initialize();
    await reporter.append(entry);

    expect(writeYamlReportMock).toHaveBeenNthCalledWith(2, [entry], reportPath);
    expect(logger.info).toHaveBeenCalledWith(`Dry run report updated with ${entry.projectName}`);
  });

  it('suspends persistence when updates fail', async () => {
    writeYamlReportMock.mockResolvedValueOnce(undefined);
    const reporter = new DryRunReporter(reportPath, logger);
    const firstEntry = {
      projectId: 1,
      projectName: 'group/project',
      dependencies: ['dep'],
    };
    const secondEntry = {
      projectId: 2,
      projectName: 'group/project-2',
      dependencies: ['dep-2'],
    };
    const failure = new Error('disk full');

    await reporter.initialize();
    writeYamlReportMock.mockRejectedValueOnce(failure);

    await reporter.append(firstEntry);

    expect(logger.error).toHaveBeenCalledWith(
      `Failed to update dry run report at ${reportPath}: ${failure.message}`,
    );

    writeYamlReportMock.mockClear();
    logger.info.mockClear();

    await reporter.append(secondEntry);

    expect(writeYamlReportMock).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('warns when finalize is called without a ready report', () => {
    const reporter = new DryRunReporter(reportPath, logger);

    reporter.finalize();

    expect(logger.warn).toHaveBeenCalledWith(
      `Dry run report could not be generated at ${reportPath} due to earlier errors.`,
    );
  });

  it('logs the report location when finalize is invoked after success', async () => {
    writeYamlReportMock.mockResolvedValue(undefined);
    const reporter = new DryRunReporter(reportPath, logger);

    await reporter.initialize();
    reporter.finalize();

    expect(logger.info).toHaveBeenCalledWith(`Dry run report available at ${reportPath}`);
  });
});
