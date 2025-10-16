import { FileProcessor } from './fileProcessor';

/**
 * Extracts GitLab-hosted module dependencies from Go `go.mod` files.
 */
export class GoModProcessor implements FileProcessor {
  /**
   * Parses a `go.mod` file and returns project paths hosted on the target GitLab instance.
   *
   * @param fileContent - Text contents of the `go.mod` file.
   * @param gitlabUrl - Base GitLab URL used to recognise internal modules.
   * @returns Promise resolving to a list of dependency `path_with_namespace` strings.
  */
  extractDependencies(fileContent: string, gitlabUrl: string): Promise<string[]> {
    const lines = fileContent.split('\n');
    const strippedUrl = gitlabUrl.replace('https://', '');

    let isRequireBlock = false;
    const dependencies = [];
    for (const line of lines) {
      if (line.startsWith('require (')) {
        isRequireBlock = true;
        continue;
      }
      if (line.startsWith(')')) {
        isRequireBlock = false;
        continue;
      }
      if (isRequireBlock) {
        const dep = line.trim().split(' ')[0];
        if (dep.includes(strippedUrl)) {
          const formattedDep = dep.replace(strippedUrl + '/', '');
          dependencies.push(formattedDep);
        }
      }
    }

    // we are returning only path_with_namespace part of dependencies here
    return Promise.resolve(dependencies);
  }
}
