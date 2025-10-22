import { DryRunReporter } from '../services/reportingService';
import { TokenScopeAdjuster } from '../services/tokenScopeAdjuster';
import { getGitlabClient } from '../utils/gitlabHelpers';
import LoggerService from '../services/logger';
import type { ProjectListOptions } from '../gitlab/gitlabClient';

function readPositiveIntegerEnv(name: string): number | undefined {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

/**
 * Adjusts CI job token scope for a single project using the configured GitLab credentials.
 *
 * @param projectId - Numeric identifier of the project to audit.
 * @param dryRun - When true, skips persisting allow list changes.
 * @param monorepo - Enables recursive dependency discovery for monorepo structures.
 * @param logger - Shared logger instance used for status updates.
 * @returns Promise that resolves when the adjustment finishes.
 * @throws Error when dependency processing or GitLab updates fail.
 */
export async function adjustTokenScope(
  projectId: number,
  dryRun: boolean,
  monorepo: boolean,
  logger: LoggerService,
) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient, logger);
  logger.setTotalProjects(1);
  await adjuster.adjustProject(projectId, { dryRun, monorepo });
}

/**
 * Iterates over every accessible project and optionally emits a dry-run report.
 *
 * @param dryRun - When true, only reports dependency adjustments without persisting.
 * @param monorepo - Enables recursive file tree traversal for dependency discovery.
 * @param reportPath - Optional output path for the dry-run YAML report.
 * @param logger - Shared logger instance used for status updates.
 * @param projectQuery - Optional filters forwarded to the GitLab project listing API.
 * @returns Promise that resolves after processing all accessible projects.
 * @throws AdjustAllProjectsError when at least one project fails to adjust.
 */
export async function adjustTokenScopeForAllProjects(
  dryRun: boolean,
  monorepo: boolean,
  reportPath: string | undefined,
  logger: LoggerService,
  projectQuery: ProjectListOptions | undefined,
) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient, logger);
  const reporter = dryRun && reportPath ? new DryRunReporter(reportPath, logger) : undefined;
  const concurrency = readPositiveIntegerEnv('GITLAB_PROJECT_CONCURRENCY');
  const projectTimeoutMs = readPositiveIntegerEnv('GITLAB_PROJECT_TIMEOUT_MS');

  await adjuster.adjustAllProjects({
    dryRun,
    monorepo,
    reporter,
    projectQuery,
    concurrency,
    projectTimeoutMs,
  });
}
