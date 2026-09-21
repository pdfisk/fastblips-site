// Human-readable AST dump. Indented s-expressions read far better than JSON
// when you are checking that precedence came out right.

const OPEN = '(';
const CLOSE = ')';

function lines(node) {
  switch (node.type) {
    case 'Program': {
      const out = [];
      for (const proc of node.procedures) out.push(...lines(proc));
      for (const statement of node.body) out.push(...lines(statement));
      return wrap('program', out);
    }

    // --- declarations ------------------------------------------------------
    case 'SubDeclaration':
    case 'FunctionDeclaration': {
      const head = `${node.kind.toLowerCase()} ${node.name}(${node.params.map((p) => p.name).join(', ')})`;
      return wrap(head, node.body.flatMap(lines));
    }

    // --- statements --------------------------------------------------------
    case 'DimStatement':
      if (node.size) return wrap(`dim ${node.name} size`, lines(node.size));
      if (node.init) return wrap(`dim ${node.name} =`, lines(node.init));
      return [`${OPEN}dim ${node.name}${CLOSE}`];

    case 'AssignStatement':
      return wrap('assign', [...lines(node.target), ...lines(node.value)]);

    case 'CallStatement':
      return wrap('call', lines(node.call));

    case 'PrintStatement':
      return node.args.length === 0
        ? [`${OPEN}print${CLOSE}`]
        : wrap('print', node.args.flatMap(lines));

    case 'TranscriptStatement':
      return node.args.length === 0
        ? [`${OPEN}transcript${CLOSE}`]
        : wrap('transcript', node.args.flatMap(lines));

    case 'IfStatement': {
      const out = [];
      node.branches.forEach((branch, index) => {
        out.push(...wrap(index === 0 ? 'when' : 'else-when', [
          ...(branch.condition ? lines(branch.condition) : ['<error>']),
          ...wrap('then', branch.body.flatMap(lines)),
        ]));
      });
      if (node.elseBody) out.push(...wrap('otherwise', node.elseBody.flatMap(lines)));
      return wrap(node.singleLine ? 'if-inline' : 'if', out);
    }

    case 'WhileStatement':
      return wrap('while', [...lines(node.condition), ...wrap('do', node.body.flatMap(lines))]);

    case 'ForStatement':
      return wrap(`for ${node.variable}`, [
        ...wrap('from', lines(node.start)),
        ...wrap('to', lines(node.limit)),
        ...(node.step ? wrap('step', lines(node.step)) : []),
        ...wrap('do', node.body.flatMap(lines)),
      ]);

    case 'ExitStatement':
      return [`${OPEN}exit ${node.kind.toLowerCase()}${CLOSE}`];

    case 'ReturnStatement':
      return node.value ? wrap('return', lines(node.value)) : [`${OPEN}return${CLOSE}`];

    // --- expressions -------------------------------------------------------
    case 'Binary':
      return wrap(node.operator.toLowerCase(), [...lines(node.left), ...lines(node.right)]);

    case 'Unary':
      return wrap(`unary ${node.operator.toLowerCase()}`, lines(node.operand));

    case 'Apply':
      return node.args.length === 0
        ? [`${OPEN}apply ${node.name}${CLOSE}`]
        : wrap(`apply ${node.name}`, node.args.flatMap(lines));

    case 'Index':
      return wrap(`index ${node.name}`, lines(node.index));

    case 'Variable':
      return [`${OPEN}var ${node.name}${CLOSE}`];

    case 'NumberLiteral':
      return [`${OPEN}num ${node.text ?? node.value}${CLOSE}`];

    case 'StringLiteral':
      return [`${OPEN}str ${JSON.stringify(node.value)}${CLOSE}`];

    case 'BooleanLiteral':
      return [`${OPEN}bool ${node.value}${CLOSE}`];

    case 'NothingLiteral':
      return [`${OPEN}nothing${CLOSE}`];

    default:
      return [`${OPEN}?${node.type}${CLOSE}`];
  }
}

function wrap(head, children) {
  if (children.length === 0) return [`${OPEN}${head}${CLOSE}`];
  if (children.length === 1 && !children[0].includes('\n') && (head + children[0]).length < 56) {
    return [`${OPEN}${head} ${children[0]}${CLOSE}`];
  }
  return [`${OPEN}${head}`, ...children.map((line) => `  ${line}`), CLOSE];
}

/** Renders an AST node as an indented s-expression. */
export function formatAst(node) {
  return lines(node).join('\n');
}

/** One line per token, for inspecting the lexer. */
export function formatTokens(tokens) {
  return tokens.map((token) => {
    const where = `${String(token.line).padStart(4)}:${String(token.column).padEnd(3)}`;
    const text = token.type === 'NEWLINE' || token.type === 'EOF'
      ? ''
      : (token.text ?? token.value);
    return `${where} ${token.type.padEnd(8)} ${text}`;
  }).join('\n');
}
