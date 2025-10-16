import path from 'path';

import { GoModProcessor } from './goModProcessor';
import { ComposerProcessor } from './composerProcessor';
import { NpmProcessor } from './npmProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';

/**
 * Contract implemented by dependency manifest processors for various ecosystems.
 */
export interface FileProcessor {
  extractDependencies(fileContent: string, gitlabUrl: string): Promise<string[]>;
}

/**
 * Factory function capable of creating a processor for a specific file type.
 *
 * @param gitlabClient - GitLab client provided to the processor instance.
 * @returns A processor capable of handling the associated file type.
 */
type ProcessorFactory = (gitlabClient: GitlabClient) => FileProcessor;

const processorRegistry = new Map<string, ProcessorFactory>();

/**
 * Registers a bespoke processor factory for the given filename.
 *
 * @param filename - File basename (e.g. `package-lock.json`) to associate with the processor.
 * @param factory - Lazily creates the processor using the provided GitLab client.
 */
export function registerFileProcessor(filename: string, factory: ProcessorFactory): void {
  processorRegistry.set(filename, factory);
}

/**
 * Resets the processor registry to the built-in defaults.
 */
export function resetFileProcessorRegistry(): void {
  processorRegistry.clear();
  registerDefaultFileProcessors();
}

/**
 * Looks up a registered processor for the supplied file and instantiates it.
 *
 * @param file - Path to the dependency manifest.
 * @param gitlabClient - GitLab API client shared with the processor.
 * @returns A processor instance when one is registered, otherwise `undefined`.
 */
export function createFileProcessor(file: string, gitlabClient: GitlabClient): FileProcessor | undefined {
  const baseName = path.basename(file);
  const factory = processorRegistry.get(baseName);

  if (!factory) {
    console.log(`No processor available for file type: ${file}`);
    return undefined;
  }

  return factory(gitlabClient);
}

/**
 * Registers the default processors bundled with the CLI.
 */
function registerDefaultFileProcessors() {
  registerFileProcessor('go.mod', () => new GoModProcessor());
  registerFileProcessor('composer.json', () => new ComposerProcessor());
  registerFileProcessor('package-lock.json', (gitlabClient) => new NpmProcessor(gitlabClient));
}

registerDefaultFileProcessors();
