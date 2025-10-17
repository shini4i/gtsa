import React, { useEffect, useState } from 'react';
import type { LogEntry, ProjectViewState } from '../services/logger';
import type { InkModule } from './inkTypes';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Props consumed by the {@link Project} component.
 */
export interface ProjectProps {
  project: ProjectViewState;
}

/**
 * Visualises the status and log stream for a single project.
 */
export function createProjectComponent(ink: InkModule): React.FC<ProjectProps> {
  const { Box, Text } = ink;

  const Project: React.FC<ProjectProps> = ({ project }) => {
    const [spinnerIndex, setSpinnerIndex] = useState(0);

    useEffect(() => {
      if (project.status !== 'in-progress') {
        return;
      }

      const interval = setInterval(() => {
        setSpinnerIndex(index => (index + 1) % SPINNER_FRAMES.length);
      }, 120);

      return () => clearInterval(interval);
    }, [project.status]);

    const icon = getStatusIcon(project.status, spinnerIndex);
    const iconColor = getStatusColor(project.status);

    return (
      <Box borderStyle="round" padding={1} flexDirection="column" borderColor={iconColor ?? 'white'}>
        <Box marginBottom={1} alignItems="center">
          <Text color={iconColor}>{icon}</Text>
          <Text bold color={iconColor}>&nbsp;{project.name ?? `Project ${project.id}`}</Text>
        </Box>
        {project.progress && (
          <Box marginBottom={1}>
            <Text dimColor>
              {project.progress.label ? `${project.progress.label}: ` : 'Progress: '}
              {formatProgress(project.progress.current, project.progress.total)}
            </Text>
          </Box>
        )}
        {project.logs.length === 0 ? (
          <Text dimColor>No log entries yet.</Text>
        ) : (
          <Box flexDirection="column">
            {project.logs.map(entry => (
              <Text key={entry.id} color={mapLogLevelToColor(entry)}>
                {formatProjectLog(entry)}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  return Project;
}

function getStatusIcon(
  status: ProjectViewState['status'],
  spinnerIndex: number,
): string {
  switch (status) {
    case 'in-progress':
      return SPINNER_FRAMES[spinnerIndex];
    case 'success':
      return '✔';
    case 'failure':
      return '✖';
    default:
      return '…';
  }
}

function getStatusColor(status: ProjectViewState['status']): string | undefined {
  switch (status) {
    case 'success':
      return 'green';
    case 'failure':
      return 'red';
    case 'in-progress':
      return 'cyan';
    default:
      return undefined;
  }
}

function mapLogLevelToColor(entry: LogEntry): string | undefined {
  if (entry.level === 'warn') {
    return 'yellow';
  }
  if (entry.level === 'error') {
    return 'red';
  }
  return undefined;
}

function formatProjectLog(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  return `[${time}] ${entry.message}`;
}

function formatProgress(current: number, total?: number): string {
  if (!total || total <= 0) {
    return `${current}`;
  }

  const ratio = Math.min(current / total, 1);
  const percentage = Math.round(ratio * 100);
  return `${current}/${total} (${percentage}%)`;
}
