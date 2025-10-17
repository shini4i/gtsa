#!/usr/bin/env node

import { Command } from 'commander';
import { adjustTokenScope, adjustTokenScopeForAllProjects } from './scripts/adjust-token-scope';
import { formatError, setDebugLogging } from './utils/errorFormatter';
import packageJson from '../package.json';
import { configureCli, DEFAULT_REPORT_PATH } from './config/cliOptions';
import LoggerService from './services/logger';

const program = new Command();

program.version(packageJson.version);
configureCli(program);

program
  .action(async (options) => {
    const logger = new LoggerService({ header: 'GitLab Token Scope Adjuster' });
    await logger.start();

    const { projectId, dryRun, monorepo, all, report, debug } = options;
    setDebugLogging(Boolean(debug));

    const exitWithError = (message: string, includeHelp = false) => {
      logger.error(message);
      if (includeHelp) {
        program.outputHelp();
      }
      logger.stop();
      process.exit(1);
    };

    if (all && projectId) {
      exitWithError('Cannot use --all together with --project-id. Please choose one.');
    }

    if (!all && !projectId) {
      exitWithError('Either --all or --project-id must be specified.', true);
    }

    try {
      if (report && !all) {
        exitWithError('--report can only be used together with --all.');
      }

      if (report && !dryRun) {
        exitWithError('--report requires --dry-run to be enabled.');
      }

      if (all) {
        const resolvedReportPath = report ? (typeof report === 'string' ? report : DEFAULT_REPORT_PATH) : undefined;
        await adjustTokenScopeForAllProjects(Boolean(dryRun), Boolean(monorepo), resolvedReportPath, logger);
        logger.info('Finished adjusting token scope for all projects!');
      } else {
        const parsedProjectId = parseInt(projectId, 10);
        if (Number.isNaN(parsedProjectId)) {
          exitWithError('Invalid project ID');
        }
        await adjustTokenScope(parsedProjectId, Boolean(dryRun), Boolean(monorepo), logger);
        logger.info('Finished adjusting token scope!');
      }
      logger.stop();
    } catch (error) {
      logger.error(`Failed to adjust token scope: ${formatError(error)}`);
      logger.stop();
      process.exit(1);
    }
  });

program.parse(process.argv);
