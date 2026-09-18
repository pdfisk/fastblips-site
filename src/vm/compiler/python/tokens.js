// MiniPy token kinds, keywords and the Token record.
// Extracted from the MiniPy playground; the Python front end's first stage.

// Token kinds. Grouped roughly by §2/§13 of the spec.
const T = {
  // literals / names
  NUMBER: 'NUMBER', STRING: 'STRING', FSTRING: 'FSTRING', IDENT: 'IDENT',
  // structure
  NEWLINE: 'NEWLINE', INDENT: 'INDENT', DEDENT: 'DEDENT', EOF: 'EOF',
  // punctuation
  LPAREN: '(', RPAREN: ')', LBRACKET: '[', RBRACKET: ']', LBRACE: '{', RBRACE: '}',
  COMMA: ',', COLON: ':', DOT: '.', ARROW: '->',
  // operators
  PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/', DSLASH: '//', PERCENT: '%', DSTAR: '**',
  ASSIGN: '=', EQ: '==', NE: '!=', LT: '<', LE: '<=', GT: '>', GE: '>=',
  PLUS_EQ: '+=', MINUS_EQ: '-=', STAR_EQ: '*=', SLASH_EQ: '/=', DSLASH_EQ: '//=', PERCENT_EQ: '%=',
  // keywords (value is the lowercase spelling)
  KEYWORD: 'KEYWORD',
};

const KEYWORDS = new Set([
  'and', 'or', 'not', 'if', 'elif', 'else', 'while', 'for', 'in',
  'def', 'return', 'class', 'try', 'except', 'finally', 'raise', 'from',
  'break', 'continue', 'pass', 'del', 'as', 'is',
  'True', 'False', 'None',
]);

class Token {
  constructor(type, value, line, col) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.col = col;
  }
  toString() {
    return `${this.type}(${JSON.stringify(this.value)})@${this.line}`;
  }
}

export { T, KEYWORDS, Token };
