import { performance } from 'perf_hooks';
import type { GitlabClient } from '../../gitlab/gitlabClient';
import { processDependencies, resetDependencyProcessingCaches } from '../../utils/dependencyProcessor';
import type LoggerService from '../../services/logger';

interface BenchmarkCounters {
  projectLookups: number;
  allowlistChecks: number;
  allowlistWrites: number;
}

interface ScenarioConfig {
  name: string;
  dependencyCount: number;
  uniqueDependencies: number;
  concurrency?: number;
  repeats?: number;
  preserveCachesBetweenRuns?: boolean;
}

interface BenchmarkEnvironment {
  client: GitlabClient;
  counters: BenchmarkCounters;
  resetRemoteState: () => void;
  resetCounters: () => void;
}

const silentLogger = {
  // Suppress per-dependency logs during benchmarking to keep console output focused on timing.
  logProject: () => {},
} as unknown as LoggerService;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createDependencyList(total: number, unique: number): string[] {
  const uniqueNames = Array.from({ length: unique }, (_, index) => `group/project-${index + 1}`);
  const dependencies: string[] = [];
  for (let i = 0; i < total; i += 1) {
    dependencies.push(uniqueNames[i % unique]);
  }
  return dependencies;
}

function createBenchmarkEnvironment(latencyMs: number): BenchmarkEnvironment {
  const projectIdMap = new Map<string, number>();
  const allowlist = new Set<string>();
  const counters: BenchmarkCounters = {
    projectLookups: 0,
    allowlistChecks: 0,
    allowlistWrites: 0,
  };

  const toKey = (source: number | string, dependency: number | string) => `${source}:${dependency}`;

  const client = {
    async getProjectId(pathWithNamespace: string): Promise<number> {
      counters.projectLookups += 1;
      await delay(latencyMs);
      let id = projectIdMap.get(pathWithNamespace);
      if (!id) {
        id = projectIdMap.size + 1;
        projectIdMap.set(pathWithNamespace, id);
      }
      return id;
    },
    async isProjectWhitelisted(sourceId: number, dependencyId: number): Promise<boolean> {
      counters.allowlistChecks += 1;
      await delay(latencyMs / 2);
      return allowlist.has(toKey(sourceId, dependencyId));
    },
    async allowCiJobTokenAccess(dependencyProjectId: string, sourceProjectId: string): Promise<void> {
      counters.allowlistWrites += 1;
      await delay(latencyMs / 3);
      allowlist.add(toKey(sourceProjectId, dependencyProjectId));
    },
  } as unknown as GitlabClient;

  return {
    client,
    counters,
    resetRemoteState: () => {
      projectIdMap.clear();
      allowlist.clear();
    },
    resetCounters: () => {
      counters.projectLookups = 0;
      counters.allowlistChecks = 0;
      counters.allowlistWrites = 0;
    },
  };
}

async function runScenario(config: ScenarioConfig): Promise<void> {
  const repeats = Math.max(1, config.repeats ?? 1);
  const dependencies = createDependencyList(config.dependencyCount, Math.min(config.uniqueDependencies, config.dependencyCount));
  const environment = createBenchmarkEnvironment(4);
  let cachesPrimed = false;

  console.log(`\nScenario: ${config.name}`);

  for (let iteration = 1; iteration <= repeats; iteration += 1) {
    if (!config.preserveCachesBetweenRuns || !cachesPrimed) {
      resetDependencyProcessingCaches();
      environment.resetRemoteState();
    }

    environment.resetCounters();

    const start = performance.now();
    await processDependencies(environment.client, dependencies, 999, silentLogger, {
      concurrency: config.concurrency,
    });
    const elapsed = performance.now() - start;

    console.log(
      `  Run ${iteration}: ${elapsed.toFixed(2)}ms | lookups=${environment.counters.projectLookups} | allowlistChecks=${environment.counters.allowlistChecks} | writes=${environment.counters.allowlistWrites}`,
    );

    cachesPrimed = true;
  }
}

async function main(): Promise<void> {
  console.log('Dependency Processing Benchmark');
  console.log('================================');

  await runScenario({
    name: 'Baseline sequential processing (100 dependencies, 100 unique, concurrency=1)',
    dependencyCount: 100,
    uniqueDependencies: 100,
    concurrency: 1,
  });

  await runScenario({
    name: 'Bounded parallelism (100 dependencies, 100 unique, concurrency=5)',
    dependencyCount: 100,
    uniqueDependencies: 100,
    concurrency: 5,
  });

  await runScenario({
    name: 'Warm caches on repeated dependency set (100 dependencies, 25 unique, concurrency=5)',
    dependencyCount: 100,
    uniqueDependencies: 25,
    concurrency: 5,
    repeats: 2,
    preserveCachesBetweenRuns: true,
  });
}

main().catch(error => {
  console.error('Benchmark execution failed:', error);
  process.exit(1);
});
