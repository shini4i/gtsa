import { DryRunReporter } from '../services/reportingService';
import { TokenScopeAdjuster } from '../services/tokenScopeAdjuster';
import { getGitlabClient } from '../utils/gitlabHelpers';

export async function adjustTokenScope(projectId: number, dryRun: boolean, monorepo: boolean) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient);
  await adjuster.adjustProject(projectId, { dryRun, monorepo });
}

export async function adjustTokenScopeForAllProjects(dryRun: boolean, monorepo: boolean, reportPath?: string) {
  const gitlabClient = await getGitlabClient();
  const adjuster = new TokenScopeAdjuster(gitlabClient);
  const reporter = dryRun && reportPath ? new DryRunReporter(reportPath) : undefined;
  await adjuster.adjustAllProjects({ dryRun, monorepo, reporter });
}
