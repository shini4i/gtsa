import { promises as fs } from 'fs';
import { dirname } from 'path';

export interface ProjectReportEntry {
  projectName: string;
  projectId: number;
  dependencies: string[];
}

function serializeValue(value: string): string {
  return JSON.stringify(value);
}

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

export async function writeYamlReport(entries: ProjectReportEntry[], filePath: string): Promise<void> {
  const yamlContent = buildYamlReport(entries);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yamlContent, 'utf8');
}
