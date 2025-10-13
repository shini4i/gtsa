import { ProgressReporter } from './progressReporter';

const originalIsTTY = process.stdout.isTTY;

describe('ProgressReporter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  test('renders progress bar when TTY is available and total known', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const reporter = new ProgressReporter('Loading', 5);
    reporter.update(2);

    const call = String(writeSpy.mock.calls[0]?.[0] ?? '');
    expect(call).toMatch(/\rLoading \[[#-]+\] 2\/5/);
  });

  test('renders spinner when total is unknown', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const reporter = new ProgressReporter('Scanning');
    reporter.update(1);
    reporter.update(2);

    const firstCall = String(writeSpy.mock.calls[0]?.[0] ?? '');
    const secondCall = String(writeSpy.mock.calls[1]?.[0] ?? '');

    const firstMatch = firstCall.match(/\rScanning (.) page 1/);
    const secondMatch = secondCall.match(/\rScanning (.) page 2/);

    expect(firstMatch).not.toBeNull();
    expect(secondMatch).not.toBeNull();
    expect(['|', '/', '-', '\\']).toContain(firstMatch?.[1]);
    expect(['|', '/', '-', '\\']).toContain(secondMatch?.[1]);
  });

  test('falls back to plain logging when TTY is unavailable', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const reporter = new ProgressReporter('Listing', 3);
    reporter.update(1);

    expect(logSpy).toHaveBeenCalledWith('Listing: 1/3');
  });

  test('finish emits trailing newline when TTY is available', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const reporter = new ProgressReporter('Downloading', 2);
    reporter.update(2);
    reporter.finish();

    const lastCall = writeSpy.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe('\n');
  });

  test('setTotal ignores non-positive values', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const reporter = new ProgressReporter('Processing', 3);
    reporter.setTotal(0);
    reporter.update(1);

    const call = String(writeSpy.mock.calls[0]?.[0] ?? '');
    expect(call).toMatch(/\rProcessing \[[#-]+\] 1\/3/);
  });
});
