const BAR_WIDTH = 24;
const FILLED_SEGMENT = '#';
const EMPTY_SEGMENT = '-';
const SPINNER_FRAMES = ['|', '/', '-', '\\'];

function isPositiveInteger(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Lightweight CLI progress helper that draws either a progress bar (when the total is known)
 * or a spinner (when paging count is unknown). Falls back to plain console logging when TTY
 * rendering is not available (for example, in CI logs).
 */
export class ProgressReporter {
  private total?: number;
  private current = 0;
  private readonly label: string;
  private readonly enabled: boolean;
  private spinnerIndex = 0;

  constructor(label: string, total?: number) {
    this.label = label;
    this.enabled = Boolean(process.stdout.isTTY);

    if (isPositiveInteger(total)) {
      this.total = total;
    }
  }

  /**
   * Updates the total number of steps. Values that are not positive integers are ignored so they
   * do not unexpectedly reset an already known total.
   */
  setTotal(total?: number) {
    if (isPositiveInteger(total)) {
      this.total = total;
    }
  }

  increment() {
    this.update(this.current + 1);
  }

  /**
   * Moves the progress indicator to a specific step and redraws the output. Non-TTY environments
   * stream the progress as log lines instead.
   */
  update(current: number) {
    this.current = current;

    if (!this.enabled) {
      console.log(this.composePlainMessage());
      return;
    }

    this.render();
  }

  /**
   * Completes the progress indicator, ensuring the bar/spinner writes a trailing newline when
   * running in a TTY.
   */
  finish() {
    if (!this.enabled) {
      return;
    }

    this.render(true);
  }

  private render(finish = false) {
    const line = this.total ? this.composeBarLine() : this.composeSpinnerLine();
    process.stdout.write(`\r${line}`);

    if (finish) {
      process.stdout.write('\n');
    }
  }

  /**
   * Builds a `[####----] current/total` representation using the known total count. The bar width
   * is fixed so the output does not jitter in the terminal as it updates.
   */
  private composeBarLine(): string {
    const total = this.total ?? Math.max(this.current, 1);
    const ratio = Math.min(this.current / total, 1);
    const filled = Math.round(ratio * BAR_WIDTH);
    const empty = Math.max(BAR_WIDTH - filled, 0);
    const bar = FILLED_SEGMENT.repeat(filled) + EMPTY_SEGMENT.repeat(empty);

    return `${this.label} [${bar}] ${this.current}/${total}`;
  }

  /**
   * Produces a spinner frame with the current page number when there is no total count available
   * from the API (for example, some GitLab endpoints omit pagination headers).
   */
  private composeSpinnerLine(): string {
    const frame = SPINNER_FRAMES[this.spinnerIndex % SPINNER_FRAMES.length];
    this.spinnerIndex++;
    return `${this.label} ${frame} page ${this.current}`;
  }

  /**
   * Plain text fallback used when the terminal cannot render carriage-return updates (non-TTY
   * environments such as CI logs).
   */
  private composePlainMessage(): string {
    const suffix = this.total ? `${this.current}/${this.total}` : `${this.current}`;
    return `${this.label}: ${suffix}`;
  }
}
