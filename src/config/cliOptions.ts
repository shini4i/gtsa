import type { Command } from 'commander';

export const DEFAULT_REPORT_PATH = 'gitlab-token-scope-report.yaml';

export interface CliOptionDefinition {
  flags: string;
  description: string;
}

export interface CliSchema {
  description: string;
  options: CliOptionDefinition[];
}

export const cliSchema: CliSchema = {
  description: 'CLI tool for whitelisting CI_JOB_TOKEN in dependencies projects',
  options: [
    { flags: '-p, --project-id <id>', description: 'The project ID' },
    { flags: '--all', description: 'Process all projects available to the configured token' },
    { flags: '--dry-run', description: 'Print out which projects will be updated for access without performing the actual update' },
    {
      flags: '--report [path]',
      description: `Generate a YAML report when used with --all and --dry-run (default path: ${DEFAULT_REPORT_PATH})`,
    },
    { flags: '--monorepo', description: 'Consider project as a monorepo and find files recursively' },
    { flags: '--debug', description: 'Print full error stack traces for troubleshooting' },
  ],
};

export function configureCli(program: Command): Command {
  program.description(cliSchema.description);
  cliSchema.options.forEach(option => {
    program.option(option.flags, option.description);
  });
  return program;
}
