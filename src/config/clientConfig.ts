import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsDefined, IsString, validateSync } from 'class-validator';

/**
 * Configuration shape for authenticating against the GitLab API.
 *
 * @property Url - Base GitLab instance URL.
 * @property Token - Personal access token or CI token with API permissions.
 */
export class Config {
  @IsString()
  @IsDefined({ message: 'GITLAB_URL is not defined. Please set it in your environment variables.' })
  Url?: string;

  @IsString()
  @IsDefined({ message: 'GITLAB_TOKEN is not defined. Please set it in your environment variables.' })
  Token?: string;
}

/**
 * Builds and validates the GitLab client configuration from environment variables.
 *
 * @returns A validated configuration object with URL and token.
 * @throws Error when required environment variables are missing or invalid.
 */
export function NewClientConfig(): Config {
  const plainConfig = {
    Url: process.env.GITLAB_URL,
    Token: process.env.GITLAB_TOKEN,
  };

  const config = plainToInstance(Config, plainConfig);
  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const uniqueErrorMessages = [...new Set(errors.flatMap(err => Object.values(err.constraints!)))];
    throw new Error(`Configuration validation error: ${uniqueErrorMessages.join(', ')}`);
  }

  return config;
}
