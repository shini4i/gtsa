#!/usr/bin/env node

import { Command } from 'commander';
import { adjustTokenScope, adjustTokenScopeForAllProjects } from './scripts/adjust-token-scope';
import { formatError, setDebugLogging } from './utils/errorFormatter';
import packageJson from '../package.json';
import { configureCli, DEFAULT_REPORT_PATH } from './config/cliOptions';
import LoggerService from './services/logger';
import type { ProjectListOptions } from './gitlab/gitlabClient';

const program = new Command();

program.version(packageJson.version);
configureCli(program);

program
  .action(async (options) => {
    const logger = new LoggerService({ header: 'GitLab Token Scope Adjuster' });
    await logger.start();

    const {
      projectId,
      dryRun,
      monorepo,
      all,
      report,
      debug,
      projectsPerPage,
      projectsPageLimit,
      projectsSearch,
      projectsMembership,
      projectsOwned,
      projectsArchived,
      projectsSimple,
      projectsMinAccessLevel,
      projectsOrderBy,
      projectsSort,
      projectsVisibility,
    } = options;
    setDebugLogging(Boolean(debug));

    const exitWithError = (message: string, includeHelp = false) => {
      logger.error(message);
      if (includeHelp) {
        program.outputHelp();
      }
      logger.stop();
      process.exit(1);
    };

    const parsePositiveInteger = (rawValue: unknown, flagName: string): number | undefined => {
      if (rawValue === undefined || rawValue === null) {
        return undefined;
      }

      const parsedValue = Number.parseInt(String(rawValue), 10);
      if (Number.isNaN(parsedValue) || parsedValue <= 0) {
        exitWithError(`${flagName} must be a positive integer, but received "${rawValue}".`);
      }

      return parsedValue;
    };

    const buildProjectQuery = (): ProjectListOptions | undefined => {
      const query: ProjectListOptions = {};
      let hasValue = false;

      const assign = <K extends keyof ProjectListOptions>(key: K, value: ProjectListOptions[K]) => {
        query[key] = value;
        hasValue = true;
      };

      const perPage = parsePositiveInteger(projectsPerPage, '--projects-per-page');
      if (perPage !== undefined) {
        assign('perPage', perPage);
      }

      const pageLimit = parsePositiveInteger(projectsPageLimit, '--projects-page-limit');
      if (pageLimit !== undefined) {
        assign('pageLimit', pageLimit);
      }

      const minAccessLevel = parsePositiveInteger(projectsMinAccessLevel, '--projects-min-access-level');
      if (minAccessLevel !== undefined) {
        assign('minAccessLevel', minAccessLevel);
      }

      if (typeof projectsSearch === 'string' && projectsSearch.trim()) {
        assign('search', projectsSearch.trim());
      }

      if (typeof projectsMembership === 'boolean' && projectsMembership) {
        assign('membership', true);
      }

      if (typeof projectsOwned === 'boolean' && projectsOwned) {
        assign('owned', true);
      }

      if (typeof projectsArchived === 'boolean' && projectsArchived) {
        assign('archived', true);
      }

      if (typeof projectsSimple === 'boolean' && projectsSimple) {
        assign('simple', true);
      }

      if (typeof projectsOrderBy === 'string') {
        const orderBy = projectsOrderBy.trim();
        const allowedOrderBy: ProjectListOptions['orderBy'][] = ['id', 'name', 'path', 'created_at', 'updated_at', 'last_activity_at'];
        if (!allowedOrderBy.includes(orderBy as ProjectListOptions['orderBy'])) {
          exitWithError(`--projects-order-by must be one of: ${allowedOrderBy.join(', ')}.`);
        }
        assign('orderBy', orderBy as ProjectListOptions['orderBy']);
      }

      if (typeof projectsSort === 'string') {
        const normalizedSort = projectsSort.trim().toLowerCase();
        if (normalizedSort !== 'asc' && normalizedSort !== 'desc') {
          exitWithError('--projects-sort must be either "asc" or "desc".');
        }
        assign('sort', normalizedSort as ProjectListOptions['sort']);
      }

      if (typeof projectsVisibility === 'string') {
        const normalizedVisibility = projectsVisibility.trim().toLowerCase();
        const allowedVisibility: ProjectListOptions['visibility'][] = ['private', 'internal', 'public'];
        if (!allowedVisibility.includes(normalizedVisibility as ProjectListOptions['visibility'])) {
          exitWithError(`--projects-visibility must be one of: ${allowedVisibility.join(', ')}.`);
        }
        assign('visibility', normalizedVisibility as ProjectListOptions['visibility']);
      }

      return hasValue ? query : undefined;
    };

    if (all && projectId) {
      exitWithError('Cannot use --all together with --project-id. Please choose one.');
    }

    if (!all && !projectId) {
      exitWithError('Either --all or --project-id must be specified.', true);
    }

    try {
      const projectQuery = buildProjectQuery();

      if (!all && projectQuery) {
        exitWithError('Project filtering flags (--projects-*) require --all.');
      }

      if (report && !all) {
        exitWithError('--report can only be used together with --all.');
      }

      if (report && !dryRun) {
        exitWithError('--report requires --dry-run to be enabled.');
      }

      if (all) {
        const resolvedReportPath = report ? (typeof report === 'string' ? report : DEFAULT_REPORT_PATH) : undefined;
        await adjustTokenScopeForAllProjects(Boolean(dryRun), Boolean(monorepo), resolvedReportPath, logger, projectQuery);
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
