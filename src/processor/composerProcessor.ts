import { FileProcessor } from './fileProcessor';
import { formatError } from '../utils/errorFormatter';

/**
 * Shape of Composer repository entries relevant for dependency extraction.
 *
 * @property type - Repository type as defined in Composer metadata.
 * @property url - Repository target URL.
 */
interface Repository {
  type: string;
  url: string;
}

/**
 * Extracts GitLab-hosted repositories referenced within `composer.json` manifests.
 */
export class ComposerProcessor implements FileProcessor {
  /**
   * Parses a Composer manifest and captures dependency repository paths hosted on GitLab.
   *
   * @param fileContent - Raw JSON text from `composer.json`.
   * @param gitlabUrl - Base GitLab URL used to strip hostnames from repository URLs.
   * @returns Promise resolving to a list of dependency `path_with_namespace` strings.
  */
  extractDependencies(fileContent: string, gitlabUrl: string): Promise<string[]> {
    const dependencies: string[] = [];
    const strippedUrl = gitlabUrl.replace('https://', '');

    try {
      const composerJson = JSON.parse(fileContent);
      if (composerJson.repositories && typeof composerJson.repositories === 'object') {
        for (const [key, repo] of Object.entries(composerJson.repositories)) {
          const repository = repo as Repository;
          if (repository.url && repository.url.includes(strippedUrl)) {
            const formattedDep = repository.url.replace(`https://${strippedUrl}/`, '');
            dependencies.push(formattedDep);
          } else {
            console.log(`Skipping repository '${key}' with URL '${repository.url}' of unknown type '${repository.type}'`);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to parse composer.json file: ${formatError(error)}`);
    }

    return Promise.resolve(dependencies);
  }
}
