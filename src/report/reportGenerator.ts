import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Shape of the aggregated report entry emitted for each processed project.
 *
 * @property projectName - Namespace-qualified name of the project.
 * @property projectId - Numeric identifier of the project.
 * @property dependencies - Dependencies discovered during analysis.
 */
export interface ProjectReportEntry {
  projectName: string;
  projectId: number;
  dependencies: string[];
}

/**
 * Ensures string values are serialised safely for YAML output by reusing JSON quoting rules.
 *
 * @param value - Raw string value to serialise.
 * @returns JSON-quoted string representation.
 */
function serializeValue(value: string): string {
  return JSON.stringify(value);
}

/**
 * Converts dependency scan results into a YAML representation grouped by project.
 *
 * @param entries - Report entries containing project identifiers and dependency lists.
 * @returns YAML document as a string.
 */
export function buildYamlReport(entries: ProjectReportEntry[]): string {
  const filtered = entries.filter(entry => entry.dependencies.length > 0);

  if (filtered.length === 0) {
    return '{}\n';
  }

  const lines = filtered.map(entry => {
    const projectLine = `${serializeValue(entry.projectName)}:\n`;
    const dependencyLines = entry.dependencies
      .map(dependency => `  - ${serializeValue(dependency)}`)
      .join('\n');

    return `${projectLine}${dependencyLines}`;
  });

  return `${lines.join('\n')}\n`;
}

/**
 * Persists the YAML dependency report to disk, creating parent directories as needed.
 *
 * @param entries - Report entries to serialise.
 * @param filePath - Destination path for the YAML file.
 * @returns Promise that resolves once the report has been written.
 */
export async function writeYamlReport(entries: ProjectReportEntry[], filePath: string): Promise<void> {
  const yamlContent = buildYamlReport(entries);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yamlContent, 'utf8');
}
