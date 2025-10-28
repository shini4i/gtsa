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
    { flags: '--projects-per-page <number>', description: 'Override the per-page size when scanning projects with --all (default 100, max 100)' },
    { flags: '--projects-page-limit <number>', description: 'Stop scanning projects after the specified number of pages when using --all' },
    { flags: '--projects-search <query>', description: 'Limit --all scans to projects whose name or path matches the query' },
    { flags: '--projects-membership', description: 'Restrict --all scans to projects the token is a member of' },
    { flags: '--projects-owned', description: 'Restrict --all scans to projects owned by the token' },
    { flags: '--projects-archived', description: 'Include archived projects when using --all' },
    { flags: '--projects-simple', description: 'Request reduced project payloads from GitLab during --all scans' },
    { flags: '--projects-min-access-level <level>', description: 'Require at least the specified access level (e.g. 20 for Reporter) when scanning projects' },
    { flags: '--projects-order-by <field>', description: 'Sort projects by the given field (id, name, path, created_at, updated_at, last_activity_at)' },
    { flags: '--projects-sort <direction>', description: 'Sort direction (asc or desc) applied with --projects-order-by' },
    { flags: '--projects-visibility <scope>', description: 'Restrict projects by visibility (private, internal, public) during --all scans' },
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
