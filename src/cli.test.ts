import { adjustTokenScope, adjustTokenScopeForAllProjects } from './scripts/adjust-token-scope';
import { cliSchema, DEFAULT_REPORT_PATH } from './config/cliOptions';

jest.mock('./scripts/adjust-token-scope', () => ({
  adjustTokenScope: jest.fn().mockResolvedValue(undefined),
  adjustTokenScopeForAllProjects: jest.fn().mockResolvedValue(undefined),
}));

const mockedAdjustTokenScope = adjustTokenScope as jest.MockedFunction<typeof adjustTokenScope>;
const mockedAdjustTokenScopeForAllProjects = adjustTokenScopeForAllProjects as jest.MockedFunction<typeof adjustTokenScopeForAllProjects>;

type CliAction = (options: any) => Promise<void>;

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit: ${code}`);
  }
}

let actionHandler: CliAction | undefined;
let programMock: any;

function createProgram() {
  const program: any = {
    version: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn((handler: CliAction) => {
      actionHandler = handler;
      return program;
    }),
    parse: jest.fn().mockReturnThis(),
    outputHelp: jest.fn(),
  };

  programMock = program;
  return program;
}

jest.mock('commander', () => ({
  Command: jest.fn(() => createProgram()),
}));

async function initializeCli() {
  actionHandler = undefined;
  programMock = undefined;

  jest.isolateModules(() => {
    require('./cli');
  });

  if (!actionHandler || !programMock) {
    throw new Error('CLI failed to register action');
  }

  return {
    action: actionHandler as CliAction,
    program: programMock as any,
  };
}

async function runCli(options: any) {
  const { action, program } = await initializeCli();
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
  }) as never);

  let exitError: ExitError | undefined;
  try {
    await action(options);
  } catch (error) {
    if (error instanceof ExitError) {
      exitError = error;
    } else {
      throw error;
    }
  } finally {
    exitSpy.mockRestore();
  }

  return { exitError, program };
}

describe('cli entrypoint', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedAdjustTokenScope.mockReset();
    mockedAdjustTokenScopeForAllProjects.mockReset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('registers CLI options and description from schema', async () => {
    const { program } = await initializeCli();

    expect(program.description).toHaveBeenCalledWith(cliSchema.description);
    cliSchema.options.forEach(option => {
      expect(program.option).toHaveBeenCalledWith(option.flags, option.description);
    });
  });

  it('rejects using --all together with --project-id', async () => {
    const { exitError } = await runCli({ all: true, projectId: '1' });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Cannot use --all together with --project-id. Please choose one.');
    expect(mockedAdjustTokenScope).not.toHaveBeenCalled();
    expect(mockedAdjustTokenScopeForAllProjects).not.toHaveBeenCalled();
  });

  it('prints help and exits when no scope option provided', async () => {
    const { exitError, program } = await runCli({});

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(program.outputHelp).toHaveBeenCalled();
    expect(mockedAdjustTokenScope).not.toHaveBeenCalled();
  });

  it('requires --all when --report is specified', async () => {
    const { exitError } = await runCli({ projectId: '1', report: 'out.yaml' });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('--report can only be used together with --all.');
    expect(mockedAdjustTokenScope).not.toHaveBeenCalled();
  });

  it('requires --dry-run when --report is specified', async () => {
    const { exitError } = await runCli({ all: true, report: true });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('--report requires --dry-run to be enabled.');
    expect(mockedAdjustTokenScopeForAllProjects).not.toHaveBeenCalled();
  });

  it('processes all projects with dry run and default report path', async () => {
    const { exitError } = await runCli({ all: true, dryRun: true, report: true, monorepo: undefined });

    expect(exitError).toBeUndefined();
    expect(mockedAdjustTokenScopeForAllProjects).toHaveBeenCalledWith(true, false, DEFAULT_REPORT_PATH);
    expect(logSpy).toHaveBeenCalledWith('Finished adjusting token scope for all projects!');
  });

  it('processes all projects with custom report path and monorepo flag', async () => {
    const { exitError } = await runCli({ all: true, dryRun: true, report: 'custom.yaml', monorepo: true });

    expect(exitError).toBeUndefined();
    expect(mockedAdjustTokenScopeForAllProjects).toHaveBeenCalledWith(true, true, 'custom.yaml');
  });

  it('processes a single project when a valid project id is provided', async () => {
    const { exitError } = await runCli({ projectId: '42', dryRun: true, monorepo: undefined });

    expect(exitError).toBeUndefined();
    expect(mockedAdjustTokenScope).toHaveBeenCalledWith(42, true, false);
    expect(logSpy).toHaveBeenCalledWith('Finished adjusting token scope!');
  });

  it('rejects invalid project id input', async () => {
    const { exitError } = await runCli({ projectId: 'not-a-number' });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Invalid project ID');
    expect(mockedAdjustTokenScope).not.toHaveBeenCalled();
  });

  it('exits with error when adjustment fails', async () => {
    mockedAdjustTokenScope.mockRejectedValueOnce(new Error('boom'));

    const { exitError } = await runCli({ projectId: '1' });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Failed to adjust token scope: boom');
  });

  it('prints stack trace when debug flag is enabled', async () => {
    mockedAdjustTokenScope.mockRejectedValueOnce(new Error('boom'));

    const { exitError } = await runCli({ projectId: '1', debug: true });

    expect(exitError).toBeInstanceOf(ExitError);
    expect(exitError?.code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to adjust token scope: Error: boom'));
  });
});
