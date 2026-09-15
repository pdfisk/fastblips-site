// Single entry point for the browser bundle: everything the playground needs,
// hung off one global.

import { parse, compile, run } from '../index.js';
import { disassemble } from '../vm/disasm.js';
import { formatAst, formatTokens } from '../vm/format.js';
import { formatDiagnostics } from '../vm/diagnostics.js';
import { tokenize } from '../vm/lexer.js';
import { KEYWORDS, BUILTINS } from '../vm/tokens.js';

export {
  parse, compile, run, disassemble, formatAst, formatTokens,
  formatDiagnostics, tokenize, KEYWORDS, BUILTINS,
};
