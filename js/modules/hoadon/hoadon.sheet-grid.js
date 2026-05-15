// hoadon.sheet-grid.js — Excel-like grid engine: selection, copy/paste range, autocomplete
// Load order: sau hoadon.quick-entry.js, trước hoadon.detail-entry.js

(function() {
'use strict';

// ══════════════════════════════════════════════════════════════
// SECTION 1 — Utilities
// ══════════════════════════════════════════════════════════════

function _normVi(s) {
  if (!s) return '';
  try {
    // Dùng typeof _normViStr nếu core đã expose
    if (typeof _normViStr === 'function') return _normViStr(String(s));
    return String(s).normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D') // đ Đ
      .toLowerCase().trim();
  } catch(e) { return String(s).toLowerCase().trim(); }
}

function _escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _parseMoney(v) {
  if (typeof parseMoney === 'function') return parseMoney(v);
  const s = String(v||'').trim().replace(/\s/g,'');
  const n = parseFloat(s.replace(/[.,]/g, m => s.split(m).length > 2 ? '' : '.'));
  return isNaN(n) ? 0 : Math.round(n);
}

function _numFmt(n) {
  return typeof numFmt === 'function' ? numFmt(n) : Number(n).toLocaleString('vi-VN');
}

function _getField(el) {
  return el.dataset.f || el.name || '';
}

function _getColConfig(config, el) {
  const f = _getField(el);
  return (config.columns || []).find(c => c.field === f) || null;
}

// ── Validation helpers (exposed globally for quick-entry & detail-entry) ──

function markCellInvalid(el, message) {
  if (!el) return;
  el.classList.add('sheet-cell-invalid');
  if (message) el.title = message;
}

function clearCellInvalid(el) {
  if (!el) return;
  el.classList.remove('sheet-cell-invalid');
  el.title = '';
}

function validateCategoryCell(el, options, optConfig) {
  if (!el) return { ok: false, value: '', message: 'Không tìm thấy ô' };
  const val = (el.value || '').trim();
  const required = optConfig && optConfig.required;
  const label = (optConfig && optConfig.label) || 'Giá trị';

  if (!val) {
    if (required) {
      markCellInvalid(el, label + ' là bắt buộc');
      return { ok: false, value: '', message: label + ' là bắt buộc' };
    }
    clearCellInvalid(el);
    return { ok: true, value: '', message: '' };
  }

  const normVal = _normVi(val);
  const match = (options || []).find(item => {
    const name = typeof item === 'string' ? item : (item && item.name) || '';
    return _normVi(name) === normVal;
  });

  if (match) {
    const canonicalName = typeof match === 'string' ? match : match.name;
    if (el.tagName === 'INPUT' && el.value !== canonicalName) el.value = canonicalName;
    if (match && typeof match === 'object' && match.id !== undefined && 'pid' in el.dataset) {
      el.dataset.pid = match.id || '';
    }
    clearCellInvalid(el);
    return { ok: true, value: canonicalName, message: '' };
  }

  const msg = label + ' không hợp lệ: "' + val + '"';
  markCellInvalid(el, msg);
  return { ok: false, value: val, message: msg };
}

function _getCellValue(el, col) {
  if (!el) return '';
  if (el.tagName === 'SELECT') return el.value;
  const type = (col && col.type) || 'text';
  if (type === 'money') return el.dataset.raw || '';
  return el.value;
}

function _setCellValue(el, rawVal, col) {
  if (!el) return;
  const value = String(rawVal || '');

  if (el.tagName === 'SELECT') {
    const target = value.trim();
    if (!target) { el.value = ''; return; }
    for (const opt of el.options) {
      if ((opt.value||'').trim().toLowerCase() === target.toLowerCase()) {
        el.value = opt.value; return;
      }
    }
    const o = document.createElement('option');
    o.value = target; o.textContent = target + ' (*)';
    el.appendChild(o); el.value = target;
    return;
  }

  const type = (col && col.type) || 'text';

  if (type === 'money') {
    const raw = _parseMoney(value);
    el.dataset.raw = raw || '';
    el.value = raw ? _numFmt(raw) : '';
    return;
  }
  if (type === 'discount') {
    const v = value.trim();
    if (v.endsWith('%')) { el.value = v; return; }
    const n = _parseMoney(v);
    el.value = n ? _numFmt(n) : v;
    return;
  }
  if (type === 'number') {
    const n = parseFloat(value.replace(/,/g, '.'));
    el.value = isNaN(n) ? '' : String(n);
    return;
  }
  if (type === 'autocomplete' || type === 'project-autocomplete') {
    el.value = value;
    // Try to canonicalize and set data-pid
    if (type === 'project-autocomplete' && value.trim()) {
      const src = typeof col.source === 'function' ? col.source() : [];
      const match = src.find(item => _normVi(item.name) === _normVi(value));
      if (match) { el.value = match.name; el.dataset.pid = match.id || ''; }
    }
    if (type === 'autocomplete' && value.trim() && typeof col.source === 'function') {
      const src = col.source();
      const match = src.find(s => _normVi(s) === _normVi(value));
      if (match) el.value = match;
    }
    return;
  }
  el.value = value;
}

function _triggerChange(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function _clearCell(el, col) {
  if (!el) return;
  if (el.tagName === 'SELECT') { el.value = ''; return; }
  const type = (col && col.type) || 'text';
  if (type === 'money') { el.value = ''; el.dataset.raw = ''; return; }
  if (type === 'project-autocomplete') { el.value = ''; el.dataset.pid = ''; return; }
  el.value = '';
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — Grid Registry & State
// ══════════════════════════════════════════════════════════════

const _grids = {};  // name → config
const _states = {}; // name → selection state

function _initState() {
  return {
    anchor: { row: -1, col: -1 },
    focus:  { row: -1, col: -1 },
    range:  { r1: -1, c1: -1, r2: -1, c2: -1 },
    isDragging: false,
    dragMode: 'cell' // 'cell' | 'row' | 'col'
  };
}

function _getState(name) {
  if (!_states[name]) _states[name] = _initState();
  return _states[name];
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — Row / Cell Accessors
// ══════════════════════════════════════════════════════════════

function _getRows(config) {
  const tbody = document.querySelector(config.tbody);
  if (!tbody) return [];
  return [...tbody.querySelectorAll(config.rowSelector || 'tr')];
}

function _getEditableCells(tr, config) {
  return [...tr.querySelectorAll(config.cellSelector || 'input')]
    .filter(el => !el.disabled && el.type !== 'hidden' && !el.closest('.del-btn'));
}

function _getCellAt(config, r, c) {
  const rows = _getRows(config);
  if (r < 0 || r >= rows.length) return null;
  const cells = _getEditableCells(rows[r], config);
  if (c < 0 || c >= cells.length) return null;
  return cells[c];
}

function _getPosFromEl(config, el) {
  if (!el) return null;
  const rows = _getRows(config);
  for (let r = 0; r < rows.length; r++) {
    const cells = _getEditableCells(rows[r], config);
    const c = cells.indexOf(el);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — Selection State & Rendering
// ══════════════════════════════════════════════════════════════

function _clearSelectionUI(config) {
  const tbody = document.querySelector(config.tbody);
  if (!tbody) return;
  tbody.querySelectorAll('.sheet-active, .sheet-selected').forEach(el => {
    el.classList.remove('sheet-active', 'sheet-selected', 'sheet-range-edge');
  });
}

function _renderSelection(config) {
  _clearSelectionUI(config);
  const state = _getState(config.name);
  const { r1, c1, r2, c2 } = state.range;
  if (r1 < 0) return;

  const rows = _getRows(config);
  for (let r = Math.max(0, r1); r <= Math.min(rows.length - 1, r2); r++) {
    const cells = _getEditableCells(rows[r], config);
    for (let c = Math.max(0, c1); c <= Math.min(cells.length - 1, c2); c++) {
      const td = cells[c].closest('td');
      if (td) td.classList.add('sheet-selected');
    }
  }

  // Active cell (focus)
  const { row: fr, col: fc } = state.focus;
  if (fr >= 0 && fr < rows.length) {
    const focusCells = _getEditableCells(rows[fr], config);
    if (fc >= 0 && fc < focusCells.length) {
      const td = focusCells[fc].closest('td');
      if (td) { td.classList.remove('sheet-selected'); td.classList.add('sheet-active'); }
    }
  }
}

function _setActiveCell(config, row, col, isAnchor) {
  const state = _getState(config.name);
  state.focus = { row, col };
  if (isAnchor !== false) {
    state.anchor = { row, col };
    state.range = { r1: row, c1: col, r2: row, c2: col };
  } else {
    const ar = state.anchor.row >= 0 ? state.anchor.row : row;
    const ac = state.anchor.col >= 0 ? state.anchor.col : col;
    state.range = {
      r1: Math.min(ar, row), c1: Math.min(ac, col),
      r2: Math.max(ar, row), c2: Math.max(ac, col)
    };
  }
  _renderSelection(config);
}

function _extendSelectionTo(config, row, col) {
  const state = _getState(config.name);
  state.focus = { row, col };
  const ar = state.anchor.row >= 0 ? state.anchor.row : row;
  const ac = state.anchor.col >= 0 ? state.anchor.col : col;
  state.range = {
    r1: Math.min(ar, row), c1: Math.min(ac, col),
    r2: Math.max(ar, row), c2: Math.max(ac, col)
  };
  _renderSelection(config);
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — Clipboard: Copy / Paste / Delete Range
// ══════════════════════════════════════════════════════════════

function _getSelectedMatrix(config) {
  const state = _getState(config.name);
  const { r1, c1, r2, c2 } = state.range;
  if (r1 < 0) return null;
  const rows = _getRows(config);
  const matrix = [];
  for (let r = r1; r <= Math.min(r2, rows.length - 1); r++) {
    const cells = _getEditableCells(rows[r], config);
    const row = [];
    for (let c = c1; c <= Math.min(c2, cells.length - 1); c++) {
      const el = cells[c];
      const col = _getColConfig(config, el);
      // For copy: use display value (user-friendly), but money → raw number
      const type = col ? col.type : 'text';
      if (type === 'money') {
        const raw = parseInt(el.dataset.raw || '0', 10) || 0;
        row.push(raw ? String(raw) : '');
      } else {
        row.push(el.value || '');
      }
    }
    matrix.push(row);
  }
  return matrix;
}

function _copyRangeToClipboard(config, e) {
  const matrix = _getSelectedMatrix(config);
  if (!matrix) return;
  const tsv = matrix.map(row => row.join('\t')).join('\r\n');
  if (e && e.clipboardData) {
    e.preventDefault();
    e.clipboardData.setData('text/plain', tsv);
  } else {
    navigator.clipboard.writeText(tsv).catch(() => {});
  }
}

function _pasteMatrix(config, matrix, startRow, startCol) {
  const tbody = document.querySelector(config.tbody);
  if (!tbody) return;

  const rows = _getRows(config);
  const needed = startRow + matrix.length - rows.length;
  for (let i = 0; i < needed; i++) {
    if (typeof config.addRow === 'function') config.addRow();
  }

  const currentRows = _getRows(config);
  let lastEl = null;

  for (let r = 0; r < matrix.length; r++) {
    const ri = startRow + r;
    if (ri >= currentRows.length) break;
    const cells = _getEditableCells(currentRows[ri], config);

    for (let c = 0; c < matrix[r].length; c++) {
      const ci = startCol + c;
      if (ci >= cells.length) break;
      const el = cells[ci];
      const col = _getColConfig(config, el);
      if (col && col.readonly) continue;
      _setCellValue(el, matrix[r][c], col);
      _triggerChange(el);
      lastEl = el;
      el.closest('td')?.classList.add('sheet-paste-flash');
      setTimeout(() => el.closest('td')?.classList.remove('sheet-paste-flash'), 500);
    }
  }

  if (typeof config.afterChange === 'function') config.afterChange();
  if (lastEl) lastEl.focus();
}

function _clearSelectedRange(config) {
  const state = _getState(config.name);
  const { r1, c1, r2, c2 } = state.range;
  if (r1 < 0) return;
  const rows = _getRows(config);
  for (let r = r1; r <= Math.min(r2, rows.length - 1); r++) {
    const cells = _getEditableCells(rows[r], config);
    for (let c = c1; c <= Math.min(c2, cells.length - 1); c++) {
      const el = cells[c];
      const col = _getColConfig(config, el);
      if (col && col.readonly) continue;
      _clearCell(el, col);
      _triggerChange(el);
    }
  }
  if (typeof config.afterChange === 'function') config.afterChange();
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — Keyboard Navigation
// ══════════════════════════════════════════════════════════════

function _getAboveValue(el, config) {
  const pos = _getPosFromEl(config, el);
  if (!pos || pos.row <= 0) return '';
  const rows = _getRows(config);
  const aboveCells = _getEditableCells(rows[pos.row - 1], config);
  const aboveEl = aboveCells[pos.col];
  if (!aboveEl) return '';
  const col = _getColConfig(config, aboveEl);
  return _getCellValue(aboveEl, col);
}

function _navigateTo(config, rowIdx, colIdx, focus) {
  const rows = _getRows(config);
  if (rowIdx < 0 || rowIdx >= rows.length) return;
  const cells = _getEditableCells(rows[rowIdx], config);
  if (!cells.length) return;
  const ci = Math.max(0, Math.min(colIdx, cells.length - 1));
  const target = cells[ci];
  if (!target) return;
  _setActiveCell(config, rowIdx, ci, true);
  target.focus();
  if (target.tagName === 'INPUT') { try { target.select(); } catch(e){} }
}

function _onKeydown(e, config) {
  const el = e.target;
  const pos = _getPosFromEl(config, el);
  if (!pos) return;
  const { row, col } = pos;

  // Autocomplete intercept first
  if (_acIsOpen() && _acState.el === el) {
    if (e.key === 'ArrowDown') { e.preventDefault(); _acMoveActive(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); _acMoveActive(-1); return; }
    if (e.key === 'Escape')    { e.preventDefault(); _hideAc(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_acState.activeIdx >= 0) { _acConfirm(); }
      else { _hideAc(); }
      // Fall through to Enter navigation below after hiding
      _onEnterNav(config, row, col);
      return;
    }
    if (e.key === 'Tab') {
      _hideAc();
      // Fall through to Tab below
    }
  }

  if (e.key === 'Enter' && !_acIsOpen()) {
    e.preventDefault();
    _onEnterNav(config, row, col);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const rows = _getRows(config);
    const cells = _getEditableCells(rows[row], config);
    if (e.shiftKey) {
      if (col > 0) _navigateTo(config, row, col - 1);
      else if (row > 0) {
        const prev = _getEditableCells(_getRows(config)[row - 1], config);
        _navigateTo(config, row - 1, prev.length - 1);
      }
    } else {
      if (col < cells.length - 1) _navigateTo(config, row, col + 1);
      else {
        const rows2 = _getRows(config);
        if (row < rows2.length - 1) _navigateTo(config, row + 1, 0);
        else {
          if (typeof config.addRow === 'function') config.addRow();
          _navigateTo(config, _getRows(config).length - 1, 0);
        }
      }
    }
    return;
  }

  if (e.key === 'ArrowDown') {
    const rows = _getRows(config);
    if (row < rows.length - 1) { e.preventDefault(); _navigateTo(config, row + 1, col); }
    return;
  }
  if (e.key === 'ArrowUp') {
    if (row > 0) { e.preventDefault(); _navigateTo(config, row - 1, col); }
    return;
  }
  if (e.key === 'ArrowRight') {
    if (el.tagName === 'SELECT') { e.preventDefault(); _navigateTo(config, row, col + 1); return; }
    if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
      e.preventDefault(); _navigateTo(config, row, col + 1);
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    if (el.tagName === 'SELECT') { e.preventDefault(); _navigateTo(config, row, col - 1); return; }
    if (el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault(); _navigateTo(config, row, col - 1);
    }
    return;
  }

  if (e.key === 'Delete') {
    e.preventDefault();
    const state = _getState(config.name);
    const { r1, c1, r2, c2 } = state.range;
    if (r1 >= 0 && (r1 !== r2 || c1 !== c2)) {
      _clearSelectedRange(config);
    } else {
      const colCfg = _getColConfig(config, el);
      _clearCell(el, colCfg);
      _triggerChange(el);
      if (typeof config.afterChange === 'function') config.afterChange();
    }
    return;
  }

  // Ctrl+C — copy range
  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
    // handled via copy event
    return;
  }

  // Ctrl+V — paste
  if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
    // handled via paste event
    return;
  }

  // Ctrl+D — copy from above
  if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const aboveVal = _getAboveValue(el, config);
    if (aboveVal !== '') {
      const colCfg = _getColConfig(config, el);
      _setCellValue(el, aboveVal, colCfg);
      _triggerChange(el);
      if (typeof config.afterChange === 'function') config.afterChange();
    }
    return;
  }

  // Ctrl+A — select all
  if (e.key === 'a' && (e.ctrlKey || e.metaKey) && el.tagName !== 'INPUT') {
    e.preventDefault();
    const rows = _getRows(config);
    if (!rows.length) return;
    const state = _getState(config.name);
    const maxC = _getEditableCells(rows[0], config).length - 1;
    state.anchor = { row: 0, col: 0 };
    state.focus  = { row: rows.length - 1, col: maxC };
    state.range  = { r1: 0, c1: 0, r2: rows.length - 1, c2: maxC };
    _renderSelection(config);
    return;
  }
}

function _onEnterNav(config, row, col) {
  const rows = _getRows(config);
  if (row < rows.length - 1) {
    _navigateTo(config, row + 1, col);
  } else {
    if (typeof config.addRow === 'function') config.addRow();
    _navigateTo(config, _getRows(config).length - 1, col);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — Mouse Selection
// ══════════════════════════════════════════════════════════════

function _handleMousedown(e, config) {
  // Row header click
  const rowNumTd = e.target.closest('td.row-num');
  if (rowNumTd) {
    e.preventDefault();
    const tr = rowNumTd.closest('tr');
    const rows = _getRows(config);
    const r = rows.indexOf(tr);
    if (r < 0) return;
    const maxC = _getEditableCells(tr, config).length - 1;
    const state = _getState(config.name);
    state.anchor = { row: r, col: 0 };
    state.focus  = { row: r, col: maxC };
    state.range  = { r1: r, c1: 0, r2: r, c2: maxC };
    state.isDragging = true; state.dragMode = 'row';
    _renderSelection(config);

    const onMove = (me) => {
      const el2 = document.elementFromPoint(me.clientX, me.clientY);
      const tr2 = el2?.closest('tr');
      if (!tr2) return;
      const rows2 = _getRows(config);
      const r2 = rows2.indexOf(tr2);
      if (r2 < 0) return;
      const mc = _getEditableCells(tr2, config).length - 1;
      state.focus = { row: r2, col: mc };
      state.range = { r1: Math.min(r, r2), c1: 0, r2: Math.max(r, r2), c2: mc };
      _renderSelection(config);
    };
    const onUp = () => { state.isDragging = false; doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); };
    doc.addEventListener('mousemove', onMove); doc.addEventListener('mouseup', onUp);
    return;
  }

  // Column header click
  const th = e.target.closest('thead th');
  if (th) {
    e.preventDefault();
    const ths = [...th.closest('thead').querySelectorAll('th')];
    const thIdx = ths.indexOf(th);
    const editableColIdx = thIdx - 1;
    const rows = _getRows(config);
    if (!rows.length) return;
    const maxC = _getEditableCells(rows[0], config).length - 1;
    if (editableColIdx < 0 || editableColIdx > maxC) return;
    const state = _getState(config.name);
    state.anchor = { row: 0, col: editableColIdx };
    state.focus  = { row: rows.length - 1, col: editableColIdx };
    state.range  = { r1: 0, c1: editableColIdx, r2: rows.length - 1, c2: editableColIdx };
    state.isDragging = true; state.dragMode = 'col';
    _renderSelection(config);

    const onMove = (me) => {
      const el2 = document.elementFromPoint(me.clientX, me.clientY);
      const th2 = el2?.closest('thead th');
      if (!th2) return;
      const ths2 = [...th2.closest('thead').querySelectorAll('th')];
      const c2 = ths2.indexOf(th2) - 1;
      if (c2 < 0 || c2 > maxC) return;
      state.focus.col = c2;
      state.range.c1 = Math.min(editableColIdx, c2);
      state.range.c2 = Math.max(editableColIdx, c2);
      _renderSelection(config);
    };
    const onUp = () => { state.isDragging = false; doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); };
    doc.addEventListener('mousemove', onMove); doc.addEventListener('mouseup', onUp);
    return;
  }

  // Regular cell click
  const inp = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'
    ? e.target
    : e.target.closest('td')?.querySelector('input, select');
  if (!inp) return;
  const pos = _getPosFromEl(config, inp);
  if (!pos) return;

  if (e.shiftKey) {
    _extendSelectionTo(config, pos.row, pos.col);
    return;
  }

  const state = _getState(config.name);
  state.anchor = { row: pos.row, col: pos.col };
  state.focus  = { row: pos.row, col: pos.col };
  state.range  = { r1: pos.row, c1: pos.col, r2: pos.row, c2: pos.col };
  state.isDragging = true; state.dragMode = 'cell';
  _renderSelection(config);

  const onMove = (me) => {
    if (!state.isDragging) return;
    const target = document.elementFromPoint(me.clientX, me.clientY);
    if (!target) return;
    const inp2 = (target.tagName === 'INPUT' || target.tagName === 'SELECT')
      ? target
      : target.closest('td')?.querySelector('input, select');
    if (!inp2) return;
    const pos2 = _getPosFromEl(config, inp2);
    if (!pos2) return;
    _extendSelectionTo(config, pos2.row, pos2.col);
  };
  const onUp = () => { state.isDragging = false; doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); };
  doc.addEventListener('mousemove', onMove); doc.addEventListener('mouseup', onUp);
}

const doc = document;

// ══════════════════════════════════════════════════════════════
// SECTION 8 — Autocomplete Engine
// ══════════════════════════════════════════════════════════════

let _acDropdownEl = null;
const _acState = { el: null, items: [], col: null, config: null, activeIdx: -1 };

function _getAcDropdown() {
  if (!_acDropdownEl) {
    _acDropdownEl = document.createElement('div');
    _acDropdownEl.className = 'sheet-autocomplete';
    _acDropdownEl.style.cssText = 'display:none;position:fixed;z-index:9999;';
    document.body.appendChild(_acDropdownEl);
  }
  return _acDropdownEl;
}

function _acIsOpen() {
  return _acDropdownEl && _acDropdownEl.style.display !== 'none';
}

function _filterItems(query, items) {
  if (!query || !query.trim()) return items.slice(0, 25);
  const q = _normVi(query);
  const starts = [], contains = [];
  for (const item of items) {
    const name = typeof item === 'string' ? item : item.name;
    const n = _normVi(name);
    if (n.startsWith(q)) starts.push(item);
    else if (n.includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, 25);
}

function _showAcForEl(el, col, config) {
  const query = el.value;
  let rawItems = [];
  if (col.type === 'autocomplete') {
    const src = typeof col.source === 'function' ? col.source() : (col.source || []);
    rawItems = src.map(s => (typeof s === 'string' ? { name: s, id: null } : s));
  } else if (col.type === 'project-autocomplete') {
    const src = typeof col.source === 'function' ? col.source() : [];
    rawItems = src;
  }
  const filtered = _filterItems(query, rawItems);
  _showAc(el, filtered, col, config);
}

function _showAc(el, items, col, config) {
  _acState.el = el; _acState.items = items; _acState.col = col;
  _acState.config = config; _acState.activeIdx = -1;

  const dd = _getAcDropdown();
  if (!items.length) { _hideAc(); return; }

  dd.innerHTML = items.map((item, i) => {
    const name = typeof item === 'string' ? item : item.name;
    return `<div class="sheet-autocomplete-item" data-idx="${i}">${_escHtml(name)}</div>`;
  }).join('');

  dd.style.display = 'block';
  const rect = el.getBoundingClientRect();
  dd.style.left = rect.left + 'px';
  dd.style.top  = (rect.bottom + 2) + 'px';
  dd.style.minWidth = Math.max(rect.width, 160) + 'px';

  dd.querySelectorAll('.sheet-autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', function(ev) {
      ev.preventDefault(); // prevent blur on input
      _acSelectIdx(parseInt(this.dataset.idx, 10));
    });
  });
}

function _hideAc() {
  if (_acDropdownEl) _acDropdownEl.style.display = 'none';
  _acState.el = null; _acState.activeIdx = -1;
}

function _acMoveActive(dir) {
  const dd = _getAcDropdown();
  const items = dd.querySelectorAll('.sheet-autocomplete-item');
  if (!items.length) return;
  _acState.activeIdx = Math.max(-1, Math.min(items.length - 1, _acState.activeIdx + dir));
  items.forEach((it, i) => it.classList.toggle('active', i === _acState.activeIdx));
  if (_acState.activeIdx >= 0) items[_acState.activeIdx].scrollIntoView({ block: 'nearest' });
}

function _acConfirm() {
  if (_acState.activeIdx < 0 || !_acState.items.length) { _hideAc(); return; }
  _acSelectIdx(_acState.activeIdx);
}

function _acSelectIdx(idx) {
  const { el, items, col, config } = _acState;
  if (!el || idx < 0 || idx >= items.length) return;
  const item = items[idx];
  const name = typeof item === 'string' ? item : item.name;
  const id   = typeof item === 'object' ? (item.id || '') : null;
  el.value = name;
  if (id !== null && 'pid' in el.dataset) el.dataset.pid = id;
  el.classList.remove('sheet-cell-invalid');
  _triggerChange(el);
  _hideAc();
}

function _canonicalizeAcValue(el, col) {
  const val = el.value.trim();
  if (!val) { el.classList.remove('sheet-cell-invalid'); return; }
  let items = [];
  if (col.type === 'autocomplete') {
    const src = typeof col.source === 'function' ? col.source() : (col.source || []);
    items = src.map(s => (typeof s === 'string' ? { name: s, id: null } : s));
  } else if (col.type === 'project-autocomplete') {
    items = typeof col.source === 'function' ? col.source() : [];
  }
  const normVal = _normVi(val);
  const match = items.find(item => _normVi(typeof item === 'string' ? item : item.name) === normVal);
  if (match) {
    el.value = typeof match === 'string' ? match : match.name;
    if (typeof match === 'object' && match.id !== null && 'pid' in el.dataset) {
      el.dataset.pid = match.id || '';
    }
    el.classList.remove('sheet-cell-invalid');
  } else if (col.required) {
    el.classList.add('sheet-cell-invalid');
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — Grid Binding
// ══════════════════════════════════════════════════════════════

function _bindGrid(config) {
  const tbody = document.querySelector(config.tbody);
  if (!tbody) return;
  if (tbody.dataset.sheetGridBound === config.name) return;
  tbody.dataset.sheetGridBound = config.name;

  const table = tbody.closest('table');

  // Mouse selection on table (handles thead + tbody)
  if (table && !table.dataset.sheetMouseBound) {
    table.dataset.sheetMouseBound = config.name;
    table.addEventListener('mousedown', (e) => _handleMousedown(e, config));
  }

  // Keyboard
  tbody.addEventListener('keydown', (e) => {
    if (!e.target.matches(config.cellSelector || 'input')) return;
    _onKeydown(e, config);
  });

  // Copy
  tbody.addEventListener('copy', (e) => {
    if (!e.target.matches(config.cellSelector || 'input')) return;
    // Only intercept if range selection (not single cell with text selected)
    const state = _getState(config.name);
    const { r1, c1, r2, c2 } = state.range;
    const isSingleCell = r1 === r2 && c1 === c2;
    if (isSingleCell && e.target.tagName === 'INPUT' && e.target.selectionStart !== e.target.selectionEnd) return;
    _copyRangeToClipboard(config, e);
  });

  // Paste
  tbody.addEventListener('paste', (e) => {
    if (!e.target.matches(config.cellSelector || 'input')) return;
    const clipboard = (e.clipboardData || window.clipboardData).getData('text');
    if (!clipboard) return;

    const rawLines = clipboard.split(/\r?\n/);
    while (rawLines.length && !rawLines[rawLines.length - 1].trim()) rawLines.pop();
    if (!rawLines.length) return;
    const matrix = rawLines.map(line => line.split('\t'));

    // Single cell paste → let browser handle if not overriding
    if (matrix.length === 1 && matrix[0].length === 1) {
      // For autocomplete fields, just let it paste naturally
      const col = _getColConfig(config, e.target);
      if (col && (col.type === 'autocomplete' || col.type === 'project-autocomplete')) {
        e.preventDefault();
        e.target.value = matrix[0][0];
        _triggerChange(e.target);
      }
      return;
    }

    e.preventDefault();
    const state = _getState(config.name);

    // Start position: top-left of selection range or focus cell
    let startRow, startCol;
    if (state.range.r1 >= 0) {
      startRow = state.range.r1; startCol = state.range.c1;
    } else {
      const pos = _getPosFromEl(config, e.target);
      if (!pos) return;
      startRow = pos.row; startCol = pos.col;
    }

    // Fill logic: if selection is larger than matrix, tile the matrix
    const selRows = (state.range.r2 >= 0) ? state.range.r2 - state.range.r1 + 1 : matrix.length;
    const selCols = (state.range.c2 >= 0) ? state.range.c2 - state.range.c1 + 1 : matrix[0].length;
    let pasteMatrix = matrix;
    if (selRows > matrix.length || selCols > matrix[0].length) {
      // Tile/repeat matrix to fill selection
      pasteMatrix = [];
      for (let r = 0; r < selRows; r++) {
        const row = [];
        for (let c = 0; c < selCols; c++) {
          row.push(matrix[r % matrix.length][c % matrix[0].length]);
        }
        pasteMatrix.push(row);
      }
    }
    _pasteMatrix(config, pasteMatrix, startRow, startCol);
  });

  // Focus: update selection state + show autocomplete
  tbody.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches(config.cellSelector || 'input')) return;
    const pos = _getPosFromEl(config, el);
    if (!pos) return;
    // Only update active cell visual, don't reset range (mouse may have set it)
    const state = _getState(config.name);
    const { r1, c1, r2, c2 } = state.range;
    const alreadyInRange = r1 >= 0 && pos.row >= r1 && pos.row <= r2 && pos.col >= c1 && pos.col <= c2;
    if (!alreadyInRange) {
      _setActiveCell(config, pos.row, pos.col, true);
    } else {
      state.focus = { row: pos.row, col: pos.col };
      _renderSelection(config);
    }
    // Suggest placeholder
    const col = _getColConfig(config, el);
    if (col && (col.suggestFromAbove || col.copyFromAbove) && el.tagName === 'INPUT' && !el.value.trim()) {
      const aboveVal = _getAboveValue(el, config);
      if (aboveVal) el.placeholder = aboveVal;
    }
    // Autocomplete
    if (col && (col.type === 'autocomplete' || col.type === 'project-autocomplete')) {
      _showAcForEl(el, col, config);
    }
  });

  tbody.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!el.matches(config.cellSelector || 'input')) return;
    // Delay to let mousedown on dropdown fire first
    setTimeout(() => {
      if (_acState.el === el) _hideAc();
      const col = _getColConfig(config, el);
      if (col && (col.type === 'autocomplete' || col.type === 'project-autocomplete')) {
        _canonicalizeAcValue(el, col);
      }
    }, 160);
  });

  // Input → update autocomplete dropdown live
  tbody.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.matches(config.cellSelector || 'input')) return;
    const col = _getColConfig(config, el);
    if (!col) return;
    if (col.type === 'autocomplete' || col.type === 'project-autocomplete') {
      _showAcForEl(el, col, config);
      if (col.type === 'project-autocomplete') el.dataset.pid = ''; // reset pid when typing
    }
  });
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — Public API
// ══════════════════════════════════════════════════════════════

function initSheetGrid(config) {
  if (!config || !config.name) return;
  _grids[config.name] = config;
  if (!_states[config.name]) _states[config.name] = _initState();
  _bindGrid(config);
}

function refreshSheetGrid(nameOrConfig) {
  const config = typeof nameOrConfig === 'string' ? _grids[nameOrConfig] : nameOrConfig;
  if (!config) return;
  _grids[config.name] = config;
  const tbody = document.querySelector(config.tbody);
  if (tbody) {
    delete tbody.dataset.sheetGridBound;
    const table = tbody.closest('table');
    if (table) delete table.dataset.sheetMouseBound;
  }
  _bindGrid(config);
}

window.HoaDonSheetGrid = {
  init:                 initSheetGrid,
  refresh:              refreshSheetGrid,
  setActiveCell:        (name, r, c) => { const cfg = _grids[name]; if (cfg) _setActiveCell(cfg, r, c, true); },
  clearSelection:       (name) => { const s = _getState(name); Object.assign(s, _initState()); if (_grids[name]) _clearSelectionUI(_grids[name]); },
  getSelectedRange:     (name) => _getState(name).range,
  getCellValue:         (el, config) => _getCellValue(el, _getColConfig(config, el)),
  setCellValue:         (el, value, config) => _setCellValue(el, value, _getColConfig(config, el)),
  markCellInvalid,
  clearCellInvalid,
  validateCategoryCell
};

window.initSheetGrid        = initSheetGrid;
window.refreshSheetGrid     = refreshSheetGrid;
window.markCellInvalid      = markCellInvalid;
window.clearCellInvalid     = clearCellInvalid;
window.validateCategoryCell = validateCategoryCell;

})();
