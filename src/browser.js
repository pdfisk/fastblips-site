// Single entry point for the browser bundle: everything the playground needs,
// hung off one global.

import { parse, compile, run } from './index.js';
import { disassemble } from './disasm.js';
import { formatAst, formatTokens } from './format.js';
import { formatDiagnostics } from './diagnostics.js';
import { tokenize } from './lexer.js';
import { KEYWORDS, BUILTINS } from './tokens.js';

export {
  parse, compile, run, disassemble, formatAst, formatTokens,
  formatDiagnostics, tokenize, KEYWORDS, BUILTINS,
};
