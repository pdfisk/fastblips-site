(function () {
  'use strict';

  var EXAMPLES = {
    fizzbuzz: [
      "' FizzBuzz, 1 to 20",
      'For n = 1 To 20',
      '  If n Mod 15 = 0 Then',
      '    Print "FizzBuzz"',
      '  ElseIf n Mod 3 = 0 Then',
      '    Print "Fizz"',
      '  ElseIf n Mod 5 = 0 Then',
      '    Print "Buzz"',
      '  Else',
      '    Print n',
      '  End If',
      'Next',
      '',
    ].join('\n'),

    factorial: [
      "' A Function may be called before the line it is declared on.",
      'For i = 0 To 9',
      '  Print "Factorial(" & i & ") = " & Factorial(i)',
      'Next',
      '',
      'Function Factorial(n)',
      '  If n <= 1 Then Return 1',
      '  Return n * Factorial(n - 1)',
      'End Function',
      '',
    ].join('\n'),

    words: [
      "' Split on single spaces and report the longest word.",
      'Function Reverse(s)',
      '  Dim out = ""',
      '  For i = Len(s) To 1 Step -1',
      '    out = out & Mid(s, i, 1)',
      '  Next',
      '  Return out',
      'End Function',
      '',
      'Sub Report(label, value)',
      '  Print UCase(label) & ": " & value',
      'End Sub',
      '',
      'Dim words(31)',
      'Dim count = 0',
      'Dim text = "the quick brown fox jumps over the lazy dog"',
      'Dim start = 1',
      '',
      'While start <= Len(text)',
      '  Dim gap = InStr(Mid(text, start, Len(text)), " ")',
      '  If gap = 0 Then',
      '    words(count) = Mid(text, start, Len(text))',
      '    start = Len(text) + 1',
      '  Else',
      '    words(count) = Mid(text, start, gap - 1)',
      '    start = start + gap',
      '  End If',
      '  count = count + 1',
      'End While',
      '',
      'Dim longest = ""',
      'For i = 0 To count - 1',
      '  If Len(words(i)) > Len(longest) Then longest = words(i)',
      'Next',
      '',
      'Report("words", count)',
      'Report("longest", longest)',
      'Report("backwards", Reverse(longest))',
      '',
    ].join('\n'),

    sieve: [
      "' Primes below 100. Arrays run 0..n and start as Nothing.",
      'Dim n = 100',
      'Dim flags(n)',
      '',
      'For i = 0 To n',
      '  flags(i) = True',
      'Next',
      '',
      'Dim line = ""',
      'Dim count = 0',
      'For i = 2 To n',
      '  If flags(i) Then',
      '    count = count + 1',
      '    line = line & i & " "',
      '    Dim j = i * i',
      '    While j <= n',
      '      flags(j) = False',
      '      j = j + i',
      '    End While',
      '  End If',
      'Next',
      '',
      'Print line',
      'Print count & " primes below " & n',
      '',
    ].join('\n'),

    errors: [
      "' Crumb does no coercion: + is Numbers only, & is how you join text.",
      "' Run it to see the traceback, then change the + on line 10 to &.",
      'Function Depth(n)',
      '  If n = 0 Then Return Boom(1)',
      '  Return Depth(n - 1)',
      'End Function',
      '',
      'Function Boom(k)',
      '  Dim label = "total"',
      '  Return label + k',
      'End Function',
      '',
      'Print "before"',
      'Print Depth(2)',
      '',
    ].join('\n'),
  };

  var MAX_STEPS = 8000000;
  var STORAGE_KEY = 'crumb.playground.source';

  var $ = function (id) { return document.getElementById(id); };
  var source = $('source');
  var highlight = $('highlight');
  var gutter = $('gutter');
  var output = $('output');
  var statusEl = $('status');
  var statusText = $('status-text');
  var editorStatus = $('editor-status');
  var tabOutput = $('tab-output');
  var tabBytecode = $('tab-bytecode');

  var view = 'output';          // 'output' | 'bytecode'
  var flagged = [];             // source lines carrying a load error
  var lastRun = null;           // the rendered Output pane, kept across tab switches

  // ---------------------------------------------------------------- utilities

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function setStatus(state, text) {
    statusEl.setAttribute('data-state', state);
    statusText.textContent = text;
  }

  // ----------------------------------------------------- syntax highlighting
  // The word lists come from the bundled implementation, so the editor can
  // never disagree with the lexer about what is a keyword.

  var KEYWORDS = {};
  var BUILTINS = {};
  (window.Crumb.KEYWORDS || []).forEach(function (word) { KEYWORDS[word.toLowerCase()] = true; });
  (window.Crumb.BUILTINS || []).forEach(function (word) { BUILTINS[word.toLowerCase()] = true; });

  var TOKEN_RE = /('[^\n]*)|("(?:""|[^"\n])*")|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/\\^&=<>(),]+)/g;

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function paint(code) {
    var out = '';
    var last = 0;
    var previous = '';
    var match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(code)) !== null) {
      if (match.index > last) out += escapeHtml(code.slice(last, match.index));
      last = match.index + match[0].length;
      if (match[1]) { out += span('com', match[1]); previous = ''; }
      else if (match[2]) { out += span('str', match[2]); previous = ''; }
      else if (match[3]) { out += span('num', match[3]); previous = ''; }
      else if (match[4]) {
        var lower = match[4].toLowerCase();
        if (previous === 'sub' || previous === 'function') out += span('fn', match[4]);
        else if (KEYWORDS[lower]) out += span('kw', match[4]);
        else if (BUILTINS[lower]) out += span('fn', match[4]);
        else out += escapeHtml(match[4]);
        previous = lower;
      } else if (match[5]) { out += span('op', match[5]); previous = ''; }
    }
    out += escapeHtml(code.slice(last));
    return out;
  }

  // ------------------------------------------------------------ editor chrome

  function refreshEditor() {
    var code = source.value;
    // The trailing newline keeps the overlay's last line in step with the
    // textarea, which always reserves a line after a final newline.
    highlight.innerHTML = paint(code) + '\n';

    var count = code.split('\n').length;
    var marks = {};
    flagged.forEach(function (line) { marks[line] = true; });
    var rows = '';
    for (var i = 1; i <= count; i += 1) {
      rows += '<div' + (marks[i] ? ' class="flagged"' : '') + '>' + i + '</div>';
    }
    gutter.innerHTML = rows;

    editorStatus.textContent = plural(count, 'line') + ' · ' + plural(code.length, 'char');
    syncScroll();
  }

  function syncScroll() {
    highlight.scrollTop = source.scrollTop;
    highlight.scrollLeft = source.scrollLeft;
    gutter.scrollTop = source.scrollTop;
  }

  function jumpToLine(line) {
    var lines = source.value.split('\n');
    var start = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i += 1) start += lines[i].length + 1;
    var end = start + (lines[line - 1] === undefined ? 0 : lines[line - 1].length);
    source.focus();
    source.setSelectionRange(start, end);
    // Put the target line roughly a third of the way down the visible area.
    var leading = parseFloat(getComputedStyle(source).lineHeight) || 22;
    source.scrollTop = Math.max(0, (line - 1) * leading - source.clientHeight / 3);
    syncScroll();
  }

  // ------------------------------------------------------------------ running

  function renderDiagnostics(errors, sourceLines, heading) {
    var html = '<span class="err">' + escapeHtml(heading) + '</span>\n\n';
    errors.forEach(function (error) {
      html += '<span class="jump" data-line="' + error.line + '">'
        + escapeHtml('line ' + error.line + ': ' + error.message) + '</span>\n';
      var text = sourceLines[error.line - 1];
      if (text !== undefined && text.trim() !== '') {
        html += '<span class="echo">' + escapeHtml('  ' + text.replace(/\s+$/, '')) + '</span>\n';
      }
    });
    return html;
  }

  function runProgram() {
    var code = source.value;
    var lines = code.split('\n');
    var started = performance.now();
    var result = window.Crumb.run(code, { filename: 'program.crumb', maxSteps: MAX_STEPS });
    var elapsed = performance.now() - started;

    flagged = [];

    if (result.loadErrors.length > 0) {
      result.loadErrors.forEach(function (error) { flagged.push(error.line); });
      lastRun = renderDiagnostics(
        result.loadErrors, lines,
        plural(result.loadErrors.length, 'load error') + ' — nothing ran',
      );
      setStatus('bad', plural(result.loadErrors.length, 'load error'));
    } else {
      var html = '';
      if (result.output.length > 0) {
        html += escapeHtml(result.output.join('\n')) + '\n';
      }

      if (result.error) {
        flagged.push(result.error.line);
        if (result.output.length > 0) html += '<span class="rule">' + '─'.repeat(46) + '</span>\n';
        html += '<span class="jump" data-line="' + result.error.line + '">'
          + escapeHtml('line ' + result.error.line + ': ' + result.error.message) + '</span>\n';
        var text = lines[result.error.line - 1];
        if (text !== undefined && text.trim() !== '') {
          html += '<span class="echo">' + escapeHtml('  ' + text.replace(/\s+$/, '')) + '</span>\n';
        }
        result.error.traceback.forEach(function (frame) {
          html += '<span class="frame">'
            + escapeHtml('  in ' + frame.kind + ' ' + frame.name + ', called at line ' + frame.line)
            + '</span>\n';
        });
        setStatus('bad', 'runtime error');
      } else if (result.output.length === 0) {
        html = '<span class="placeholder">'
          + escapeHtml('The program ran and printed nothing.') + '</span>';
        setStatus('ok', elapsed.toFixed(1) + ' ms · ' + result.steps.toLocaleString() + ' ops');
      } else {
        setStatus('ok', elapsed.toFixed(1) + ' ms · ' + result.steps.toLocaleString() + ' ops');
      }
      lastRun = html;
    }

    refreshEditor();
    if (view === 'bytecode') renderBytecode();
    else output.innerHTML = lastRun;
    save();
  }

  // ----------------------------------------------------------------- bytecode

  function paintListing(text) {
    return escapeHtml(text)
      .replace(/^(\s*\S*\s+)(\d+)(\s\s)([A-Z_]+)/gm, function (_all, gutterText, address, gap, mnemonic) {
        return gutterText + '<span class="dis-addr">' + address + '</span>' + gap
          + '<span class="dis-op">' + mnemonic + '</span>';
      })
      .replace(/;.*$/gm, function (comment) { return '<span class="dis-note">' + comment + '</span>'; })
      .replace(/^(module|Sub .*|Function .*|constants|globals|line .*)$/gm, function (head) {
        return '<span class="dis-head">' + head + '</span>';
      });
  }

  function renderBytecode() {
    var code = source.value;
    var compiled = window.Crumb.compile(code, { filename: 'program.crumb' });

    if (!compiled.ok) {
      flagged = compiled.errors.map(function (error) { return error.line; });
      refreshEditor();
      output.innerHTML = renderDiagnostics(
        compiled.errors, code.split('\n'),
        plural(compiled.errors.length, 'load error') + ' — nothing to disassemble',
      );
      setStatus('bad', plural(compiled.errors.length, 'load error'));
      return;
    }

    var words = compiled.chunk.code.length;
    output.innerHTML = paintListing(window.Crumb.disassemble(compiled.chunk));
    setStatus('ok', words.toLocaleString() + ' words · '
      + plural(compiled.chunk.procedures.length, 'procedure'));
  }

  function showView(next) {
    view = next;
    tabOutput.setAttribute('aria-selected', String(next === 'output'));
    tabBytecode.setAttribute('aria-selected', String(next === 'bytecode'));
    output.scrollTop = 0;
    if (next === 'bytecode') {
      renderBytecode();
    } else {
      output.innerHTML = lastRun !== null ? lastRun
        : '<span class="placeholder">Press Run to execute the program.</span>';
      setStatus(statusEl.getAttribute('data-state') || '', statusText.textContent);
    }
  }

  // ------------------------------------------------------------------ storage

  function save() {
    try { localStorage.setItem(STORAGE_KEY, source.value); } catch (err) { /* private mode */ }
  }

  function load() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (err) { return null; }
  }

  // ------------------------------------------------------------------- events

  $('run').addEventListener('click', function () { showView('output'); runProgram(); });

  $('clear-input').addEventListener('click', function () {
    source.value = '';
    flagged = [];
    refreshEditor();
    source.focus();
    save();
  });

  $('clear-output').addEventListener('click', function () {
    lastRun = null;
    flagged = [];
    refreshEditor();
    output.innerHTML = '<span class="placeholder">Press Run to execute the program.</span>';
    setStatus('', 'ready');
    if (view === 'bytecode') showView('output');
  });

  $('example').addEventListener('change', function (event) {
    var chosen = EXAMPLES[event.target.value];
    if (!chosen) return;
    source.value = chosen;
    flagged = [];
    refreshEditor();
    showView('output');
    runProgram();
  });

  tabOutput.addEventListener('click', function () { showView('output'); });
  tabBytecode.addEventListener('click', function () { showView('bytecode'); });

  source.addEventListener('input', function () { refreshEditor(); save(); });
  source.addEventListener('scroll', syncScroll);

  source.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      showView('output');
      runProgram();
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      var start = source.selectionStart;
      var end = source.selectionEnd;
      source.value = source.value.slice(0, start) + '  ' + source.value.slice(end);
      source.selectionStart = source.selectionEnd = start + 2;
      refreshEditor();
      save();
    }
  });

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter'
        && document.activeElement !== source) {
      event.preventDefault();
      showView('output');
      runProgram();
    }
  });

  output.addEventListener('click', function (event) {
    var target = event.target.closest('.jump');
    if (!target) return;
    jumpToLine(Number(target.getAttribute('data-line')));
  });

  // --------------------------------------------------------------------- boot

  var saved = load();
  source.value = saved !== null && saved !== '' ? saved : EXAMPLES.fizzbuzz;
  refreshEditor();
  runProgram();
})();
