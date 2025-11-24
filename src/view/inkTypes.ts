import type { ReactElement, ComponentType, ReactNode } from 'react';

/**
 * Minimal Ink runtime surface used by the logger and view components.
 */
export interface InkModule {
  render(tree: ReactElement, options?: unknown): InkInstance;
  Box: ComponentType<Record<string, unknown>>;
  Text: ComponentType<Record<string, unknown>>;
  Newline: ComponentType<Record<string, unknown>>;
}

/**
 * Ink instance handle returned from the render function.
 */
export interface InkInstance {
  rerender(tree: ReactElement): void;
  unmount(): void;
  clear(): void;
  waitUntilExit(): Promise<void>;
}
