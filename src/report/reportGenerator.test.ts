import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { buildYamlReport, writeYamlReport, ProjectReportEntry } from './reportGenerator';

describe('reportGenerator', () => {
  const entries: ProjectReportEntry[] = [
    {
      projectName: 'group/project',
      projectId: 1,
      dependencies: ['dep1', 'dep2'],
    },
    {
      projectName: 'group/empty-project',
      projectId: 2,
      dependencies: [],
    },
  ];

  test('buildYamlReport returns yaml with only projects containing dependencies', () => {
    const yaml = buildYamlReport(entries);
    expect(yaml).toBe('"group/project":\n  - "dep1"\n  - "dep2"\n');
  });

  test('buildYamlReport returns empty map when no dependencies found', () => {
    const yaml = buildYamlReport(entries.filter(entry => entry.dependencies.length === 0));
    expect(yaml).toBe('{}\n');
  });

  test('writeYamlReport writes yaml file to disk', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitlab-token-scope-adjuster-'));
    const reportPath = path.join(tempDir, 'report.yaml');

    await writeYamlReport(entries, reportPath);

    const writtenContent = await fs.readFile(reportPath, 'utf8');
    expect(writtenContent).toBe('"group/project":\n  - "dep1"\n  - "dep2"\n');
  });
});
