import { GitlabClient } from '../gitlab/gitlabClient';
import { ProjectReportEntry, writeYamlReport } from '../report/reportGenerator';
import { fetchDependencyFiles, fetchProjectDetails, getGitlabClient } from '../utils/gitlabHelpers';
import { processAllDependencyFiles, processDependencies } from '../utils/dependencyProcessor';

async function adjustProjectTokenScope(gitlabClient: GitlabClient, projectId: number, dryRun: boolean, monorepo: boolean): Promise<ProjectReportEntry | null> {
  const project = await fetchProjectDetails(gitlabClient, projectId);
  if (!project) {
    console.warn(`Skipping project ID ${projectId} because details could not be retrieved.`);
    return null;
  }

  console.log(`\nProcessing project ${project.path_with_namespace} (ID: ${projectId})`);

  let dependencyFiles = await fetchDependencyFiles(gitlabClient, projectId, project.default_branch, monorepo);

  if (!dependencyFiles) {
    dependencyFiles = [];
  }

  const allDependencies = await processAllDependencyFiles(gitlabClient, projectId, project.default_branch, dependencyFiles);

  if (allDependencies && allDependencies.length > 0) {
    if (dryRun) {
      console.log('Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:');
      allDependencies.forEach(dependency => console.log(`- ${dependency}`));
      return {
        projectName: project.path_with_namespace,
        projectId,
        dependencies: allDependencies,
      };
    } else {
      await processDependencies(gitlabClient, allDependencies, projectId);
    }
  } else {
    console.error('No dependencies found to process.');
  }

  return null;
}

export async function adjustTokenScope(projectId: number, dryRun: boolean, monorepo: boolean) {
  const gitlabClient = await getGitlabClient();
  await adjustProjectTokenScope(gitlabClient, projectId, dryRun, monorepo);
}

export async function adjustTokenScopeForAllProjects(dryRun: boolean, monorepo: boolean, reportPath?: string) {
  const gitlabClient = await getGitlabClient();
  const projects = await gitlabClient.getAllProjects();

  if (!projects || projects.length === 0) {
    console.warn('No projects available to process.');
    return;
  }

  const reportEntries: ProjectReportEntry[] = [];
  let reportReady = false;

  if (reportPath && dryRun) {
    try {
      await writeYamlReport([], reportPath);
      console.log(`Dry run report initialized at ${reportPath}`);
      reportReady = true;
    } catch (error) {
      console.error(`Failed to initialize dry run report at ${reportPath}:`, error);
    }
  }

  for (const project of projects) {
    if (!project?.id) {
      // Certain GitLab endpoints can return summary objects without IDs (e.g., when filtered by permissions),
      // so keep a guard here to avoid runtime failures if that happens.
      console.warn('Encountered a project without an ID, skipping...');
      continue;
    }

    try {
      const entry = await adjustProjectTokenScope(gitlabClient, project.id, dryRun, monorepo);
      if (entry) {
        reportEntries.push(entry);
        if (reportPath && dryRun) {
          try {
            await writeYamlReport(reportEntries, reportPath);
            console.log(`Dry run report updated with ${entry.projectName}`);
            reportReady = true;
          } catch (error) {
            console.error(`Failed to update dry run report at ${reportPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to adjust token scope for project ID ${project.id}:`, error);
    }
  }

  if (reportPath && dryRun && reportReady) {
    console.log(`Dry run report available at ${reportPath}`);
  } else if (reportPath && dryRun && !reportReady) {
    console.warn(`Dry run report could not be generated at ${reportPath} due to earlier errors.`);
  }
}
