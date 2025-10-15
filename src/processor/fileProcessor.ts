import path from 'path';

import { GoModProcessor } from './goModProcessor';
import { ComposerProcessor } from './composerProcessor';
import { NpmProcessor } from './npmProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';

export interface FileProcessor {
  extractDependencies(fileContent: string, gitlabUrl: string): Promise<string[]>;
}

type ProcessorFactory = (gitlabClient: GitlabClient) => FileProcessor;

const processorRegistry = new Map<string, ProcessorFactory>();

export function registerFileProcessor(filename: string, factory: ProcessorFactory): void {
  processorRegistry.set(filename, factory);
}

export function resetFileProcessorRegistry(): void {
  processorRegistry.clear();
  registerDefaultFileProcessors();
}

export function createFileProcessor(file: string, gitlabClient: GitlabClient): FileProcessor | undefined {
  const baseName = path.basename(file);
  const factory = processorRegistry.get(baseName);

  if (!factory) {
    console.log(`No processor available for file type: ${file}`);
    return undefined;
  }

  return factory(gitlabClient);
}

function registerDefaultFileProcessors() {
  registerFileProcessor('go.mod', () => new GoModProcessor());
  registerFileProcessor('composer.json', () => new ComposerProcessor());
  registerFileProcessor('package-lock.json', (gitlabClient) => new NpmProcessor(gitlabClient));
}

registerDefaultFileProcessors();
