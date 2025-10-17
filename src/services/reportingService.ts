import { ProjectReportEntry, writeYamlReport } from '../report/reportGenerator';
import { formatError } from '../utils/errorFormatter';
import LoggerService from './logger';

/**
 * Persists dry-run results to disk as YAML while providing console feedback.
 */
export class DryRunReporter {
  private readonly entries: ProjectReportEntry[] = [];
  private ready = false;

  /**
   * @param reportPath - Destination file written on every update.
   * @param logger - Logger used to emit user feedback.
   */
  constructor(private readonly reportPath: string, private readonly logger: LoggerService) {}

  /**
   * Creates or truncates the report file and marks the reporter ready for incremental updates.
   *
   * @returns Promise<void> that resolves once the report file is initialised.
   */
  async initialize(): Promise<void> {
    try {
      await writeYamlReport([], this.reportPath);
      this.logger.info(`Dry run report initialized at ${this.reportPath}`);
      this.ready = true;
    } catch (error) {
      this.logger.error(`Failed to initialize dry run report at ${this.reportPath}: ${formatError(error)}`);
    }
  }

  /**
   * Appends a new project entry to the in-memory collection and rewrites the report when ready.
   *
   * @param entry - Dry-run result describing dependency adjustments for a project.
   * @returns Promise<void> that resolves after the entry is appended (and persisted when possible).
   */
  async append(entry: ProjectReportEntry): Promise<void> {
    this.entries.push(entry);

    if (!this.ready) {
      return;
    }

    try {
      await writeYamlReport(this.entries, this.reportPath);
      this.logger.info(`Dry run report updated with ${entry.projectName}`);
    } catch (error) {
      this.logger.error(`Failed to update dry run report at ${this.reportPath}: ${formatError(error)}`);
      this.ready = false;
    }
  }

  /**
   * Emits a final log message indicating whether a report is available.
   *
   * @returns void when the operation has finished logging.
   */
  finalize(): void {
    if (!this.ready) {
      this.logger.warn(`Dry run report could not be generated at ${this.reportPath} due to earlier errors.`);
      return;
    }

    this.logger.info(`Dry run report available at ${this.reportPath}`);
  }
}
