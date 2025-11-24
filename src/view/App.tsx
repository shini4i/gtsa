import React from 'react';
import type { LoggerState } from '../services/logger';
import { createProjectComponent } from './Project';
import { createStatusBarComponent } from './StatusBar';
import type { InkModule } from './inkTypes';

/**
 * Props supplied to the Ink root component.
 */
export interface AppProps {
  state: LoggerState;
  header?: string;
}

/**
 * Renders the root CLI interface, including the header, project list, and status bar.
 */
export function createApp(ink: InkModule): React.FC<AppProps> {
  const { Box, Text, Newline } = ink;
  const Project = createProjectComponent(ink);
  const StatusBar = createStatusBarComponent(ink);

  const App: React.FC<AppProps> = ({ state, header }) => {
    const totalProjects = Math.max(state.totalProjects, state.projects.length);
    const successes = state.projects.filter(project => project.status === 'success').length;
    const failures = state.projects.filter(project => project.status === 'failure').length;
    const processed = successes + failures;

    return (
      <Box flexDirection="column" padding={1} width="100%">
        <Text bold>{header ?? 'GitLab Token Scope Adjuster'}</Text>
        {state.globalProgress && (
          <Box marginTop={1} flexDirection="column">
            <Text>
              {state.globalProgress.label ?? 'In progress'}: {formatGlobalProgress(state.globalProgress.current, state.globalProgress.total)}
            </Text>
            {state.globalProgress.total && state.globalProgress.total > 0 && (
              <Text>{renderProgressBar(state.globalProgress.current, state.globalProgress.total)}</Text>
            )}
          </Box>
        )}
        {state.globalLogs.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {state.globalLogs.map(entry => (
              <Text key={entry.id} color={mapLogLevelToColor(entry.level)}>
                {formatLogEntry(entry.message, entry.timestamp)}
              </Text>
            ))}
          </Box>
        )}
        <Box marginTop={1} flexDirection="column">
          {state.projects.length === 0 ? (
            <Text dimColor>No projects processed yet.</Text>
          ) : (
            state.projects.map(project => (
              <Box key={project.id} flexDirection="column" marginBottom={1}>
                <Project project={project} />
              </Box>
            ))
          )}
        </Box>
        <Newline />
        <StatusBar total={totalProjects} processed={processed} success={successes} failures={failures} />
      </Box>
    );
  };

  return App;
}

function formatGlobalProgress(current: number, total?: number): string {
  if (!total || total <= 0) {
    return `${current}`;
  }

  return `${current}/${total} (${Math.round(Math.min(current / total, 1) * 100)}%)`;
}

function renderProgressBar(current: number, total: number): string {
  const width = 24;
  const ratio = Math.min(current / Math.max(total, 1), 1);
  const filled = Math.round(ratio * width);
  const empty = Math.max(width - filled, 0);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function mapLogLevelToColor(level: LoggerState['globalLogs'][number]['level']): string | undefined {
  switch (level) {
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return undefined;
  }
}

function formatLogEntry(message: string, timestamp: string): string {
  return `[${new Date(timestamp).toLocaleTimeString()}] ${message}`;
}
