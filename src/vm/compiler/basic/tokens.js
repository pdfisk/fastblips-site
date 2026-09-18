// Token classes and the reserved-word table. Spec section 2 and section 12.

export const TokenType = Object.freeze({
  Newline: 'NEWLINE',
  Ident: 'IDENT',
  Number: 'NUMBER',
  String: 'STRING',
  Keyword: 'KEYWORD',
  Operator: 'OPERATOR',
  EOF: 'EOF',
});

/** The 24 reserved words, in their canonical VB house-style spelling. */
export const KEYWORDS = Object.freeze([
  'And', 'Dim', 'Else', 'ElseIf', 'End', 'Exit', 'False', 'For', 'Function',
  'If', 'Mod', 'Next', 'Not', 'Nothing', 'Or', 'Print', 'Return', 'Step',
  'Sub', 'Then', 'To', 'True', 'Until', 'While',
]);

/** lowercase spelling -> canonical spelling. Keywords match case-insensitively. */
export const KEYWORD_TABLE = new Map(KEYWORDS.map((k) => [k.toLowerCase(), k]));

/**
 * Operators, longest first: the lexer tries these in order, so `<>` and `<=`
 * are found before `<`.
 */
export const OPERATORS = Object.freeze([
  '<>', '<=', '>=',
  '+', '-', '*', '/', '\\', '^', '&', '=', '<', '>', '(', ')', ',',
]);

/**
 * The 17 built-ins of section 10 are deliberately NOT keywords. They are listed
 * here only so tools (a highlighter, the resolver) have one source of truth.
 */
export const BUILTINS = Object.freeze([
  'Len', 'Mid', 'InStr', 'UCase', 'LCase', 'Trim', 'Str', 'Val',
  'Int', 'Abs', 'Sqr', 'Rnd', 'Chr', 'Asc', 'UBound',
  'Transcript', 'Sleep',
]);

export const BUILTIN_TABLE = new Map(BUILTINS.map((b) => [b.toLowerCase(), b]));

/** A token as the human would name it in an error message. */
export function describeToken(token) {
  switch (token.type) {
    case TokenType.Newline: return 'end of line';
    case TokenType.EOF: return 'end of file';
    case TokenType.Keyword: return `'${token.canonical}'`;
    case TokenType.Operator: return `'${token.value}'`;
    case TokenType.Ident: return `identifier '${token.value}'`;
    case TokenType.Number: return `number ${token.text}`;
    case TokenType.String: {
      const shown = token.value.length > 16 ? `${token.value.slice(0, 16)}...` : token.value;
      return `string "${shown}"`;
    }
    default: return `'${token.value}'`;
  }
}
