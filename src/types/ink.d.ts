/**
 * Minimal Ink type declarations used by the CLI logger.
 */
declare module 'ink' {
  import type { Readable, Writable } from 'stream';
  import type { ReactElement, ReactNode } from 'react';

  /**
   * Simplified Ink instance handle returned by the render function.
   */
  export interface Instance {
    rerender(tree: ReactElement): void;
    unmount(): void;
    clear(): void;
    waitUntilExit(): Promise<void>;
  }

  /**
   * Runtime configuration applied when rendering Ink components.
   */
  export interface RenderOptions {
    stdout?: Writable;
    stdin?: Readable;
    stderr?: Writable;
    exitOnCtrlC?: boolean;
  }

  /**
   * Mounts a React element tree inside the terminal and returns a handle for updates.
   *
   * @param tree - The React element tree to render.
   * @param options - Optional stream and lifecycle configuration.
   */
  export function render(tree: ReactElement, options?: RenderOptions): Instance;

  export interface BoxProps {
    readonly children?: ReactNode;
    readonly [key: string]: unknown;
  }

  export interface TextProps {
    readonly children?: ReactNode;
    readonly [key: string]: unknown;
  }

  export interface NewlineProps {
    readonly count?: number;
  }

  export const Box: (props: BoxProps) => ReactElement | null;
  export const Text: (props: TextProps) => ReactElement | null;
  export const Newline: (props: NewlineProps) => ReactElement | null;
}
