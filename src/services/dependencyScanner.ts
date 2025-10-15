import { GitlabClient } from '../gitlab/gitlabClient';
import { fetchDependencyFiles, fetchProjectDetails } from '../utils/gitlabHelpers';
import { processAllDependencyFiles } from '../utils/dependencyProcessor';

export interface DependencyScanResult {
  projectId: number;
  projectName: string;
  defaultBranch: string;
  dependencies: string[];
}

export class DependencyScanner {
  constructor(private readonly gitlabClient: GitlabClient) {}

  async scan(projectId: number, monorepo: boolean): Promise<DependencyScanResult | null> {
    const project = await fetchProjectDetails(this.gitlabClient, projectId);
    if (!project) {
      console.warn(`Skipping project ID ${projectId} because details could not be retrieved.`);
      return null;
    }

    console.log(`\nProcessing project ${project.path_with_namespace} (ID: ${projectId})`);

    let dependencyFiles = await fetchDependencyFiles(
      this.gitlabClient,
      projectId,
      project.default_branch,
      monorepo,
    );

    if (!dependencyFiles) {
      dependencyFiles = [];
    }

    const dependencies = await processAllDependencyFiles(
      this.gitlabClient,
      projectId,
      project.default_branch,
      dependencyFiles,
    );

    return {
      projectId,
      projectName: project.path_with_namespace,
      defaultBranch: project.default_branch,
      dependencies,
    };
  }
}
