import { GitlabClient } from '../gitlab/gitlabClient';
import { createFileProcessor } from '../processor/fileProcessor';

/**
 * Error thrown when a dependency manifest cannot be processed for a project.
 *
 * @property projectId - Project whose manifest failed to parse.
 * @property file - Path of the dependency file that failed.
 * @property cause - Underlying error thrown during processing.
 */
export class DependencyFileProcessingError extends Error {
  readonly projectId: number;
  readonly file: string;
  readonly cause: unknown;

  constructor(projectId: number, file: string, cause: unknown) {
    super(`Failed to process dependency file ${file} for project ID ${projectId}`);
    this.name = 'DependencyFileProcessingError';
    this.projectId = projectId;
    this.file = file;
    this.cause = cause;
  }
}

/**
 * Captures the dependency identifier and underlying cause when processing fails.
 *
 * @property dependency - Dependency project path that could not be processed.
 * @property cause - Root cause error or thrown value.
 */
export interface DependencyFailure {
  dependency: string;
  cause: unknown;
}

/**
 * Aggregated error representing one or more dependency processing failures for a project.
 *
 * @property sourceProjectId - Project whose dependencies failed to adjust.
 * @property failures - Collection of individual dependency failures.
 */
export class DependencyProcessingError extends Error {
  readonly sourceProjectId: number;
  readonly failures: DependencyFailure[];

  constructor(sourceProjectId: number, failures: DependencyFailure[], message?: string) {
    super(message ?? `Failed to process ${failures.length} dependencies for project ID ${sourceProjectId}`);
    this.name = 'DependencyProcessingError';
    this.sourceProjectId = sourceProjectId;
    this.failures = failures;
  }
}

/**
 * Processes a single dependency file and returns the extracted dependencies.
 *
 * @param gitlabClient - The GitLab client instance.
 * @param projectId - The ID of the project.
 * @param defaultBranch - The default branch of the project.
 * @param file - The path to the dependency file.
 * @returns A promise that resolves to an array of extracted dependencies.
 * @throws DependencyFileProcessingError when the file cannot be processed.
 */
export async function processDependencyFile(gitlabClient: GitlabClient, projectId: number, defaultBranch: string, file: string): Promise<string[]> {
  try {
    const fileContent = await gitlabClient.getFileContent(projectId, file, defaultBranch);
    const processor = createFileProcessor(file, gitlabClient);

    if (!processor) {
      return [];
    }

    const dependencies = await processor.extractDependencies(fileContent, gitlabClient.Url);

    console.log(`Dependencies from \x1b[36m${file}\x1b[0m that match the GitLab URL: `, dependencies);
    return dependencies;
  } catch (error) {
    throw new DependencyFileProcessingError(projectId, file, error);
  }
}

/**
 * Processes all dependency files and returns the aggregated dependencies.
 *
 * @param gitlabClient - The GitLab client instance.
 * @param projectId - The ID of the project.
 * @param defaultBranch - The default branch of the project.
 * @param dependencyFiles - An array of paths to the dependency files.
 * @returns A promise that resolves to an array of aggregated dependencies.
 * @throws DependencyProcessingError when any dependency file fails.
 */
export async function processAllDependencyFiles(gitlabClient: GitlabClient, projectId: number, defaultBranch: string, dependencyFiles: string[]): Promise<string[]> {
  const allDependencies: string[] = [];
  const fileErrors: DependencyFileProcessingError[] = [];

  for (const file of dependencyFiles) {
    try {
      const dependencies = await processDependencyFile(gitlabClient, projectId, defaultBranch, file);
      allDependencies.push(...dependencies);
    } catch (error) {
      if (error instanceof DependencyFileProcessingError) {
        fileErrors.push(error);
      } else {
        fileErrors.push(new DependencyFileProcessingError(projectId, file, error));
      }
    }
  }

  if (fileErrors.length > 0) {
    const summary = fileErrors
      .map(err => `${err.file}: ${(err.cause instanceof Error && err.cause.message) ? err.cause.message : 'Unknown error'}`)
      .join('; ');
    throw new DependencyProcessingError(projectId, fileErrors.map(err => ({
      dependency: err.file,
      cause: err.cause,
    })), `Encountered ${fileErrors.length} error(s) while processing dependency files for project ID ${projectId}: ${summary}`);
  }

  return allDependencies;
}

/**
 * Processes the dependencies and grants CI job token access for each dependency project.
 *
 * @param gitlabClient - The GitLab client instance.
 * @param dependencies - An array of dependency project names.
 * @param sourceProjectId - The ID of the source project.
 * @returns A promise that resolves when all tasks are completed.
 * @throws DependencyProcessingError when any dependency project fails to update.
 */
export async function processDependencies(gitlabClient: GitlabClient, dependencies: string[], sourceProjectId: number) {
  const failures: DependencyFailure[] = [];

  for (const dependency of dependencies) {
    try {
      const dependencyProjectId = await gitlabClient.getProjectId(dependency);
      if (!await gitlabClient.isProjectWhitelisted(sourceProjectId, dependencyProjectId)) {
        await gitlabClient.allowCiJobTokenAccess(dependencyProjectId.toString(), sourceProjectId.toString());
        console.log(`===> Project was whitelisted in ${dependency} successfully`);
      } else {
        console.log(`===> Project is already whitelisted in ${dependency}, skipping...`);
      }
    } catch (error) {
      failures.push({ dependency, cause: error });
    }
  }

  if (failures.length > 0) {
    const summary = failures
      .map(failure => `${failure.dependency}: ${(failure.cause instanceof Error && failure.cause.message) ? failure.cause.message : 'Unknown error'}`)
      .join('; ');
    throw new DependencyProcessingError(
      sourceProjectId,
      failures,
      `Failed to process ${failures.length} dependenc${failures.length === 1 ? 'y' : 'ies'} for project ID ${sourceProjectId}: ${summary}`,
    );
  }
}
