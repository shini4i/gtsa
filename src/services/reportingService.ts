import { ProjectReportEntry, writeYamlReport } from '../report/reportGenerator';
import { formatError } from '../utils/errorFormatter';

export class DryRunReporter {
  private readonly entries: ProjectReportEntry[] = [];
  private ready = false;

  constructor(private readonly reportPath: string) {}

  async initialize(): Promise<void> {
    try {
      await writeYamlReport([], this.reportPath);
      console.log(`Dry run report initialized at ${this.reportPath}`);
      this.ready = true;
    } catch (error) {
      console.error(`Failed to initialize dry run report at ${this.reportPath}: ${formatError(error)}`);
    }
  }

  async append(entry: ProjectReportEntry): Promise<void> {
    this.entries.push(entry);

    if (!this.ready) {
      return;
    }

    try {
      await writeYamlReport(this.entries, this.reportPath);
      console.log(`Dry run report updated with ${entry.projectName}`);
    } catch (error) {
      console.error(`Failed to update dry run report at ${this.reportPath}: ${formatError(error)}`);
      this.ready = false;
    }
  }

  finalize(): void {
    if (!this.ready) {
      console.warn(`Dry run report could not be generated at ${this.reportPath} due to earlier errors.`);
      return;
    }

    console.log(`Dry run report available at ${this.reportPath}`);
  }
}
