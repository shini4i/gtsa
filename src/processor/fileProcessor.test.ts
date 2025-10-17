import { createFileProcessor, registerFileProcessor, resetFileProcessorRegistry } from './fileProcessor';
import { GoModProcessor } from './goModProcessor';
import { ComposerProcessor } from './composerProcessor';
import { GitlabClient } from '../gitlab/gitlabClient';
import { NpmProcessor } from './npmProcessor';
import { FileProcessor } from './fileProcessor';

const gitlabClient = {} as GitlabClient;

afterEach(() => {
  resetFileProcessorRegistry();
});

describe('createFileProcessor', () => {
  it('should return an instance of GoModProcessor for go.mod files', () => {
    const processor = createFileProcessor('go.mod', gitlabClient);
    expect(processor).toBeInstanceOf(GoModProcessor);
  });

  it('should return an instance of ComposerProcessor for composer.json files', () => {
    const processor = createFileProcessor('composer.json', gitlabClient);
    expect(processor).toBeInstanceOf(ComposerProcessor);
  });

  it('should return undefined for unsupported file types', () => {
    const processor = createFileProcessor('unsupported.file', gitlabClient);
    expect(processor).toBeUndefined();
  });

  it('should return an instance of NpmProcessor for package-lock.json files', () => {
    const processor = createFileProcessor('package-lock.json', gitlabClient);
    expect(processor).toBeInstanceOf(NpmProcessor);
  });

  it('allows registering custom processors without editing core module', () => {
    class CustomProcessor implements FileProcessor {
      extractDependencies(): Promise<string[]> {
        return Promise.resolve(['custom']);
      }
    }

    registerFileProcessor('custom.lock', () => new CustomProcessor());

    const processor = createFileProcessor('custom.lock', gitlabClient);

    expect(processor).toBeInstanceOf(CustomProcessor);
  });
});
