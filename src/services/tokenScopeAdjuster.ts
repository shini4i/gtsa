import { GitlabClient } from '../gitlab/gitlabClient';
import { processDependencies } from '../utils/dependencyProcessor';
import { ProjectReportEntry } from '../report/reportGenerator';
import { DependencyScanner } from './dependencyScanner';
import { DryRunReporter } from './reportingService';

export interface AdjustProjectOptions {
  dryRun: boolean;
  monorepo: boolean;
}

export interface AdjustAllProjectsOptions extends AdjustProjectOptions {
  reporter?: DryRunReporter;
}

export class TokenScopeAdjuster {
  private readonly scanner: DependencyScanner;

  constructor(private readonly gitlabClient: GitlabClient, scanner?: DependencyScanner) {
    this.scanner = scanner ?? new DependencyScanner(gitlabClient);
  }

  async adjustProject(projectId: number, options: AdjustProjectOptions): Promise<ProjectReportEntry | null> {
    const result = await this.scanner.scan(projectId, options.monorepo);
    if (!result) {
      return null;
    }

    if (!result.dependencies || result.dependencies.length === 0) {
      console.error('No dependencies found to process.');
      return null;
    }

    if (options.dryRun) {
      console.log('Dry run mode: CI_JOB_TOKEN would be whitelisted in the following projects:');
      result.dependencies.forEach(dependency => console.log(`- ${dependency}`));
      return {
        projectName: result.projectName,
        projectId: result.projectId,
        dependencies: result.dependencies,
      };
    }

    await processDependencies(this.gitlabClient, result.dependencies, result.projectId);
    return null;
  }

  async adjustAllProjects(options: AdjustAllProjectsOptions): Promise<ProjectReportEntry[]> {
    const projects = await this.gitlabClient.getAllProjects();

    if (!projects || projects.length === 0) {
      console.warn('No projects available to process.');
      return [];
    }

    const collectedEntries: ProjectReportEntry[] = [];

    if (options.dryRun && options.reporter) {
      await options.reporter.initialize();
    }

    for (const project of projects) {
      if (!project?.id) {
        console.warn('Encountered a project without an ID, skipping...');
        continue;
      }

      try {
        const entry = await this.adjustProject(project.id, options);

        if (entry) {
          collectedEntries.push(entry);

          if (options.dryRun && options.reporter) {
            await options.reporter.append(entry);
          }
        }
      } catch (error) {
        console.error(`Failed to adjust token scope for project ID ${project.id}:`, error);
      }
    }

    if (options.dryRun && options.reporter) {
      options.reporter.finalize();
    }

    return collectedEntries;
  }
}
