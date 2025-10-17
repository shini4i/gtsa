import { ComposerProcessor } from './composerProcessor';
import LoggerService from '../services/logger';

describe('ComposerProcessor', () => {
  const gitlabUrl = 'https://gitlab.example.com';
  const processor = new ComposerProcessor();
  const logger = {
    logProject: jest.fn(),
  } as unknown as LoggerService;
  const projectId = 42;

  it('should extract dependencies from repositories section', async () => {
    const fileContent = JSON.stringify({
      repositories: {
        'test/test-123': {
          type: 'vcs',
          url: 'https://gitlab.example.com/test/test-helm-repository',
        },
        'test/test-155': {
          type: 'vcs',
          url: 'https://gitlab.example.com/test/terraform-automation-test',
        },
        'external/repo': {
          type: 'composer',
          url: 'https://packagist.example.com',
        },
      },
    });

    const dependencies = await processor.extractDependencies(fileContent, gitlabUrl, logger, projectId);
    expect(dependencies).toEqual([
      'test/test-helm-repository',
      'test/terraform-automation-test',
    ]);
  });

  it('should handle empty repositories section', async () => {
    const fileContent = JSON.stringify({
      repositories: {},
    });

    const dependencies = await processor.extractDependencies(fileContent, gitlabUrl, logger, projectId);
    expect(dependencies).toEqual([]);
  });

  it('should handle invalid JSON gracefully', async () => {
    const fileContent = 'invalid json';

    const dependencies = await processor.extractDependencies(fileContent, gitlabUrl, logger, projectId);
    expect(dependencies).toEqual([]);
    expect(logger.logProject).toHaveBeenCalledWith(
      projectId,
      expect.stringContaining('Failed to parse composer.json file'),
      'error',
    );
  });
});
