/**
 * BibSure for Zotero — Bootstrap Script
 * Zotero 6/7 Plugin Entry Point
 *
 * Registers a menu item under Tools → BibSure
 * and validates selected library items against CrossRef API.
 */

'use strict';

// ── Plugin lifecycle hooks (Zotero 7 bootstrap API) ──

function install(data, reason) {
  Zotero.debug('[BibSure] Plugin installed');
}

function uninstall(data, reason) {
  Zotero.debug('[BibSure] Plugin uninstalled');
}

async function startup(data, reason) {
  await Zotero.initializationPromise;
  BibSure.init();
  Zotero.debug('[BibSure] Plugin started');
}

function shutdown(data, reason) {
  BibSure.uninit();
  Zotero.debug('[BibSure] Plugin shutdown');
}

// ── BibSure Namespace ──

var BibSure = {

  CROSSREF_BASE: 'https://api.crossref.org',
  PLUGIN_ID: 'bibsure@kavihai.com',
  MENU_ID: 'bibsure-menu',

  // ── Initialize plugin ──
  init() {
    this._addMenuItems();
    this._registerObservers();
    Zotero.debug('[BibSure] Initialized');
  },

  uninit() {
    this._removeMenuItems();
    Zotero.debug('[BibSure] Uninitialized');
  },

  // ── Add Tools menu entries ──
  _addMenuItems() {
    const win = Zotero.getMainWindow();
    if (!win) return;

    const doc = win.document;
    const toolsMenu = doc.getElementById('menu_ToolsPopup');
    if (!toolsMenu) return;

    // Separator
    const sep = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuseparator');
    sep.id = 'bibsure-sep';
    toolsMenu.appendChild(sep);

    // Main validate menu item
    const menuItem = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
    menuItem.id = this.MENU_ID;
    menuItem.setAttribute('label', 'BibSure — Validate Selected Citations');
    menuItem.setAttribute('accesskey', 'C');
    menuItem.addEventListener('command', () => this.validateSelected());
    toolsMenu.appendChild(menuItem);

    // Validate all in collection
    const menuItemAll = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
    menuItemAll.id = this.MENU_ID + '-all';
    menuItemAll.setAttribute('label', 'BibSure — Validate Entire Collection');
    menuItemAll.addEventListener('command', () => this.validateAll());
    toolsMenu.appendChild(menuItemAll);

    Zotero.debug('[BibSure] Menu items added');
  },

  _removeMenuItems() {
    const win = Zotero.getMainWindow();
    if (!win) return;
    const doc = win.document;
    for (const id of [this.MENU_ID, this.MENU_ID + '-all', 'bibsure-sep']) {
      const el = doc.getElementById(id);
      if (el) el.remove();
    }
  },

  // ── Register right-click context observer ──
  _registerObservers() {
    // Observe item selection for contextual menu
    this._observerID = Zotero.Notifier.registerObserver(
      { notify: (event, type, ids) => this._onNotify(event, type, ids) },
      ['item'],
      'bibsure'
    );
  },

  _onNotify(event, type, ids) {
    // Update UI when items change
    if (event === 'modify') {
      Zotero.debug('[BibSure] Items modified: ' + ids.join(', '));
    }
  },

  // ── Validate selected items ──
  async validateSelected() {
    const items = Zotero.getActiveZoteroPane().getSelectedItems();

    if (!items || items.length === 0) {
      this._showDialog('BibSure', 'Please select one or more library items to validate.', 'warning');
      return;
    }

    const results = await this._validateItems(items);
    this._showResultsDialog(results);
  },

  // ── Validate all items in current collection ──
  async validateAll() {
    const collection = Zotero.getActiveZoteroPane().getSelectedCollection();
    let items;

    if (collection) {
      items = collection.getChildItems();
    } else {
      items = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
    }

    items = items.filter(item => item.isRegularItem());

    if (!items || items.length === 0) {
      this._showDialog('BibSure', 'No items found in the current collection.', 'warning');
      return;
    }

    if (items.length > 50) {
      const confirm = Services.prompt.confirm(
        null,
        'BibSure',
        `Validate all ${items.length} items? This may take a few minutes.`
      );
      if (!confirm) return;
    }

    const results = await this._validateItems(items);
    this._showResultsDialog(results);
  },

  // ── Core validation logic ──
  async _validateItems(items) {
    const results = [];
    const progressWin = new Zotero.ProgressWindow({ closeOnClick: false });
    progressWin.changeHeadline('BibSure — Validating Citations');
    progressWin.show();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.isRegularItem()) continue;

      const title = item.getField('title');
      const doi = item.getField('DOI');
      const year = item.getField('year') || item.getField('date');
      const authors = item.getCreators()
        .filter(c => c.creatorType === 'author')
        .map(c => c.lastName + (c.firstName ? ', ' + c.firstName[0] : ''))
        .join('; ');

      progressWin.changeHeadline(`BibSure — Checking ${i + 1}/${items.length}: ${title?.substring(0, 40)}`);

      const result = await this._validateOne({ title, doi, year, author: authors });
      results.push({ item, title, doi, year, authors, ...result });

      // Update Zotero item tags based on result
      await this._tagItem(item, result.status);

      // Rate limit — be polite to CrossRef
      if (i < items.length - 1) {
        await this._sleep(150);
      }
    }

    progressWin.close();
    return results;
  },

  // ── Tag item in Zotero library ──
  async _tagItem(item, status) {
    // Remove old BibSure tags first
    const oldTags = ['BibSure: Verified', 'BibSure: Not Found', 'BibSure: Partial', 'BibSure: Unknown'];
    for (const tag of oldTags) {
      item.removeTag(tag);
    }

    const tagMap = {
      'verified': 'BibSure: Verified',
      'not_found': 'BibSure: Not Found',
      'partial': 'BibSure: Partial Match',
      'unknown': 'BibSure: Unknown'
    };

    if (tagMap[status]) {
      item.addTag(tagMap[status], 1); // Tag type 1 = automatic tag
      await item.saveTx();
    }
  },

  // ── CrossRef lookup ──
  async _validateOne(citation) {
    // 1. Direct DOI lookup
    if (citation.doi && citation.doi.trim()) {
      const doi = citation.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim();
      try {
        const response = await fetch(`${this.CROSSREF_BASE}/works/${encodeURIComponent(doi)}`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'BibSure/1.0 (https://bibsure.kavihai.com; mailto:contact@kavihai.com)' }
        });
        if (response.ok) {
          const data = await response.json();
          return this._scoreMatch(citation, data.message, 'doi');
        } else if (response.status === 404) {
          return { status: 'not_found', confidence: 0, note: 'DOI not found in CrossRef database.' };
        }
      } catch (e) {
        Zotero.debug('[BibSure] DOI lookup error: ' + e.message);
      }
    }

    // 2. Title + author search
    if (citation.title && citation.title.length > 10) {
      const query = encodeURIComponent((citation.title + ' ' + (citation.author || '')).substring(0, 200));
      try {
        const response = await fetch(
          `${this.CROSSREF_BASE}/works?query.bibliographic=${query}&rows=1&select=title,author,published,DOI,container-title`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'BibSure/1.0 (https://bibsure.kavihai.com; mailto:contact@kavihai.com)' } }
        );
        if (response.ok) {
          const data = await response.json();
          const items = data.message?.items || [];
          if (items.length > 0) return this._scoreMatch(citation, items[0], 'search');
          return { status: 'not_found', confidence: 0, note: 'No match found in CrossRef. Possible AI-hallucination.' };
        }
      } catch (e) {
        Zotero.debug('[BibSure] Search error: ' + e.message);
      }
    }

    return { status: 'unknown', confidence: -1, note: 'Insufficient metadata to validate.' };
  },

  // ── Score match ──
  _scoreMatch(citation, work, method) {
    const crTitle = (work.title?.[0] || '').toLowerCase();
    const localTitle = (citation.title || '').toLowerCase();
    const titleSim = this._stringSimilarity(crTitle, localTitle);

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
      note = 'Matched in CrossRef' + (foundDoi ? ' — DOI: ' + foundDoi : '');
    } else if (confidence >= 40) {
      status = 'partial';
      note = `Partial match (${confidence}%). Check title/year.` + (!yearOk ? ` Year mismatch: CrossRef has ${crYear}.` : '');
    } else {
      status = 'not_found';
      note = `Low similarity (${confidence}%). Likely AI-hallucinated or misquoted.`;
    }

    return { status, confidence, note, foundDoi, crYear };
  },

  // ── String similarity ──
  _stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const wordsA = new Set(norm(a).split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(norm(b).split(/\s+/).filter(w => w.length > 3));
    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const inter = [...wordsA].filter(w => wordsB.has(w)).length;
    return inter / Math.max(wordsA.size, wordsB.size);
  },

  // ── Show results dialog ──
  _showResultsDialog(results) {
    const verified = results.filter(r => r.status === 'verified').length;
    const notFound = results.filter(r => r.status === 'not_found').length;
    const partial  = results.filter(r => r.status === 'partial').length;
    const total    = results.length;

    let msg = `BibSure Results\n`;
    msg += `${'='.repeat(40)}\n`;
    msg += `Total checked: ${total}\n`;
    msg += `[OK] Verified: ${verified}\n`;
    msg += `[!!] Partial:  ${partial}\n`;
    msg += `[XX] Not Found: ${notFound}\n`;
    msg += `\nItems have been tagged in your Zotero library.\n`;
    msg += `\nNot-found citations (first 5):\n`;

    const notFoundItems = results.filter(r => r.status === 'not_found').slice(0, 5);
    for (const r of notFoundItems) {
      msg += `  • ${r.title?.substring(0, 60) || 'Unknown'}\n`;
      msg += `    ${r.note}\n`;
    }

    this._showDialog('BibSure — Validation Complete', msg, 'info');
  },

  _showDialog(title, message, type) {
    const win = Zotero.getMainWindow();
    Services.prompt.alert(win, title, message);
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
