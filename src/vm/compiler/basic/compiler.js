// AST -> bytecode. This pass is also the resolver, so it reports the three
// load errors the parser cannot see (spec section 11): a reference to an
// undeclared name, a duplicate Dim in one scope, and a wrong argument count.
//
// Scope model (section 5): exactly two scopes. Module variables live in a flat
// globals array; a procedure's parameters and every Dim in its body live in a
// flat slots array. Blocks do not scope, so a Dim inside an If body occupies a
// procedure slot and is visible for the rest of that procedure.

import { Op, CRUMB_BINARY_OPS as BINARY_OPS, FORMAT } from '../../opcodes.js';
import { BUILTINS } from '../../runtime/crumb-builtins.js';
import { CLASSES, CLASS_LIST, METHODS } from '../../runtime/crumb-objects.js';
import { CrumbError, sortErrors } from './diagnostics.js';

class Scope {
  constructor(kind) {
    this.kind = kind;                 // 'module' | 'procedure'
    this.names = new Map();           // lower -> { name, slot, line, hidden }
    this.declaredAt = new Map();      // lower -> line of the Dim that declared it
    this.count = 0;
  }

  /** Allocates a slot. Module names are allocated in a pre-pass, before the
   *  Dim that declares them is compiled, so slot allocation and declaration
   *  are deliberately separate steps. */
  allocate(name, lower, line, hidden = false) {
    const existing = this.names.get(lower);
    if (existing) return existing;
    const entry = { name, slot: this.count, line, hidden };
    this.count += 1;
    this.names.set(lower, entry);
    return entry;
  }
}

export class Compiler {
  constructor({ filename = 'input.crumb' } = {}) {
    this.filename = filename;
    this.code = [];
    this.lines = [];
    this.constants = [];
    this.constantIndex = new Map();
    this.errors = [];
    this.seen = new Set();

    this.module = new Scope('module');
    this.scope = this.module;         // current scope
    this.visible = new Set();         // module names declared so far, in order
    this.procs = [];                  // { name, kind, arity, entry, slotCount }
    this.procIndex = new Map();       // lower -> index into procs
    this.loops = [];                  // { kind, breaks: [] }
    this.hiddenCounter = 0;
  }

  // ------------------------------------------------------------------ emitting

  emit(op, ...operands) {
    const at = this.code.length;
    this.code.push(op, ...operands);
    while (this.lines.length < this.code.length) this.lines.push(this.line);
    return at;
  }

  /** Emits a jump with a placeholder target; returns the operand's address. */
  emitJump(op) {
    this.emit(op, 0);
    return this.code.length - 1;
  }

  patch(address, target = this.code.length) {
    this.code[address] = target;
  }

  constant(value) {
    const key = `${typeof value}:${value}`;
    if (this.constantIndex.has(key)) return this.constantIndex.get(key);
    const index = this.constants.length;
    this.constants.push(value);
    this.constantIndex.set(key, index);
    return index;
  }

  error(message, node) {
    const line = node?.line ?? this.line ?? 0;
    const column = node?.column ?? 0;
    const key = `${line}:${column}:${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.errors.push(new CrumbError(message, { line, column, phase: 'load' }));
  }

  // -------------------------------------------------------------------- names

  isBuiltin(lower) {
    return BUILTINS.has(lower);
  }

  /** Looks a name up in the current scope, then the module scope. */
  resolve(lower) {
    if (this.scope !== this.module) {
      const local = this.scope.names.get(lower);
      if (local) return { where: 'local', entry: local };
    }
    const global = this.module.names.get(lower);
    if (!global) return null;
    // At module level a name is visible only from its Dim onwards (section 5).
    // Inside a procedure every module variable is visible (section 4's
    // two-pass load), whatever line it was declared on.
    if (this.scope === this.module && !this.visible.has(lower)) return null;
    return { where: 'global', entry: global };
  }

  emitGet(ref) {
    this.emit(ref.where === 'local' ? Op.GET_LOCAL : Op.GET_GLOBAL, ref.entry.slot);
  }

  emitSet(ref) {
    this.emit(ref.where === 'local' ? Op.SET_LOCAL : Op.SET_GLOBAL, ref.entry.slot);
  }

  /** Declares a name in the current scope, reporting the clashes of sections 5, 7, 10. */
  declare(name, lower, node, { hidden = false } = {}) {
    const line = node?.line ?? this.line;

    if (!hidden) {
      if (this.isBuiltin(lower)) {
        this.error(`'${name}' is a built-in function and cannot be redeclared`, node);
      } else if (this.procIndex.has(lower)) {
        const proc = this.procs[this.procIndex.get(lower)];
        this.error(
          `'${name}' is already the name of a ${proc.kind} declared on line ${proc.line}: procedures and variables share one namespace`,
          node,
        );
      } else if (this.scope.declaredAt.has(lower)) {
        this.error(`'${name}' is already declared on line ${this.scope.declaredAt.get(lower)}`, node);
      }
    }

    const entry = this.scope.allocate(name, lower, line, hidden);
    if (!this.scope.declaredAt.has(lower)) this.scope.declaredAt.set(lower, line);
    if (this.scope === this.module) this.visible.add(lower);
    return { where: this.scope === this.module ? 'global' : 'local', entry };
  }

  /** A compiler-owned slot, for the temporaries a For loop needs. */
  hidden(tag) {
    this.hiddenCounter += 1;
    const name = `${tag}$${this.hiddenCounter}`;
    return this.declare(name, name, null, { hidden: true });
  }

  // ------------------------------------------------------------------ program

  compileProgram(ast) {
    this.line = 1;

    // Pass 1: every procedure, so a call can precede its declaration.
    for (const proc of ast.procedures) {
      if (this.isBuiltin(proc.nameLower)) {
        this.error(`'${proc.name}' is a built-in function and cannot be redeclared`, proc);
        continue;
      }
      if (this.procIndex.has(proc.nameLower)) continue;   // parser already said so
      this.procIndex.set(proc.nameLower, this.procs.length);
      this.procs.push({
        name: proc.name,
        kind: proc.kind,
        arity: proc.params.length,
        line: proc.line,
        entry: -1,
        slotCount: 0,
        node: proc,
      });
    }

    // Pass 2: every module-level declaration, so procedure bodies can see all
    // of them regardless of source order.
    this.collectModuleNames(ast.body);
    this.visible = new Set();     // module statements still resolve in order

    // Pass 3: module code, which runs first and therefore sits at address 0.
    for (const statement of ast.body) this.statement(statement);
    this.emit(Op.HALT);

    // Pass 4: the procedures, appended after the module code.
    for (const proc of this.procs) this.procedure(proc);

    return {
      language: 'crumb',
      filename: this.filename,
      code: this.code,
      lines: this.lines,
      constants: this.constants,
      globalCount: this.module.count,
      globalNames: [...this.module.names.values()].map((e) => e.name),
      procedures: this.procs.map(({ node, ...rest }) => rest),
      entry: 0,
    };
  }

  /** Walks module-level blocks registering every Dim and For variable. */
  collectModuleNames(statements) {
    for (const statement of statements) {
      switch (statement.type) {
        case 'DimStatement':
          this.module.allocate(statement.name, statement.nameLower, statement.line);
          break;
        case 'ForStatement':
          this.module.allocate(statement.variable, statement.variableLower, statement.line);
          this.collectModuleNames(statement.body);
          break;
        case 'WhileStatement':
          this.collectModuleNames(statement.body);
          break;
        case 'IfStatement':
          for (const branch of statement.branches) this.collectModuleNames(branch.body);
          if (statement.elseBody) this.collectModuleNames(statement.elseBody);
          break;
        default:
          break;
      }
    }
  }

  procedure(proc) {
    const node = proc.node;
    proc.entry = this.code.length;
    this.line = node.line;

    const scope = new Scope('procedure');
    this.scope = scope;
    const outerLoops = this.loops;
    this.loops = [];

    for (const param of node.params) {
      if (this.isBuiltin(param.nameLower)) {
        this.error(`'${param.name}' is a built-in function and cannot be used as a parameter name`, node);
      }
      scope.allocate(param.name, param.nameLower, node.line);
      if (!scope.declaredAt.has(param.nameLower)) {
        scope.declaredAt.set(param.nameLower, node.line);
      }
    }

    for (const statement of node.body) this.statement(statement);

    // Section 7: a Sub returns Nothing; a Function that reaches its End is a
    // runtime error. Attribute that error to the declaration line, which is
    // more useful than the last statement that happened to run.
    this.line = node.line;
    this.emit(proc.kind === 'Sub' ? Op.RETURN_NOTHING : Op.NO_RETURN);

    proc.slotCount = scope.count;
    proc.slotNames = [...scope.names.values()].map((e) => e.name);
    this.loops = outerLoops;
    this.scope = this.module;
  }

  // --------------------------------------------------------------- statements

  statement(node) {
    this.line = node.line ?? this.line;
    switch (node.type) {
      case 'DimStatement': return this.dim(node);
      case 'AssignStatement': return this.assign(node);
      case 'CallStatement': return this.callStatement(node);
      case 'MethodCallStatement':
        this.expression(node.call);
        this.emit(Op.POP);
        return undefined;
      case 'PrintStatement': return this.print(node);
      case 'TranscriptStatement': return this.transcript(node);
      case 'IfStatement': return this.ifStatement(node);
      case 'WhileStatement': return this.whileStatement(node);
      case 'ForStatement': return this.forStatement(node);
      case 'ExitStatement': return this.exit(node);
      case 'ReturnStatement': return this.returnStatement(node);
      default:
        this.error(`cannot compile ${node.type}`, node);
        return undefined;
    }
  }

  dim(node) {
    const ref = this.declare(node.name, node.nameLower, node);

    if (node.size) {
      this.expression(node.size);
      this.emit(Op.NEW_ARRAY);
    } else if (node.init) {
      this.expression(node.init);
    } else {
      this.emit(Op.NOTHING);
    }
    this.emitSet(ref);
  }

  assign(node) {
    const target = node.target;

    if (target.type === 'Variable') {
      const ref = this.lvalue(target);
      if (!ref) return;
      this.expression(node.value);
      this.emitSet(ref);
      return;
    }

    // name(index) = value  ->  push array, index, value; SET_INDEX
    const ref = this.lvalue(target);
    if (!ref) return;
    this.emitGet(ref);
    this.expression(target.index);
    this.expression(node.value);
    this.emit(Op.SET_INDEX);
  }

  /** Resolves an assignment target, reporting what cannot be assigned to. */
  lvalue(target) {
    if (this.isBuiltin(target.nameLower)) {
      this.error(`'${target.name}' is a built-in function and cannot be assigned to`, target);
      return null;
    }
    if (this.procIndex.has(target.nameLower)) {
      const proc = this.procs[this.procIndex.get(target.nameLower)];
      this.error(`'${target.name}' is a ${proc.kind} and cannot be assigned to`, target);
      return null;
    }
    const ref = this.resolve(target.nameLower);
    if (!ref) {
      this.error(this.undeclaredMessage(target), target);
      return null;
    }
    return ref;
  }

  undeclaredMessage(node) {
    const name = node.name;
    if (this.module.names.has(node.nameLower) && this.scope === this.module) {
      const entry = this.module.names.get(node.nameLower);
      return `'${name}' is used before its 'Dim' on line ${entry.line}`;
    }
    return `'${name}' is not declared`;
  }

  callStatement(node) {
    this.apply(node.call, { statement: true });
    this.emit(Op.POP);
  }

  print(node) {
    for (const arg of node.args) this.expression(arg);
    this.emit(Op.PRINT, node.args.length, FORMAT.CRUMB);
  }

  transcript(node) {
    for (const arg of node.args) this.expression(arg);
    this.emit(Op.TRANSCRIPT, node.args.length, FORMAT.CRUMB);
  }

  ifStatement(node) {
    const ends = [];

    for (const branch of node.branches) {
      if (!branch.condition) continue;                  // parse error recovery
      this.line = branch.condition.line ?? this.line;
      this.expression(branch.condition);
      const skip = this.emitJump(Op.JUMP_IF_FALSE);
      for (const statement of branch.body) this.statement(statement);
      ends.push(this.emitJump(Op.JUMP));
      this.patch(skip);
    }

    if (node.elseBody) {
      for (const statement of node.elseBody) this.statement(statement);
    }
    for (const end of ends) this.patch(end);
  }

  whileStatement(node) {
    const top = this.code.length;
    this.expression(node.condition);
    const exit = this.emitJump(Op.JUMP_IF_FALSE);

    this.loops.push({ kind: 'While', breaks: [] });
    for (const statement of node.body) this.statement(statement);
    const loop = this.loops.pop();

    this.emit(Op.JUMP, top);
    this.patch(exit);
    for (const jump of loop.breaks) this.patch(jump);
  }

  /**
   * For is desugared rather than given its own opcodes, so the VM stays small
   * and the disassembly shows exactly what section 6 specifies: start, limit
   * and step are evaluated once, before the first iteration.
   *
   * With a literal step (including the default of 1) the direction is known at
   * compile time, so the loop is just:
   *
   *   <start> and <limit> -> limit$, then the start value -> var
   * top: var <= limit$          ' or >= for a negative step
   *        JUMP_IF_FALSE end
   *        <body>
   *        var = var + <step>
   *        JUMP top
   *   end:
   *
   * A computed step needs two more hidden slots and a direction test:
   *
   *   <step> -> step$       step$ >= 0 -> up$
   *   top: up$ ? (var <= limit$) : (var >= limit$)
   */
  forStatement(node) {
    // Section 6: For declares its loop variable if it is not already declared,
    // "in the enclosing scope". Inside a procedure the enclosing scope is that
    // procedure, so the lookup deliberately does NOT fall through to module
    // scope: otherwise `For i` in a procedure would silently drive a module
    // variable that happens to be named i, and a caller's own `For i` loop
    // would never terminate.
    let ref = null;
    if (this.scope === this.module) {
      ref = this.resolve(node.variableLower);
    } else if (this.scope.names.has(node.variableLower)) {
      ref = { where: 'local', entry: this.scope.names.get(node.variableLower) };
    }
    if (!ref) {
      if (this.isBuiltin(node.variableLower) || this.procIndex.has(node.variableLower)) {
        this.error(`'${node.variable}' cannot be used as a loop variable: the name is already taken`, node);
        return;
      }
      ref = this.declare(node.variable, node.variableLower, node);
    }

    // A literal step, or the default of 1, fixes the direction at compile time.
    const literalStep = node.step === null ? 1
      : (node.step.type === 'NumberLiteral' ? node.step.value
        : (node.step.type === 'Unary' && node.step.operator === '-'
          && node.step.operand.type === 'NumberLiteral' ? -node.step.operand.value : null));

    const limit = this.hidden('for$limit');
    const step = literalStep === null ? this.hidden('for$step') : null;
    const up = literalStep === null ? this.hidden('for$up') : null;

    // Section 6 evaluates start, limit and step - in that order - before the
    // first iteration, and only then assigns the loop variable. The start
    // value waits on the stack meanwhile, so that `For i = 1 To i` reads the
    // old i as its limit rather than the 1 just assigned.
    this.expression(node.start);
    this.expression(node.limit);
    this.emitSet(limit);

    if (literalStep === null) {
      this.expression(node.step);
      this.emitSet(step);
      this.emitGet(step);
      this.emit(Op.CONST, this.constant(0));
      this.emit(Op.GE);
      this.emitSet(up);
    }

    this.emitSet(ref);            // pops the start value

    const top = this.code.length;
    let exit;

    if (literalStep === null) {
      this.emitGet(up);
      const descending = this.emitJump(Op.JUMP_IF_FALSE);
      this.emitGet(ref);
      this.emitGet(limit);
      this.emit(Op.LE);
      const tested = this.emitJump(Op.JUMP);
      this.patch(descending);
      this.emitGet(ref);
      this.emitGet(limit);
      this.emit(Op.GE);
      this.patch(tested);
      exit = this.emitJump(Op.JUMP_IF_FALSE);
    } else {
      this.emitGet(ref);
      this.emitGet(limit);
      this.emit(literalStep < 0 ? Op.GE : Op.LE);
      exit = this.emitJump(Op.JUMP_IF_FALSE);
    }

    this.loops.push({ kind: 'For', breaks: [] });
    for (const statement of node.body) this.statement(statement);
    const loop = this.loops.pop();

    this.emitGet(ref);
    if (literalStep === null) this.emitGet(step);
    else this.emit(Op.CONST, this.constant(literalStep));
    this.emit(Op.ADD);
    this.emitSet(ref);
    this.emit(Op.JUMP, top);

    this.patch(exit);
    for (const jump of loop.breaks) this.patch(jump);
  }

  exit(node) {
    for (let i = this.loops.length - 1; i >= 0; i -= 1) {
      if (this.loops[i].kind === node.kind) {
        this.loops[i].breaks.push(this.emitJump(Op.JUMP));
        return;
      }
    }
    // The parser already reported this; emit nothing rather than a bad jump.
  }

  returnStatement(node) {
    if (node.value) {
      this.expression(node.value);
      this.emit(Op.RETURN);
    } else {
      this.emit(Op.RETURN_NOTHING);
    }
  }

  // -------------------------------------------------------------- expressions

  expression(node) {
    if (!node) { this.emit(Op.NOTHING); return; }
    this.line = node.line ?? this.line;

    switch (node.type) {
      case 'NumberLiteral':
        this.emit(Op.CONST, this.constant(node.value));
        return;
      case 'StringLiteral':
        this.emit(Op.CONST, this.constant(node.value));
        return;
      case 'BooleanLiteral':
        this.emit(node.value ? Op.TRUE : Op.FALSE);
        return;
      case 'NothingLiteral':
        this.emit(Op.NOTHING);
        return;
      case 'Variable':
        return this.variable(node);
      case 'Apply':
        return this.apply(node, { statement: false });
      case 'New':
        return this.newObject(node);
      case 'MethodCall':
        return this.methodCall(node);
      case 'Unary':
        return this.unary(node);
      case 'Binary':
        return this.binary(node);
      default:
        this.error(`cannot compile ${node.type}`, node);
        this.emit(Op.NOTHING);
        return;
    }
  }

  variable(node) {
    if (this.isBuiltin(node.nameLower)) {
      const builtin = BUILTINS.get(node.nameLower);
      this.error(
        `'${node.name}' is a built-in function: call it as '${builtin.name}(${'_, '.repeat(builtin.arity).slice(0, -2)})'`,
        node,
      );
      this.emit(Op.NOTHING);
      return;
    }
    if (this.procIndex.has(node.nameLower)) {
      const proc = this.procs[this.procIndex.get(node.nameLower)];
      this.error(`'${node.name}' is a ${proc.kind}: call it as '${proc.name}(...)'`, node);
      this.emit(Op.NOTHING);
      return;
    }
    const ref = this.resolve(node.nameLower);
    if (!ref) {
      this.error(this.undeclaredMessage(node), node);
      this.emit(Op.NOTHING);
      return;
    }
    this.emitGet(ref);
  }

  /**
   * Section 9: `a(i)` and `f(i)` share one AST node. This is where it is
   * finally classified as an array index, a user call, or a builtin call.
   */
  apply(node, { statement }) {
    const lower = node.nameLower;

    if (this.isBuiltin(lower)) {
      const builtin = BUILTINS.get(lower);
      if (node.args.length !== builtin.arity) {
        this.error(
          `'${builtin.name}' takes ${builtin.arity} argument${builtin.arity === 1 ? '' : 's'}, found ${node.args.length}`,
          node,
        );
      }
      for (const arg of node.args) this.expression(arg);
      this.emit(Op.CALL_BUILTIN, builtin.index, node.args.length);
      return;
    }

    if (this.procIndex.has(lower)) {
      const index = this.procIndex.get(lower);
      const proc = this.procs[index];
      if (node.args.length !== proc.arity) {
        this.error(
          `'${proc.name}' takes ${proc.arity} argument${proc.arity === 1 ? '' : 's'}, found ${node.args.length}`,
          node,
        );
      }
      if (proc.kind === 'Sub' && !statement) {
        this.error(`'${proc.name}' is a Sub and has no value: it cannot be used in an expression`, node);
      }
      for (const arg of node.args) this.expression(arg);
      this.emit(Op.CALL, index, node.args.length);
      return;
    }

    const ref = this.resolve(lower);
    if (!ref) {
      this.error(this.undeclaredMessage(node), node);
      this.emit(Op.NOTHING);
      return;
    }

    // A declared name with parentheses is an array subscript.
    if (statement) {
      this.error(`'${node.name}' is a variable, not a procedure`, node);
      this.emit(Op.NOTHING);
      return;
    }
    if (node.args.length !== 1) {
      this.error(
        `'${node.name}' is an array subscript and takes exactly one index, found ${node.args.length}`,
        node,
      );
      for (const arg of node.args) this.expression(arg);
      this.emit(Op.NOTHING);
      return;
    }
    this.emitGet(ref);
    this.expression(node.args[0]);
    this.emit(Op.GET_INDEX);
  }

  /** New Class(args): the class is known at compile time (section 10.1). */
  newObject(node) {
    const cls = CLASSES.get(node.classLower);
    for (const arg of node.args) this.expression(arg);
    if (!cls) {
      const names = CLASS_LIST.map((c) => c.name).sort().join(', ');
      this.error(`there is no class '${node.className}': the classes are ${names}`, node);
      this.emit(Op.NOTHING);
      return;
    }
    if (node.args.length !== cls.arity) {
      this.error(
        `'New ${cls.name}' takes ${cls.arity} argument${cls.arity === 1 ? '' : 's'}, found ${node.args.length}`,
        node,
      );
    }
    this.emit(Op.NEW_OBJECT, cls.index, node.args.length);
  }

  /**
   * object.method(args). Which object it is is only known at run time, but
   * the method must exist and get the right number of arguments.
   */
  methodCall(node) {
    const method = METHODS.get(node.methodLower);
    if (!method) {
      this.error(`there is no method '${node.method}'`, node);
    } else if (node.args.length !== method.arity) {
      this.error(
        `'${method.name}' takes ${method.arity} argument${method.arity === 1 ? '' : 's'}, found ${node.args.length}`,
        node,
      );
    }
    this.expression(node.object);
    for (const arg of node.args) this.expression(arg);
    this.line = node.line;
    this.emit(Op.CALL_METHOD, this.constant(method ? method.name : node.method), node.args.length);
  }

  unary(node) {
    this.expression(node.operand);
    if (node.operator === '-') {
      this.emit(Op.NEG);
    } else if (node.operator === 'Not') {
      this.emit(Op.NOT);
    } else if (node.operator === '+') {
      // Unary + is the identity on a Number, but it must still reject a
      // String, so it compiles to a double negation rather than to nothing.
      this.emit(Op.NEG);
      this.emit(Op.NEG);
    }
  }

  binary(node) {
    // And / Or short-circuit (section 8). The left operand's type is checked
    // by the jump; the right operand's by CHECK_BOOL, which the jump skips.
    if (node.operator === 'And' || node.operator === 'Or') {
      this.expression(node.left);
      const jump = this.emitJump(node.operator === 'And' ? Op.AND_JUMP : Op.OR_JUMP);
      this.expression(node.right);
      this.emit(Op.CHECK_BOOL);
      this.patch(jump);
      return;
    }

    const op = BINARY_OPS[node.operator];
    if (op === undefined) {
      this.error(`unknown operator '${node.operator}'`, node);
      this.emit(Op.NOTHING);
      return;
    }
    this.expression(node.left);
    this.expression(node.right);
    this.emit(op);
  }
}

/**
 * Compiles a parsed program.
 * @returns {{chunk: object, errors: CrumbError[]}}
 */
export function compile(ast, options = {}) {
  const compiler = new Compiler(options);
  const chunk = compiler.compileProgram(ast);
  return { chunk, errors: sortErrors(compiler.errors) };
}
