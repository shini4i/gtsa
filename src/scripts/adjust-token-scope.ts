import { DryRunReporter } from '../services/reportingService';
import { TokenScopeAdjuster } from '../services/tokenScopeAdjuster';
import { getGitlabClient } from '../utils/gitlabHelpers';

/**
 * Adjusts CI job token scope for a single project using the configured GitLab credentials.
 *
 * @param projectId - Numeric identifier of the project to audit.
 * @param dryRun - When true, skips persisting allow list changes.
 * @param monorepo - Enables recursive dependency discovery for monorepo structures.
 * @returns Promise that resolves when the adjustment finishes.
 * @throws Error when dependency processing or GitLab updates fail.
 */
export async function adjustTokenScope(projectId: number, dryRun: boolean, monorepo: boolean) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient);
  await adjuster.adjustProject(projectId, { dryRun, monorepo });
}

/**
 * Iterates over every accessible project and optionally emits a dry-run report.
 *
 * @param dryRun - When true, only reports dependency adjustments without persisting.
 * @param monorepo - Enables recursive file tree traversal for dependency discovery.
 * @param reportPath - Optional output path for the dry-run YAML report.
 * @returns Promise that resolves after processing all accessible projects.
 * @throws AdjustAllProjectsError when at least one project fails to adjust.
 */
export async function adjustTokenScopeForAllProjects(dryRun: boolean, monorepo: boolean, reportPath?: string) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient);
  const reporter = dryRun && reportPath ? new DryRunReporter(reportPath) : undefined;
  await adjuster.adjustAllProjects({ dryRun, monorepo, reporter });
}
