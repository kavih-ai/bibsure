/**
 * CiteCheck VSCode Extension — Main Entry Point
 *
 * Features:
 * - Real-time BibTeX validation via CrossRef API
 * - Inline diagnostic errors/warnings in the editor
 * - Hover tooltips on @article{key} entries showing validation status
 * - Status bar indicator
 * - Results webview panel
 * - Validate on save (configurable)
 */

'use strict';

const vscode = require('vscode');

// ── Constants ──
const CROSSREF_BASE = 'https://api.crossref.org';
const EXTENSION_ID = 'citecheck';
const DIAGNOSTIC_SOURCE = 'CiteCheck';

// ── State ──
let diagnosticCollection;
let statusBarItem;
let validationResults = new Map(); // key → result
let decorationType;

/**
 * Extension activation entry point
 */
function activate(context) {
  console.log('[CiteCheck] Extension activated');

  // Create diagnostic collection for inline errors
  diagnosticCollection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(diagnosticCollection);

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'citecheck.showPanel';
  statusBarItem.text = '$(check) CiteCheck';
  statusBarItem.tooltip = 'CiteCheck — Click to show citation results';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Inline decoration type (✓/✗ icons next to entries)
  decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      fontStyle: 'normal',
      fontWeight: 'normal',
    }
  });
  context.subscriptions.push(decorationType);

  // ── Register Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand('citecheck.validateFile', () => validateActiveFile()),
    vscode.commands.registerCommand('citecheck.validateSelection', () => validateSelection()),
    vscode.commands.registerCommand('citecheck.validateWorkspace', () => validateWorkspace()),
    vscode.commands.registerCommand('citecheck.showPanel', () => showResultsPanel(context))
  );

  // ── Validate on save ──
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const config = vscode.workspace.getConfiguration(EXTENSION_ID);
      if (config.get('enableOnSave') && doc.languageId === 'bibtex') {
        validateDocument(doc);
      }
    })
  );

  // ── Validate when .bib file opens ──
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.languageId === 'bibtex') {
        validateDocument(doc);
      }
    })
  );

  // ── Hover provider for BibTeX entries ──
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('bibtex', {
      provideHover(document, position) {
        return provideHover(document, position);
      }
    })
  );

  // Validate currently open .bib files on startup
  if (vscode.window.activeTextEditor?.document.languageId === 'bibtex') {
    validateDocument(vscode.window.activeTextEditor.document);
  }
}

/**
 * Validate the currently active .bib file
 */
async function validateActiveFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('CiteCheck: No active editor found.');
    return;
  }
  if (editor.document.languageId !== 'bibtex') {
    vscode.window.showWarningMessage('CiteCheck: This command works on .bib files only.');
    return;
  }
  await validateDocument(editor.document);
}

/**
 * Validate only the selected text
 */
async function validateSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('CiteCheck: Select a BibTeX entry to validate.');
    return;
  }
  const selectedText = editor.document.getText(editor.selection);
  const citations = parseBib(selectedText);
  if (citations.length === 0) {
    vscode.window.showWarningMessage('CiteCheck: No valid BibTeX entries found in selection.');
    return;
  }
  await validateCitationsWithProgress(citations, editor.document.uri);
}

/**
 * Validate all .bib files in the workspace
 */
async function validateWorkspace() {
  const bibFiles = await vscode.workspace.findFiles('**/*.bib', '**/node_modules/**');
  if (bibFiles.length === 0) {
    vscode.window.showInformationMessage('CiteCheck: No .bib files found in workspace.');
    return;
  }

  for (const fileUri of bibFiles) {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await validateDocument(doc);
  }
  vscode.window.showInformationMessage(`CiteCheck: Validated ${bibFiles.length} .bib file(s).`);
}

/**
 * Validate an entire document
 */
async function validateDocument(document) {
  const text = document.getText();
  const citations = parseBib(text);

  if (citations.length === 0) {
    diagnosticCollection.set(document.uri, []);
    updateStatusBar(0, 0, 0);
    return;
  }

  updateStatusBar(-1, -1, -1); // loading state
  await validateCitationsWithProgress(citations, document.uri);
}

/**
 * Validate citations and update diagnostics
 */
async function validateCitationsWithProgress(citations, uri) {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID);
  const rateLimit = config.get('rateLimitMs') || 120;
  const threshold = config.get('confidenceThreshold') || 80;

  const diagnostics = [];
  let verified = 0, notFound = 0, partial = 0;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'CiteCheck: Validating citations…',
    cancellable: true
  }, async (progress, token) => {
    for (let i = 0; i < citations.length; i++) {
      if (token.isCancellationRequested) break;

      const citation = citations[i];
      progress.report({
        message: `(${i + 1}/${citations.length}) ${citation.title?.substring(0, 40) || citation.key || ''}`,
        increment: (1 / citations.length) * 100
      });

      const result = await validateOne(citation);
      validationResults.set(citation.key || citation.title, result);

      if (result.status === 'verified') {
        verified++;
      } else if (result.status === 'not_found') {
        notFound++;
        // Add error diagnostic
        if (citation._range) {
          diagnostics.push(new vscode.Diagnostic(
            citation._range,
            `CiteCheck: Citation not found in CrossRef. ${result.note}`,
            vscode.DiagnosticSeverity.Error
          ));
        }
      } else if (result.status === 'partial') {
        partial++;
        // Add warning diagnostic
        if (citation._range) {
          diagnostics.push(new vscode.Diagnostic(
            citation._range,
            `CiteCheck: Partial match only (${result.confidence}%). ${result.note}`,
            vscode.DiagnosticSeverity.Warning
          ));
        }
      }

      if (i < citations.length - 1) {
        await sleep(rateLimit);
      }
    }
  });

  diagnosticCollection.set(uri, diagnostics);
  updateStatusBar(verified, partial, notFound);
  updateDecorations(uri, citations);
}

/**
 * BibTeX parser — extracts entries with their document ranges
 */
function parseBib(text) {
  const entries = [];
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*?)(?=\n\s*@|\s*$)/gs;
  let m;

  while ((m = entryRegex.exec(text)) !== null) {
    const type = m[1].toLowerCase();
    if (['string', 'preamble', 'comment'].includes(type)) continue;

    const key = m[2].trim();
    const body = m[3];
    const fields = {};

    const fReg = /(\w+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|(\d+))/g;
    let f;
    while ((f = fReg.exec(body)) !== null) {
      const fname = f[1].toLowerCase();
      const fval = (f[2] ?? f[3] ?? f[4] ?? '').trim();
      fields[fname] = fval;
    }

    if (Object.keys(fields).length > 0) {
      // Calculate range for diagnostics
      const startOffset = m.index;
      const endOffset = m.index + m[0].length;
      const startPos = offsetToPosition(text, startOffset);
      const endPos = offsetToPosition(text, endOffset);

      entries.push({
        type, key, ...fields,
        _range: new vscode.Range(startPos, endPos),
        _format: 'bib'
      });
    }
  }

  return entries;
}

function offsetToPosition(text, offset) {
  const lines = text.substring(0, offset).split('\n');
  return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * CrossRef API validation
 */
async function validateOne(citation) {
  const config = vscode.workspace.getConfiguration(EXTENSION_ID);
  const email = config.get('crossrefEmail') || 'contact@kavihai.com';

  const headers = {
    'Accept': 'application/json',
    'User-Agent': `CiteCheck-VSCode/1.0 (https://citecheck.kavihai.com; mailto:${email})`
  };

  // 1. DOI lookup
  if (citation.doi) {
    const doi = citation.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
    try {
      const res = await fetch(`${CROSSREF_BASE}/works/${encodeURIComponent(doi)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        return scoreMatch(citation, data.message, 'doi');
      } else if (res.status === 404) {
        return { status: 'not_found', confidence: 0, note: 'DOI not found in CrossRef.' };
      }
    } catch (_) {}
  }

  // 2. Title search
  if (citation.title && citation.title.length > 10) {
    const q = encodeURIComponent((citation.title + ' ' + (citation.author || '')).substring(0, 200));
    try {
      const res = await fetch(
        `${CROSSREF_BASE}/works?query.bibliographic=${q}&rows=1&select=title,author,published,DOI`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const items = data.message?.items || [];
        if (items.length > 0) return scoreMatch(citation, items[0], 'search');
        return { status: 'not_found', confidence: 0, note: 'No CrossRef match. Possible AI-hallucination.' };
      }
    } catch (_) {}
  }

  return { status: 'unknown', confidence: -1, note: 'Insufficient metadata to validate.' };
}

function scoreMatch(citation, work, method) {
  const crTitle = (work.title?.[0] || '').toLowerCase();
  const localTitle = (citation.title || '').toLowerCase();
  const titleSim = stringSimilarity(crTitle, localTitle);
  const crYear = work.published?.['date-parts']?.[0]?.[0];
  const localYear = parseInt(citation.year, 10);
  const yearOk = !localYear || !crYear || Math.abs(crYear - localYear) <= 1;
  const foundDoi = work.DOI || null;

  let confidence = Math.round(titleSim * 100);
  if (method === 'doi') confidence = Math.max(confidence, 95);
  if (!yearOk) confidence = Math.max(0, confidence - 15);

  let status, note;
  if (confidence >= 80) {
    status = 'verified';
    note = 'Matched in CrossRef' + (foundDoi ? ` — DOI: ${foundDoi}` : '');
  } else if (confidence >= 40) {
    status = 'partial';
    note = `Partial match (${confidence}%). ${!yearOk ? `Year mismatch: CrossRef has ${crYear}.` : 'Verify title accuracy.'}`;
  } else {
    status = 'not_found';
    note = `Low similarity (${confidence}%). Likely AI-hallucinated or misquoted.`;
  }

  return { status, confidence, note, foundDoi, crYear };
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const wordsA = new Set(norm(a).split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(norm(b).split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const inter = [...wordsA].filter(w => wordsB.has(w)).length;
  return inter / Math.max(wordsA.size, wordsB.size);
}

/**
 * Hover provider — shows validation status on hover over @key
 */
function provideHover(document, position) {
  const wordRange = document.getWordRangeAtPosition(position, /@\w+\s*\{[^,\s}]+/);
  if (!wordRange) return null;

  const word = document.getText(wordRange);
  const keyMatch = word.match(/@\w+\s*\{(\S+)/);
  if (!keyMatch) return null;

  const key = keyMatch[1];
  const result = validationResults.get(key);

  if (!result) {
    return new vscode.Hover(new vscode.MarkdownString(`**CiteCheck** \`${key}\`: *Not yet validated*`));
  }

  const icon = { verified: '✅', not_found: '❌', partial: '⚠️', unknown: '❓' }[result.status] || '❓';
  const label = { verified: 'Verified', not_found: 'Not Found', partial: 'Partial Match', unknown: 'Unknown' }[result.status];
  const confStr = result.confidence >= 0 ? ` (${result.confidence}% confidence)` : '';

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**CiteCheck** ${icon} **${label}**${confStr}\n\n`);
  md.appendMarkdown(`${result.note}\n\n`);
  if (result.foundDoi) {
    md.appendMarkdown(`[View on CrossRef](https://doi.org/${result.foundDoi})`);
  }

  return new vscode.Hover(md, wordRange);
}

/**
 * Update inline decorations
 */
function updateDecorations(uri, citations) {
  const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString());
  for (const editor of editors) {
    const decorations = [];
    for (const citation of citations) {
      const result = validationResults.get(citation.key || citation.title);
      if (!result || !citation._range) continue;

      const icon = { verified: ' ✓', not_found: ' ✗', partial: ' ⚠', unknown: ' ?' }[result.status] || '';
      const color = { verified: '#00aa00', not_found: '#cc0000', partial: '#aa7700', unknown: '#888888' }[result.status] || '#888888';

      decorations.push({
        range: new vscode.Range(citation._range.start.line, 0, citation._range.start.line, 0),
        renderOptions: {
          after: {
            contentText: icon + (result.confidence >= 0 ? ` ${result.confidence}%` : ''),
            color: color,
            fontFamily: 'monospace',
            fontSize: '11px'
          }
        }
      });
    }
    editor.setDecorations(decorationType, decorations);
  }
}

/**
 * Update status bar
 */
function updateStatusBar(verified, partial, notFound) {
  if (verified === -1) {
    statusBarItem.text = '$(sync~spin) CiteCheck…';
    statusBarItem.tooltip = 'CiteCheck: Validating…';
    return;
  }
  const total = verified + partial + notFound;
  if (notFound > 0) {
    statusBarItem.text = `$(error) CiteCheck: ${notFound} fake`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (partial > 0) {
    statusBarItem.text = `$(warning) CiteCheck: ${partial} partial`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.text = `$(check-all) CiteCheck: ${verified} OK`;
    statusBarItem.backgroundColor = undefined;
  }
  statusBarItem.tooltip = `CiteCheck: ${verified} verified, ${partial} partial, ${notFound} not found (${total} total)`;
}

/**
 * Webview panel for full results
 */
function showResultsPanel(context) {
  const panel = vscode.window.createWebviewPanel(
    'citecheckResults',
    'CiteCheck Results',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const results = [...validationResults.entries()];
  const verified = results.filter(([, r]) => r.status === 'verified').length;
  const notFound = results.filter(([, r]) => r.status === 'not_found').length;
  const partial  = results.filter(([, r]) => r.status === 'partial').length;

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Courier New', monospace; background: #fff; color: #000; padding: 16px; font-size: 13px; }
  h1 { font-size: 1.2rem; border-bottom: 2px solid #000; padding-bottom: 6px; }
  .summary { display: flex; gap: 16px; margin: 12px 0; }
  .card { border: 2px solid #000; padding: 8px 14px; text-align: center; }
  .card .num { font-size: 1.8rem; font-weight: 900; font-family: 'VT323', monospace; }
  .verified { border-left: 4px solid #000; background: #f8f8f8; padding: 8px; margin: 4px 0; }
  .not_found { border-left: 4px solid #808080; background: #f0f0f0; padding: 8px; margin: 4px 0; }
  .partial   { border-left: 4px dashed #333; background: #f8f8f8; padding: 8px; margin: 4px 0; }
  .key { font-weight: 700; font-size: 0.9rem; }
  .note { font-size: 0.75rem; color: #555; margin-top: 3px; }
  .conf { font-size: 0.7rem; background: #e0e0e0; padding: 1px 4px; border: 1px solid #aaa; }
</style>
</head>
<body>
<h1>CiteCheck — Validation Results</h1>
<div class="summary">
  <div class="card"><div class="num">${results.length}</div><div>Total</div></div>
  <div class="card"><div class="num">${verified}</div><div>[OK] Verified</div></div>
  <div class="card"><div class="num">${partial}</div><div>[!!] Partial</div></div>
  <div class="card"><div class="num">${notFound}</div><div>[XX] Not Found</div></div>
</div>
<hr>
${results.map(([key, r]) => `
  <div class="${r.status}">
    <div class="key">${key} <span class="conf">${r.confidence >= 0 ? r.confidence + '%' : '?'}%</span></div>
    <div class="note">${r.note}</div>
    ${r.foundDoi ? `<div class="note"><a href="https://doi.org/${r.foundDoi}">doi.org/${r.foundDoi}</a></div>` : ''}
  </div>
`).join('')}
</body>
</html>`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function deactivate() {
  diagnosticCollection?.clear();
  diagnosticCollection?.dispose();
  statusBarItem?.dispose();
}

module.exports = { activate, deactivate };
