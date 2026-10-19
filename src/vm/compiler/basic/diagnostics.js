// Load-error collection and the diagnostic format required by spec section 11.

export class CrumbError extends Error {
  constructor(message, { line = 0, column = 0, phase = 'load' } = {}) {
    super(message);
    this.name = 'CrumbError';
    this.line = line;
    this.column = column;
    this.phase = phase;
  }
}

/**
 * Renders diagnostics in the two-line shape the spec mandates:
 *
 *   tally.bas:14: error: <message>
 *   tally.bas:14:   total = label + 1
 */
export function formatDiagnostics(errors, source, filename = 'input.bas') {
  const lines = source.split(/\r\n|\n|\r/);
  const out = [];
  for (const error of errors) {
    out.push(`${filename}:${error.line}: error: ${error.message}`);
    const text = lines[error.line - 1];
    if (text !== undefined && text.trim() !== '') {
      out.push(`${filename}:${error.line}:   ${text.trimEnd()}`);
    }
  }
  return out.join('\n');
}

/** Sorts by position so a file's errors are reported top to bottom. */
export function sortErrors(errors) {
  return [...errors].sort((a, b) => a.line - b.line || a.column - b.column);
}
