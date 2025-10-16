#!/usr/bin/env node

import { Command } from 'commander';
import { adjustTokenScope, adjustTokenScopeForAllProjects } from './scripts/adjust-token-scope';
import { formatError, setDebugLogging } from './utils/errorFormatter';
import packageJson from '../package.json';

const DEFAULT_REPORT_PATH = 'gitlab-token-scope-report.yaml';

const program = new Command();

program
  .version(packageJson.version)
  .description('CLI tool for whitelisting CI_JOB_TOKEN in dependencies projects');

program
  .option('-p, --project-id <id>', 'The project ID')
  .option('--all', 'Process all projects available to the configured token')
  .option('--dry-run', 'Print out which projects will be updated for access without performing the actual update')
  .option('--report [path]', `Generate a YAML report when used with --all and --dry-run (default path: ${DEFAULT_REPORT_PATH})`)
  .option('--monorepo', 'Consider project as a monorepo and find files recursively')
  .option('--debug', 'Print full error stack traces for troubleshooting')
  .action(async (options) => {
    const { projectId, dryRun, monorepo, all, report, debug } = options;
    setDebugLogging(Boolean(debug));

    if (all && projectId) {
      console.error('Cannot use --all together with --project-id. Please choose one.');
      process.exit(1);
    }

    if (!all && !projectId) {
      program.outputHelp();
      process.exit(1);
    }
    try {
      if (report && !all) {
        console.error('--report can only be used together with --all.');
        process.exit(1);
      }

      if (report && !dryRun) {
        console.error('--report requires --dry-run to be enabled.');
        process.exit(1);
      }

      if (all) {
        const resolvedReportPath = report ? (typeof report === 'string' ? report : DEFAULT_REPORT_PATH) : undefined;
        await adjustTokenScopeForAllProjects(Boolean(dryRun), Boolean(monorepo), resolvedReportPath);
        console.log('Finished adjusting token scope for all projects!');
      } else {
        const parsedProjectId = parseInt(projectId, 10);
        if (isNaN(parsedProjectId)) {
          console.error('Invalid project ID');
          process.exit(1);
        }
        await adjustTokenScope(parsedProjectId, Boolean(dryRun), Boolean(monorepo));
        console.log('Finished adjusting token scope!');
      }
    } catch (error) {
      console.error(`Failed to adjust token scope: ${formatError(error)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
