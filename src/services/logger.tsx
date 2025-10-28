import React from 'react';
import { createApp } from '../view/App';
import type { AppProps } from '../view/App';
import type { InkInstance, InkModule } from '../view/inkTypes';

/**
 * Supported log severities understood by the {@link LoggerService}.
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Describes a single log line rendered either globally or for a specific project.
 */
export interface LogEntry {
  id: number;
  message: string;
  level: LogLevel;
  timestamp: string;
}

/**
 * Captures progress information for a project-specific long-running operation.
 */
export interface ProjectProgressState {
  label?: string;
  current: number;
  total?: number;
}

/**
 * Represents the rendering state for a single project within the UI.
 */
export interface ProjectViewState {
  id: number;
  name?: string;
  status: 'pending' | 'in-progress' | 'success' | 'failure';
  logs: LogEntry[];
  progress?: ProjectProgressState;
}

/**
 * Aggregated UI state consumed by the Ink renderer.
 */
export interface LoggerState {
  totalProjects: number;
  projects: ProjectViewState[];
  globalLogs: LogEntry[];
  globalProgress?: GlobalProgressState;
}

/**
 * Tracks global progress information rendered at the top of the dashboard.
 */
export interface GlobalProgressState {
  label?: string;
  current: number;
  total?: number;
}

/**
 * Optional configuration applied when instantiating {@link LoggerService}.
 *
 * @property enableInk - Overrides Ink usage detection; defaults to current TTY capability.
 * @property header - Custom header text rendered above the project list.
 */
export interface LoggerOptions {
  enableInk?: boolean;
  header?: string;
}

/**
 * Centralised logging and UI state manager. It renders an Ink-based dashboard when TTY
 * support is available and falls back to console output otherwise.
 */
export class LoggerService {
  private state: LoggerState = {
    totalProjects: 0,
    projects: [],
    globalLogs: [],
  };

  private renderer?: InkInstance;
  private readonly useInk: boolean;
  private readonly header?: string;
  private logSequence = 0;
  private appComponent?: React.FC<AppProps>;
  private inkModule?: InkModule;
  private inkModulePromise?: Promise<InkModule>;

  /**
   * @param options - Optional overrides controlling renderer behaviour.
   */
  constructor(options: LoggerOptions = {}) {
    this.header = options.header;
    this.useInk = options.enableInk ?? Boolean(process.stdout.isTTY);
  }

  /**
   * Activates the Ink renderer when supported. Safe to call multiple times.
   */
  async start(): Promise<void> {
    if (!this.useInk) {
      return;
    }

    const ink = await this.loadInk();
    const AppComponent = this.ensureAppComponent(ink);

    if (this.renderer) {
      this.renderer.rerender(<AppComponent header={this.header} state={this.state} />);
      return;
    }

    this.renderer = ink.render(<AppComponent header={this.header} state={this.state} />);
  }

  /**
   * Gracefully stops the Ink renderer and clears internal handles.
   */
  stop(): void {
    if (!this.renderer) {
      return;
    }

    this.renderer.unmount();
    this.renderer = undefined;
  }

  /**
   * Announces the expected number of projects that will be processed.
   *
   * @param total - Total count of projects to display in the status bar.
   */
  setTotalProjects(total: number): void {
    this.updateState(state => ({
      ...state,
      totalProjects: Math.max(total, 0),
    }));
  }

  /**
   * Registers the beginning of work for a project and marks it as in-progress.
   *
   * @param projectId - Numeric identifier of the GitLab project.
   * @param projectName - Optional human-readable project path.
   */
  startProject(projectId: number, projectName?: string): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        name: projectName ?? project.name,
        status: 'in-progress',
      })),
    }));

    if (!this.useInk) {
      this.logToConsole('info', this.formatProjectPrefix(projectId) + 'started processing');
    }
  }

  /**
   * Updates the human-readable name for a project without changing its status.
   *
   * @param projectId - Identifier of the project being updated.
   * @param projectName - Friendly name displayed in the UI.
   */
  setProjectName(projectId: number, projectName: string): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        name: projectName,
      })),
    }));
  }

  /**
   * Records a successful completion for the provided project.
   *
   * @param projectId - Project identifier being processed.
   * @param message - Optional final status message appended to the project log.
   */
  completeProject(projectId: number, message?: string): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        status: 'success',
        progress: undefined,
        logs: message ? [...project.logs, this.createLogEntry('info', message)] : project.logs,
      })),
    }));

    if (!this.useInk) {
      this.logToConsole('info', this.formatProjectPrefix(projectId) + 'completed successfully');
      if (message) {
        this.logToConsole('info', this.formatProjectPrefix(projectId) + message);
      }
    }
  }

  /**
   * Marks a project as failed and attaches the supplied error message.
   *
   * @param projectId - Identifier for the project that failed.
   * @param errorMessage - Error description to append to the project log.
   */
  failProject(projectId: number, errorMessage: string): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        status: 'failure',
        progress: undefined,
        logs: [...project.logs, this.createLogEntry('error', errorMessage)],
      })),
    }));

    if (!this.useInk) {
      this.logToConsole('error', this.formatProjectPrefix(projectId) + errorMessage);
    }
  }

  /**
   * Appends an informational message to the project-specific log stream.
   *
   * @param projectId - Project associated with the message.
   * @param message - Human-readable description to render.
   * @param level - Severity applied to the log entry (info by default).
   */
  logProject(projectId: number, message: string, level: LogLevel = 'info'): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        logs: [...project.logs, this.createLogEntry(level, message)],
      })),
    }));

    if (!this.useInk) {
      this.logToConsole(level, this.formatProjectPrefix(projectId) + message);
    }
  }

  /**
   * Updates the progress indicator rendered for the given project.
   *
   * @param projectId - Identifier of the project whose progress changed.
   * @param current - Current progress value.
   * @param total - Optional total value to compute completion percentage.
   * @param label - Optional label describing the ongoing work.
   */
  updateProjectProgress(projectId: number, current: number, total?: number, label?: string): void {
    this.updateState(state => ({
      ...state,
      projects: this.withProject(state, projectId, project => ({
        ...project,
        progress: { current, total, label },
      })),
    }));

    if (!this.useInk) {
      const base = this.formatProjectPrefix(projectId);
      const suffix = total ? `${current}/${total}` : `${current}`;
      this.logToConsole('info', `${base}${label ?? 'progress'}: ${suffix}`);
    }
  }

  /**
   * Emits a globally scoped informational message.
   *
   * @param message - Text to append to the global log stream.
   */
  info(message: string): void {
    this.appendGlobalLog('info', message);
  }

  /**
   * Emits a globally scoped warning message.
   *
   * @param message - Text to append to the global log stream.
   */
  warn(message: string): void {
    this.appendGlobalLog('warn', message);
  }

  /**
   * Emits a globally scoped error message.
   *
   * @param message - Text to append to the global log stream.
   */
  error(message: string): void {
    this.appendGlobalLog('error', message);
  }

  /**
   * Updates the global progress indicator shown above the log stream.
   *
   * @param label - Descriptive label for the progress bar.
   * @param current - Current progress value.
   * @param total - Optional total value for percentage calculation.
   */
  updateGlobalProgress(label: string, current: number, total?: number): void {
    this.updateState(state => ({
      ...state,
      globalProgress: {
        label,
        current,
        total,
      },
    }));

    if (!this.useInk) {
      const suffix = total && total > 0 ? `${current}/${total}` : `${current}`;
      this.logToConsole('info', `${label}: ${suffix}`);
    }
  }

  /**
   * Clears the global progress indicator, typically once the operation finishes.
   */
  clearGlobalProgress(): void {
    this.updateState(state => ({
      ...state,
      globalProgress: undefined,
    }));
  }

  private appendGlobalLog(level: LogLevel, message: string): void {
    this.updateState(state => ({
      ...state,
      globalLogs: [...state.globalLogs, this.createLogEntry(level, message)],
    }));

    if (!this.useInk) {
      this.logToConsole(level, message);
    }
  }

  private updateState(mutator: (state: LoggerState) => LoggerState): void {
    this.state = mutator(this.state);
    if (this.useInk && this.renderer && this.appComponent) {
      const AppComponent = this.appComponent;
      this.renderer.rerender(<AppComponent header={this.header} state={this.state} />);
    }
  }

  private createLogEntry(level: LogLevel, message: string): LogEntry {
    this.logSequence += 1;
    return {
      id: this.logSequence,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private async loadInk(): Promise<InkModule> {
    if (this.inkModule) {
      return this.inkModule;
    }

    if (!this.inkModulePromise) {
      this.inkModulePromise = (async () => {
        const module = (await new Function('return import("ink")')()) as unknown as InkModule;
        this.inkModule = module;
        return module;
      })();
    }

    return this.inkModulePromise;
  }

  private ensureAppComponent(ink: InkModule): React.FC<AppProps> {
    if (!this.appComponent) {
      this.appComponent = createApp(ink);
    }

    return this.appComponent;
  }

  private withProject(
    state: LoggerState,
    projectId: number,
    transform: (project: ProjectViewState) => ProjectViewState,
  ): ProjectViewState[] {
    let found = false;
    const projects = state.projects.map(project => {
      if (project.id === projectId) {
        found = true;
        return transform(project);
      }
      return project;
    });

    if (!found) {
      projects.push(
        transform({
          id: projectId,
          status: 'pending',
          logs: [],
        }),
      );
    }

    return projects;
  }

  private formatProjectPrefix(projectId: number): string {
    const project = this.state.projects.find(entry => entry.id === projectId);
    if (project?.name) {
      return `[project ${project.name}#${projectId}] `;
    }

    return `[project ${projectId}] `;
  }

  private logToConsole(level: LogLevel, message: string): void {
    if (level === 'warn') {
      console.warn(message);
    } else if (level === 'error') {
      console.error(message);
    } else {
      console.log(message);
    }
  }
}

export default LoggerService;
