// MiniPy load errors, runtime faults and fatal halts.

class LoadError {
  constructor(message, line) { this.message = message; this.line = line; }
}

// A raised-and-uncaught Python exception, surfaced to the host.
class RuntimeFault {
  constructor(excType, message, line, traceback) {
    this.excType = excType;   // string, e.g. 'TypeError'
    this.message = message;
    this.line = line;
    this.traceback = traceback || []; // [{name, callLine}], innermost first
  }
  format(filename, sourceLines) {
    const out = [];
    const codeLine = sourceLines && sourceLines[this.line - 1] !== undefined ? sourceLines[this.line - 1] : '';
    out.push(`${filename}:${this.line}: ${this.excType}: ${this.message}`);
    out.push(`${filename}:${this.line}:     ${codeLine.trim()}`);
    for (const frame of this.traceback) {
      out.push(`  in ${frame.name}, called at ${filename}:${frame.callLine}`);
    }
    return out.join('\n');
  }
}

// A resource/instruction-budget cutoff or stack exhaustion — fatal, not a
// catchable Python exception per spec §11.
class FatalHalt {
  constructor(reason, line) { this.reason = reason; this.line = line; }
}

export { LoadError, RuntimeFault, FatalHalt };
