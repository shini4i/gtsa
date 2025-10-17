import React from 'react';
import type { InkModule } from './inkTypes';

const BAR_WIDTH = 24;

/**
 * Props accepted by the {@link StatusBar} component.
 */
export interface StatusBarProps {
  total: number;
  processed: number;
  success: number;
  failures: number;
}

/**
 * Displays aggregate progress information at the bottom of the CLI.
 */
export function createStatusBarComponent(ink: InkModule): React.FC<StatusBarProps> {
  const { Box, Text } = ink;

  const StatusBar: React.FC<StatusBarProps> = ({ total, processed, success, failures }) => {
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    const filled = Math.round((percentage / 100) * BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(BAR_WIDTH - filled, 0));

    return (
      <Box borderStyle="single" paddingX={1} paddingY={0} marginTop={1} flexDirection="column">
        <Text>
          [{bar}] {percentage}% • {processed}/{total} processed
        </Text>
        <Text dimColor>
          Success: {success} • Failures: {failures}
        </Text>
      </Box>
    );
  };

  return StatusBar;
}
