// nhapxuat.import.js — Duplicate detection, import session, preview và apply import
// Load order: sau nhapxuat.parsers.js, trước nhapxuat.export.js

'use strict';

// ══════════════════════════════════════════════════════════════
// [4] DUPLICATE DETECTION — so sánh với dữ liệu đang có trong DB
// KHÔNG dùng stableId; dùng business key
// ══════════════════════════════════════════════════════════════

function _isDupInvQ(rec) {
  return invoices.some(ex =>
    !ex.deletedAt && !ex.ccKey &&
    ex.ngay === rec.ngay &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.congtrinh) === _normStr(rec.congtrinh)) &&
    _normStr(ex.loai) === _normStr(rec.loai) &&
    ex.tien === rec.tien &&
    _normStr(ex.nd) === _normStr(rec.nd)
  );
}

function _isDupInvD(rec) {
  return invoices.some(ex =>
    !ex.deletedAt &&
    Array.isArray(ex.items) && ex.items.length > 0 &&
    ex.ngay === rec.ngay &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.congtrinh) === _normStr(rec.congtrinh)) &&
    _normStr(ex.loai) === _normStr(rec.loai) &&
    _normStr(ex.ncc) === _normStr(rec.ncc) &&
    ex.thanhtien === rec.thanhtien
  );
}

function _isDupUng(rec) {
  return ungRecords.some(ex =>
    !ex.deletedAt &&
    ex.ngay === rec.ngay &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.congtrinh) === _normStr(rec.congtrinh)) &&
    _normStr(ex.tp) === _normStr(rec.tp) &&
    ex.tien === rec.tien
  );
}

function _isDupThu(rec) {
  return thuRecords.some(ex =>
    !ex.deletedAt &&
    ex.ngay === rec.ngay &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.congtrinh) === _normStr(rec.congtrinh)) &&
    ex.tien === rec.tien
  );
}

function _isDupTb(rec) {
  return tbData.some(ex =>
    !ex.deletedAt &&
    ex.ngay === rec.ngay &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.ct) === _normStr(rec.ct)) &&
    _normStr(ex.ten) === _normStr(rec.ten) &&
    ex.soluong === rec.soluong
  );
}

function _isDupTp(rec) {
  return thauPhuContracts.some(ex =>
    !ex.deletedAt &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.congtrinh) === _normStr(rec.congtrinh)) &&
    _normStr(ex.thauphu) === _normStr(rec.thauphu) &&
    ex.giaTri === rec.giaTri
  );
}

function _isDupCC(rec) {
  return ccData.some(ex =>
    !ex.deletedAt &&
    ex.fromDate === rec.fromDate &&
    (ex.projectId && rec.projectId ? ex.projectId === rec.projectId : _normStr(ex.ct) === _normStr(rec.ct))
  );
}

// ══════════════════════════════════════════════════════════════
// [5] DETECT SHEET TYPE + PARSE WORKBOOK
// ══════════════════════════════════════════════════════════════

function _detectSheetType(name) {
  const n = _normStr(name);
  if (n.match(/^1[ _]/) || n.includes('hoa don nhanh') || n.includes('hoadonnhanh'))      return 'invQ';
  if (n.match(/^2[ _]/) || n.includes('hoa don chi tiet') || n.includes('hoadonchitiet')) return 'invD';
  if (n.match(/^3[ _]/) || n.includes('cham cong') || n.includes('chamcong'))             return 'cc';
  if (n.match(/^4[ _]/) || n.includes('tien ung') || n.includes('tienung'))               return 'ung';
  if (n.match(/^5[ _]/) || n.includes('thiet bi') || n.includes('thietbi'))               return 'tb';
  if (n.match(/^6[ _]/) || n.includes('danh muc') || n.includes('danhmuc'))               return 'cats';
  if (n.match(/^7[ _]/) || n.includes('hop dong chinh') || n.includes('hopdongchinh') ||
      (n.includes('hop dong') && !n.includes('thau')))                                     return 'hd';
  if (n.match(/^8[ _]/) || n.includes('thu tien') || n.includes('thutien'))               return 'thu';
  if (n.match(/^9[ _]/) || n.includes('thau phu') || n.includes('thauphu'))               return 'tp';
  return null;
}

let _importSession = null;

function _doImportParse(wb, filename) {
  const session = { filename, sheets: {}, catsParsed: null, lookup: null };

  // ── Nhận dạng sheet theo tên, fallback theo vị trí ────────
  const detected = {};
  wb.SheetNames.forEach(name => {
    const t = _detectSheetType(name);
    if (t && !detected[t]) detected[t] = name;
  });
  const _fbOrder = ['invQ','invD','cc','ung','tb','cats','hd','thu','tp'];
  wb.SheetNames.forEach((name, idx) => {
    const t = _fbOrder[idx];
    if (t && !detected[t]) detected[t] = name;
  });

  // ── BƯỚC 1: Parse DanhMuc trước (không cần lookup) ────────
  let catsParsed = null;
  if (detected.cats) {
    const rows = _sheetRows(wb.Sheets[detected.cats]);
    const { parsed, errors } = parseSheet6(rows);
    catsParsed = parsed;
    session.catsParsed = parsed;
    const total = ['ct','loai','ncc','nguoi','tp','cn','tb'].reduce((s,k) => s + (parsed[k]||[]).length, 0);
    session.sheets.cats = {
      key: 'cats', label: 'Danh Mục', sheetName: detected.cats,
      records: [], errors, skipped: [], cats: parsed, catTotal: total,
    };
  }

  // ── BƯỚC 2: Fallback CT — scan col[1] nếu không có DanhMuc ─
  // Đảm bảo mọi tên CT trong file đều có provisional entry trong lookup
  const extraCTs = [];
  if (!catsParsed || !(catsParsed.ct && catsParsed.ct.length)) {
    ['invQ','invD','cc','ung','tb','hd','thu','tp'].filter(k => detected[k]).forEach(k => {
      const rows = _sheetRows(wb.Sheets[detected[k]]);
      for (let i = 1; i < rows.length; i++) {
        const v = _str(rows[i][1]);
        if (v && !extraCTs.includes(v)) extraCTs.push(v);
      }
    });
  }

  // ── BƯỚC 3: Build lookup từ existing + incoming DanhMuc ───
  // Provisional projects cho CT mới → không ghi DB cho đến khi user confirm
  const lookup = _makeCatLookupWithExtra(catsParsed, extraCTs);
  session.lookup = lookup;

  // ── BƯỚC 4: Parse các sheet còn lại với enriched lookup ───
  const _parse = (key, label, parseFn, sheetName) => {
    if (!sheetName) return;
    const rows = _sheetRows(wb.Sheets[sheetName]);
    if (rows.length < 2) {
      session.sheets[key] = {
        key, label, sheetName, records: [], skipped: [],
        errors: [_mkErr(label, 0, '', '', 'Sheet trống hoặc chỉ có header')],
      };
      return;
    }
    const result = parseFn(rows, lookup);
    session.sheets[key] = {
      key, label, sheetName,
      records: result.records || [],
      errors:  result.errors  || [],
      skipped: [],
      ...(result.newCNs ? { newCNs: result.newCNs } : {}),
    };
  };

  _parse('invQ', 'HĐ Nhanh',     (r,l) => parseSheet1(r,l), detected.invQ);
  _parse('invD', 'HĐ Chi Tiết',  (r,l) => parseSheet2(r,l), detected.invD);
  _parse('cc',   'Chấm Công',    (r,l) => parseSheet3(r,l), detected.cc);
  _parse('ung',  'Tiền Ứng',     (r,l) => parseSheet4(r,l), detected.ung);
  _parse('tb',   'Thiết Bị',     (r,l) => parseSheet5(r,l), detected.tb);
  _parse('hd',   'HĐ Chính',     (r,l) => parseSheet7(r,l), detected.hd);
  _parse('thu',  'Thu Tiền',     (r,l) => parseSheet8(r,l), detected.thu);
  _parse('tp',   'HĐ Thầu Phụ', (r,l) => parseSheet9(r,l), detected.tp);

  // Mark duplicates
  _markDuplicates(session);

  // Kiểm tra có gì để import không
  const hasValid = Object.values(session.sheets).some(s =>
    s.records.length > 0 || (s.catTotal || 0) > 0
  );
  const totalErrors = Object.values(session.sheets).reduce((n,s) => n + s.errors.length, 0);

  if (!hasValid && totalErrors === 0) {
    toast('⚠️ Không tìm thấy dữ liệu hợp lệ trong file!', 'error');
    return;
  }

  _importSession = session;
  _showImportPreviewNew(session);
}

// ══════════════════════════════════════════════════════════════
// [6] DUPLICATE MARKING
// ══════════════════════════════════════════════════════════════

function _markDuplicates(session) {
  const sh = session.sheets;

  // Bước 1: dedup trong cùng file (Issue 2) — trước khi check DB
  const _batchDedup = (key, keyFn) => {
    if (!sh[key]) return;
    const { kept, duplicates } = _markDuplicateInBatch(sh[key].records, keyFn);
    sh[key].skipped.push(...duplicates.map(r => ({ reason: 'Trùng trong file import', record: r })));
    sh[key].records = kept;
  };

  const _pid = (r, ctField) => r.projectId || _normStr(r[ctField] || '');
  _batchDedup('invQ', r => `${r.ngay}|${_pid(r,'congtrinh')}|${_normStr(r.loai)}|${r.tien}|${_normStr(r.nd)}`);
  _batchDedup('invD', r => `${r.ngay}|${_pid(r,'congtrinh')}|${_normStr(r.loai)}|${_normStr(r.ncc)}|${r.thanhtien}`);
  _batchDedup('ung',  r => `${r.ngay}|${_pid(r,'congtrinh')}|${_normStr(r.tp)}|${r.tien}`);
  _batchDedup('thu',  r => `${r.ngay}|${_pid(r,'congtrinh')}|${r.tien}`);
  _batchDedup('tb',   r => `${r.ngay}|${_pid(r,'ct')}|${_normStr(r.ten)}|${r.soluong}`);
  _batchDedup('tp',   r => `${_pid(r,'congtrinh')}|${_normStr(r.thauphu)}|${r.giaTri}`);
  _batchDedup('cc',   r => `${r.fromDate}|${_pid(r,'ct')}`);

  // Bước 2: check trùng vs DB hiện có
  const _mark = (key, isDupFn) => {
    if (!sh[key]) return;
    const kept = [], dups = [];
    sh[key].records.forEach(r => {
      if (isDupFn(r)) dups.push(r); else kept.push(r);
    });
    sh[key].skipped.push(...dups.map(r => ({ reason: 'Trùng dữ liệu đã có trong DB', record: r })));
    sh[key].records = kept;
  };

  _mark('invQ', _isDupInvQ);
  _mark('invD', _isDupInvD);
  _mark('ung',  _isDupUng);
  _mark('thu',  _isDupThu);
  _mark('tb',   _isDupTb);
  _mark('tp',   _isDupTp);
  _mark('cc',   _isDupCC);
}

// ══════════════════════════════════════════════════════════════
// [7] IMPORT PREVIEW MODAL
// ══════════════════════════════════════════════════════════════

function _showImportPreviewNew(session) {
  let ov = document.getElementById('import-modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'import-modal-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';
    ov.onclick = function(e) { if (e.target === this) ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }

  const sh    = session.sheets;
  const ORDER = ['invQ','invD','cc','ung','tb','cats','hd','thu','tp'];

  const _mkRow = key => {
    const s = sh[key];
    if (!s) return '';
    const isCats       = key === 'cats';
    const validCount   = isCats ? (s.catTotal || 0) : s.records.length;
    const dbDupCount   = s.skipped.filter(sk => sk.reason === 'Trùng dữ liệu đã có trong DB').length;
    const batchDupCount = s.skipped.filter(sk => sk.reason === 'Trùng trong file import').length;
    const dupCount     = s.skipped.length;
    const errCount     = s.errors.length;
    const canImport    = validCount > 0;

    let icon, iconColor;
    if (validCount === 0 && errCount > 0 && dupCount === 0) { icon = '❌'; iconColor = '#c0392b'; }
    else if (errCount > 0 || dupCount > 0)                  { icon = '⚠️'; iconColor = '#e67e22'; }
    else                                                    { icon = '✔';  iconColor = '#1a7a45'; }

    let countTxt;
    if (isCats) {
      const c = s.cats;
      const parts = [];
      if ((c.ct    ||[]).length) parts.push(`${c.ct.length} CT`);
      if ((c.loai  ||[]).length) parts.push(`${c.loai.length} Loại`);
      if ((c.ncc   ||[]).length) parts.push(`${c.ncc.length} NCC`);
      if ((c.nguoi ||[]).length) parts.push(`${c.nguoi.length} Người`);
      if ((c.tp    ||[]).length) parts.push(`${c.tp.length} TP`);
      if ((c.cn    ||[]).length) parts.push(`${c.cn.length} CN`);
      if ((c.tb    ||[]).length) parts.push(`${c.tb.length} Thiết Bị`);
      countTxt = parts.join(', ') || '0 mục';
    } else if (key === 'cc') {
      const cnN = s.records.reduce((n, w) => n + (w.workers||[]).length, 0);
      countTxt  = `${s.records.length} tuần · ${cnN} CN`;
      if (dbDupCount)    countTxt += ` · ⚠️ ${dbDupCount} tuần trùng DB`;
      if (batchDupCount) countTxt += ` · ⛔ ${batchDupCount} tuần trùng file`;
    } else {
      countTxt = `${validCount} bản ghi`;
      if (dbDupCount)    countTxt += ` · ⚠️ ${dbDupCount} trùng DB`;
      if (batchDupCount) countTxt += ` · ⛔ ${batchDupCount} trùng file`;
    }

    const errSample = s.errors.slice(0, 4);
    const errHtml = errSample.length
      ? `<div style="padding:2px 10px 6px 46px;font-size:11px;color:#c0392b;line-height:1.7">
          ${errSample.map(e => `• ${_fmtErr(e)}`).join('<br>')}
          ${s.errors.length > 4 ? `<br>• …và ${s.errors.length - 4} lỗi khác (xem log)` : ''}
        </div>` : '';

    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;margin-bottom:3px;background:#f8f9fb;cursor:${canImport?'pointer':'default'}">
      <input type="checkbox" id="imp-cb-${key}" ${canImport?'checked':'disabled'}
        style="width:15px;height:15px;accent-color:#1a7a45;cursor:${canImport?'pointer':'default'}">
      <span style="font-size:14px;min-width:22px;color:${iconColor}">${icon}</span>
      <span style="font-size:12.5px;flex:1"><strong>${s.label}</strong>: ${countTxt}</span>
    </label>${errHtml}`;
  };

  const sheetsHtml = ORDER.map(_mkRow).join('');
  const hasAnything = ORDER.some(k => sh[k] && (sh[k].records.length > 0 || (sh[k].catTotal || 0) > 0));

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:540px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18);max-height:92vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="font-size:16px;font-weight:800;margin:0">📥 Xem Trước Import</h3>
      <button onclick="document.getElementById('import-modal-overlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="background:#f0f4ff;border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#333">
      📄 <strong>${session.filename}</strong>
    </div>
    ${hasAnything ? `<div style="margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:12.5px;font-weight:700;cursor:pointer;color:#1a1814">
        <input type="checkbox" id="imp-cb-all" checked onchange="_toggleAllImportSheets(this.checked)"
          style="width:15px;height:15px;accent-color:#1a1814">
        Chọn tất cả
      </label>
    </div>` : ''}
    <div style="border-top:1px solid #eee;padding-top:8px;margin-bottom:10px">
      ${sheetsHtml}
    </div>
    <div style="background:#f0f9f4;border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:11.5px;color:#1a3c2a;line-height:1.7">
      ✔ Chỉ insert bản ghi MỚI · Bản trùng tự bỏ qua · Lỗi validate bị loại trước import
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('import-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Huỷ</button>
      ${hasAnything
        ? `<button onclick="_applyImport()" style="flex:2;padding:11px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">✅ Import Các Sheet Đã Chọn</button>`
        : `<button disabled style="flex:2;padding:11px;border-radius:8px;border:none;background:#ccc;color:#666;font-family:inherit;font-size:13px;font-weight:700;cursor:not-allowed">Không có dữ liệu hợp lệ</button>`
      }
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function _toggleAllImportSheets(checked) {
  ['invQ','invD','cc','ung','tb','cats','hd','thu','tp'].forEach(key => {
    const cb = document.getElementById('imp-cb-' + key);
    if (cb && !cb.disabled) cb.checked = checked;
  });
}

// ══════════════════════════════════════════════════════════════
// [8] APPLY IMPORT + GENERATE LOG
// ══════════════════════════════════════════════════════════════

function _applyImport() {
  const session = _importSession;
  if (!session) return;
  document.getElementById('import-modal-overlay').style.display = 'none';

  const ORDER = ['invQ','invD','cc','ung','tb','cats','hd','thu','tp'];
  const selected = new Set(ORDER.filter(k => {
    const cb = document.getElementById('imp-cb-' + k);
    return cb && cb.checked;
  }));
  if (!selected.size) { toast('⚠️ Không có sheet nào được chọn', 'error'); return; }

  const sh       = session.sheets;
  const logLines = {};
  const _log = (key, line) => { if (!logLines[key]) logLines[key] = []; logLines[key].push(line); };
  let totalAdded = 0;

  // ── 1. DanhMuc trước (tạo mới cats + projects) ────────────
  if (selected.has('cats') && session.catsParsed) {
    const c   = session.catsParsed;
    const now = Date.now();
    const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

    const _mergeCatArr = (key, incoming, catId, assign) => {
      if (!incoming || !incoming.length) return 0;
      const current = load(key, []);
      // Canonicalize incoming names trước khi merge (áp dụng rule Title Case / UPPERCASE)
      const canonIn = (incoming || []).map(n =>
        typeof normalizeCatDisplayName === 'function' ? normalizeCatDisplayName(catId, n) : n
      );
      const combined = _deduplicateCatNames([...current, ...canonIn]);
      const added = combined.filter(v => !current.some(c2 => _normStr(c2) === _normStr(v)));
      if (!added.length) return 0;
      save(key, combined);
      if (assign) assign(combined);
      if (catId && typeof _syncCatItems === 'function') _syncCatItems(catId, combined);
      return added.length;
    };

    let catAdded = 0;
    catAdded += _mergeCatArr('cat_loai',  c.loai,  'loaiChiPhi', v => { cats.loaiChiPhi = v; });
    catAdded += _mergeCatArr('cat_ncc',   c.ncc,   'nhaCungCap', v => { cats.nhaCungCap = v; });
    catAdded += _mergeCatArr('cat_nguoi', c.nguoi, 'nguoiTH',    v => { cats.nguoiTH    = v; });
    catAdded += _mergeCatArr('cat_tp',    c.tp,    'thauPhu',    v => { cats.thauPhu    = v; });
    catAdded += _mergeCatArr('cat_cn',    c.cn,    'congNhan',   v => { cats.congNhan   = v; });
    catAdded += _mergeCatArr('cat_tbteb', c.tb,    'tbTen',      v => { if (typeof cats.tbTen !== 'undefined') cats.tbTen = v; });

    // CN roles
    if (c.cnRoles && Object.keys(c.cnRoles).length) {
      const merged = Object.assign({}, typeof cnRoles !== 'undefined' ? cnRoles : {}, c.cnRoles);
      save('cat_cn_roles', merged);
      if (typeof cnRoles !== 'undefined') cnRoles = merged;
    }

    // Công trình → projects (DanhMuc là nguồn duy nhất được tạo mới project qua import)
    let projCreated = 0;
    if (typeof projects !== 'undefined' && c.ct && c.ct.length) {
      const existNorm = new Set(projects.map(p => _normStr(p.name)));
      c.ct.forEach(name => {
        const t = String(name || '').trim();
        if (!t || t.length < 2) return;
        if (existNorm.has(_normStr(t))) return;
        projects.push({
          id: crypto.randomUUID(), name: t, status: 'active',
          startDate: null, endDate: null, note: '',
          createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
        });
        existNorm.add(_normStr(t));
        projCreated++;
      });
      if (projCreated > 0) {
        save('projects_v1', projects);
        if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
      }
    }

    _log('cats', `✔ Danh mục: +${catAdded} mục mới, +${projCreated} công trình mới`);
    sh.cats.errors.forEach(e => _log('cats', `❌ ${_fmtErr(e)}`));
    totalAdded += catAdded + projCreated;

    // Rebuild lookup + resolve provisional IDs → real UUIDs
    const newLookup = _makeCatLookup();
    Object.assign(session.lookup, newLookup);
    _resolveProvisionalProjectIds(session, session.lookup);
  }

  // ── 1b. Fallback: auto-create projects từ provisional records (khi không có DanhMuc) ─
  // Chạy khi user import file không có sheet DanhMuc nhưng có CT mới
  if (!selected.has('cats')) {
    const now2 = Date.now();
    const dev2  = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
    const allRecs = ['invQ','invD','ung','tb','thu','tp','cc']
      .flatMap(key => (sh[key] || {}).records || []);
    const existNorm = new Set(
      (typeof projects !== 'undefined' ? projects : []).map(p => _normStr(p.name))
    );
    let autoCreated = 0;
    allRecs.forEach(r => {
      if (!r.projectId || !String(r.projectId).startsWith('_prov_')) return;
      const name = (r.congtrinh || r.ct || '').trim();
      if (!name || existNorm.has(_normStr(name))) return;
      if (typeof projects !== 'undefined') {
        projects.push({
          id: crypto.randomUUID(), name, status: 'active',
          startDate: null, endDate: null, note: '',
          createdAt: now2, updatedAt: now2, deletedAt: null, deviceId: dev2,
        });
        existNorm.add(_normStr(name));
        autoCreated++;
      }
    });
    if (autoCreated > 0) {
      save('projects_v1', projects);
      if (typeof rebuildCatCTFromProjects === 'function') rebuildCatCTFromProjects();
      const fbLookup = _makeCatLookup();
      Object.assign(session.lookup, fbLookup);
      _resolveProvisionalProjectIds(session, session.lookup);
    }
  }

  // ── 2. Merge record arrays ─────────────────────────────────
  // Re-stamp: updatedAt = thời điểm APPLY (không phải parse) → luôn thắng cloud cũ
  const _applyNow = Date.now();
  const _applyDev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  const _importArr = (key, dbKey, recs, assign) => {
    if (!selected.has(key) || !sh[key] || !recs.length) return;
    // Ghi đè updatedAt + deviceId = thời điểm apply để đảm bảo import luôn thắng LWW
    const stamped = recs.map(r => ({ ...r, updatedAt: _applyNow, deviceId: _applyDev || r.deviceId }));
    const merged = mergeUnique(load(dbKey, []), stamped);
    save(dbKey, merged); // save (không _memSet) → increment pending → force push sẽ đẩy lên cloud
    if (assign) assign(merged);
    stamped.forEach(r => {
      let d = r.ngay || r.fromDate || '';
      if (d) d = fmtISODate(d, d);
      const c = r.congtrinh || r.ct || '';
      _log(key, `✔ ${d}${d&&c?' · ':''}${c}`);
    });
    sh[key].skipped.forEach(sk => {
      const r = sk.record;
      const prefix = sk.reason === 'Trùng trong file import' ? '⛔' : '⚠️';
      let d = r.ngay || r.fromDate || '';
      if (d) d = fmtISODate(d, d);
      _log(key, `${prefix} Bỏ qua (${sk.reason}): ${d} · ${r.congtrinh||r.ct||''}`);
    });
    sh[key].errors.slice(0, 30).forEach(e => _log(key, `❌ ${_fmtErr(e)}`));
    totalAdded += recs.length;
  };

  const _recs = key => (selected.has(key) && sh[key]) ? sh[key].records : [];

  _importArr('invQ', 'inv_v3', _recs('invQ'), v => { invoices    = v; });
  _importArr('invD', 'inv_v3', _recs('invD'), v => { invoices    = v; });
  _importArr('ung',  'ung_v1', _recs('ung'),  v => { ungRecords  = v; });
  _importArr('tb',   'tb_v1',  _recs('tb'),   v => { tbData      = v; });
  _importArr('thu',  'thu_v1', _recs('thu'),  v => { thuRecords  = v; });
  _importArr('tp',   'thauphu_v1', _recs('tp'), v => { thauPhuContracts = v; });

  // CC — gộp tuần mới, skip tuần trùng, tự thêm CN mới vào danh mục
  if (selected.has('cc') && sh.cc && sh.cc.records.length) {
    // Normalize: đảm bảo mọi record đều có ctPid = projectId (cần cho filter UI)
    const ccRecs = sh.cc.records.map(r => {
      const pid = r.projectId
        || (typeof findProjectIdByName === 'function' ? findProjectIdByName(r.ct || r.congtrinh) : null)
        || null;
      return { ...r, projectId: pid, ctPid: pid };
    });
    const newCNs = sh.cc.newCNs || [];
    if (newCNs.length) {
      const current  = load('cat_cn', []);
      const combined = _deduplicateCatNames([...current, ...newCNs]);
      const added    = combined.filter(v => !current.some(c2 => _normStr(c2) === _normStr(v)));
      if (added.length) {
        save('cat_cn', combined);
        cats.congNhan = combined;
        if (typeof _syncCatItems === 'function') _syncCatItems('congNhan', combined);
        _log('cc', `ℹ️ Tự thêm ${added.length} CN mới vào danh mục: ${added.join(', ')}`);
      }
    }
    // Re-stamp CC records với updatedAt = apply time
    const stampedCC = ccRecs.map(r => ({ ...r, updatedAt: _applyNow, deviceId: _applyDev || r.deviceId }));
    const merged = mergeUnique(load('cc_v2', []), stampedCC);
    save('cc_v2', merged); // save → increment pending → force push đẩy lên cloud
    ccData = merged;
    if (typeof normalizeAllChamCong  === 'function') normalizeAllChamCong();
    if (typeof rebuildCCCategories   === 'function') rebuildCCCategories();
    ccRecs.forEach(w => {
      let d = w.fromDate || '';
      if (d) d = fmtISODate(d, d);
      _log('cc', `✔ Tuần ${d} · ${w.ct} · ${(w.workers||[]).length} CN`);
    });
    sh.cc.skipped.forEach(sk => {
      const prefix = sk.reason === 'Trùng trong file import' ? '⛔' : '⚠️';
      let d = sk.record.fromDate || '';
      if (d) d = fmtISODate(d, d);
      _log('cc', `${prefix} Bỏ qua (${sk.reason}): Tuần ${d} · ${sk.record.ct}`);
    });
    sh.cc.errors.slice(0, 30).forEach(e => _log('cc', `❌ ${_fmtErr(e)}`));
    totalAdded += ccRecs.length;
  }

  // HopDong — upsert theo CT name
  if (selected.has('hd') && sh.hd && sh.hd.records.length) {
    const now = Date.now();
    const existing = load('hopdong_v1', {});
    sh.hd.records.forEach(row => {
      if (!existing[row.ct] || existing[row.ct].deletedAt) {
        existing[row.ct] = {
          projectId: row.projectId || null,
          giaTri: row.giaTri || 0, giaTriphu: row.giaTriphu || 0,
          phatSinh: row.phatSinh || 0, ghichu: row.ghichu || '',
          nguoi: row.nguoi || '', khachHang: row.khachHang || '',
          ngay: row.ngay || today(), createdAt: now, updatedAt: now, deletedAt: null,
        };
        _log('hd', `✔ Tạo HĐ: ${row.ct}`);
      } else {
        const cur = existing[row.ct];
        existing[row.ct] = {
          ...cur,
          giaTri:    row.giaTri    || cur.giaTri    || 0,
          giaTriphu: row.giaTriphu || cur.giaTriphu || 0,
          phatSinh:  row.phatSinh  || cur.phatSinh  || 0,
          ghichu:    row.ghichu    || cur.ghichu     || '',
          nguoi:     row.nguoi     || cur.nguoi      || '',
          khachHang: row.khachHang || cur.khachHang  || '',
          updatedAt: now,
        };
        _log('hd', `✔ Cập nhật HĐ: ${row.ct}`);
      }
    });
    save('hopdong_v1', existing);
    hopDongData = load('hopdong_v1', {});
    sh.hd.errors.slice(0, 30).forEach(e => _log('hd', `❌ ${_fmtErr(e)}`));
    totalAdded += sh.hd.records.length;
  }

  // ── 3. Cập nhật year filter ────────────────────────────────
  const importYrs = new Set();
  [..._recs('invQ'), ..._recs('invD')].forEach(r => { if (r.ngay) importYrs.add(r.ngay.slice(0,4)); });
  _recs('ung').forEach(r => { if (r.ngay) importYrs.add(r.ngay.slice(0,4)); });
  _recs('cc') .forEach(r => { if (r.fromDate) importYrs.add(r.fromDate.slice(0,4)); });
  _recs('thu').forEach(r => { if (r.ngay) importYrs.add(r.ngay.slice(0,4)); });
  if (importYrs.size > 0 && typeof activeYears !== 'undefined' && activeYears.size > 0) {
    const activeYrStrs = [...activeYears].map(String);
    if (!activeYrStrs.some(y => [...importYrs].includes(y))) {
      // Import data không thuộc năm đang chọn → reset về "Tất cả"
      activeYears = new Set();
      if (typeof _syncActiveYearCompat === 'function') _syncActiveYearCompat();
    }
  }

  // Reset flag scan data để renderSettings chạy lại sau import
  if (typeof resetCatNamesMigrated === 'function') resetCatNamesMigrated();

  // ── 4. Refresh UI ──────────────────────────────────────────
  if (typeof buildYearSelect      === 'function') buildYearSelect();
  if (typeof rebuildEntrySelects  === 'function') rebuildEntrySelects();
  if (typeof rebuildUngSelects    === 'function') rebuildUngSelects();
  if (typeof buildFilters         === 'function') buildFilters();
  if (typeof filterAndRender      === 'function') filterAndRender();
  if (typeof renderTrash          === 'function') renderTrash();
  if (typeof renderCCHistory      === 'function') renderCCHistory();
  if (typeof renderCCTLT          === 'function') renderCCTLT();
  if (typeof buildUngFilters      === 'function') buildUngFilters();
  if (typeof filterAndRenderUng   === 'function') filterAndRenderUng();
  if (typeof renderCtPage         === 'function') renderCtPage();
  if (typeof renderProjectsPage   === 'function') renderProjectsPage();
  if (typeof renderSettings       === 'function') renderSettings();
  if (typeof updateTop            === 'function') updateTop();
  if (typeof dtPopulateSels       === 'function') dtPopulateSels();
  if (typeof renderLaiLo          === 'function') renderLaiLo();
  if (typeof renderCongNoThauPhu  === 'function') renderCongNoThauPhu();

  // ── 5. Force push: import là nguồn sự thật ─────────────────
  // Block auto-pull 15s → tránh cloud đè lên data vừa import
  if (typeof _blockPullUntil !== 'undefined') {
    _blockPullUntil = Date.now() + 15000;
    localStorage.setItem('_blockPullUntil', String(_blockPullUntil));
  }
  // Hủy debounce push đang chờ (nếu có), xóa queue cũ, push ngay với skipPull
  if (typeof cancelScheduledPush === 'function') cancelScheduledPush();
  if (typeof _clearQueue       === 'function') _clearQueue();
  if (fbReady() && typeof pushChanges === 'function') {
    console.log('[Import] ✔ stamped updatedAt=' + _applyNow + ' · force push skipPull');
    pushChanges({ silent: true, skipPull: true });
  }

  // ── 6. Toast + Log ─────────────────────────────────────────
  const totalSkipped = ORDER.reduce((n,k) => n + (sh[k] ? sh[k].skipped.length : 0), 0);
  const totalErrors  = ORDER.reduce((n,k) => n + (sh[k] ? sh[k].errors.length  : 0), 0);
  toast(`✅ Thêm ${totalAdded} · Bỏ qua ${totalSkipped} trùng · ${totalErrors} lỗi — đang tải log...`, 'success');
  setTimeout(() => _generateImportLog(session, logLines, selected), 800);
}

function _generateImportLog(session, logLines, selected) {
  const sh    = session.sheets;
  const ORDER = ['invQ','invD','cc','ung','tb','cats','hd','thu','tp'];
  const LABELS = {
    invQ: '1_HoaDonNhanh',   invD: '2_HoaDonChiTiet', cc: '3_ChamCong',
    ung:  '4_TienUng',       tb:   '5_ThietBi',        cats: '6_DanhMuc',
    hd:   '7_HopDongChinh',  thu:  '8_ThuTien',        tp: '9_HopDongThauPhu',
  };

  const now = new Date();
  const ts  = now.toISOString().replace('T',' ').slice(0,19);
  const fts = now.toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);

  let totalOk = 0, totalSkip = 0, totalErr = 0;
  ORDER.forEach(k => {
    if (!sh[k]) return;
    totalOk   += (k === 'cats' ? sh[k].catTotal || 0 : sh[k].records.length);
    totalSkip += sh[k].skipped.length;
    totalErr  += sh[k].errors.length;
  });

  let txt = '========================================\n';
  txt += 'IMPORT LOG (STRICT MODE)\n';
  txt += `File: ${session.filename}\n`;
  txt += `Thời gian: ${ts}\n\n`;
  txt += 'TỔNG QUAN\n';
  txt += `✔ Thành công: ${totalOk}\n`;
  txt += `⚠️ Bỏ qua (trùng): ${totalSkip}\n`;
  txt += `❌ Lỗi validate: ${totalErr}\n\n`;
  txt += 'CHI TIẾT\n' + '─'.repeat(40) + '\n';

  ORDER.forEach(k => {
    if (!sh[k]) return;
    txt += `\n[${LABELS[k]}]${!selected.has(k) ? ' — BỎ QUA (không chọn)' : ''}\n`;
    if (!selected.has(k)) return;
    const log = logLines[k] || [];
    if (!log.length) { txt += '  (Không có dữ liệu)\n'; return; }
    log.forEach(l => { txt += `  ${l}\n`; });
    // Full error list (nếu quá nhiều)
    if (sh[k].errors.length > 4) {
      txt += `  --- Toàn bộ lỗi validate (${sh[k].errors.length}) ---\n`;
      sh[k].errors.forEach(e => { txt += `  ❌ ${_fmtErr(e)}\n`; });
    }
  });

  txt += '\n' + '='.repeat(40) + '\n';

  try {
    const blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `import_log_${fts}.txt`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch(_) {}
}

// ══════════════════════════════════════════════════════════════
// [9] FILE INPUT HANDLERS
// ══════════════════════════════════════════════════════════════

function openImportModal() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      _doImportParse(wb, file.name);
    } catch (err) {
      toast('❌ Không đọc được file Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}
