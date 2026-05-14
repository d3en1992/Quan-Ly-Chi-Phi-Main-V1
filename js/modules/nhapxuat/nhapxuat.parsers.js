// nhapxuat.parsers.js — Helper parse/normalize + parser từng sheet Excel
// Load order: sau danhmuc.tools.js, trước nhapxuat.import.js

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] SHARED HELPERS
// ══════════════════════════════════════════════════════════════

// Chuẩn hoá để SO SÁNH (không dùng làm display name)
function _normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 /]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse ngày → 'YYYY-MM-DD' hoặc null
function _parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 25569 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

// Parse số — STRICT: chỉ số nguyên/thập phân + dấu phân cách locale
// KHÔNG chấp nhận "1tr", "500k" hay đơn vị tiền tệ
function _pNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  const dots   = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g)  || []).length;
  if (dots   > 1) s = s.replace(/\./g, '');   // 1.000.000 → 1000000
  if (commas > 1) s = s.replace(/,/g, '');    // 1,000,000 → 1000000
  s = s.replace(',', '.');                     // 1,5 → 1.5
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function _str(v) { return v ? String(v).trim() : ''; }
function _sheetRows(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); }

// Ký tự tiếng Việt có dấu
function _hasDiacritics(s) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(String(s || ''));
}

// Dedup mảng tên: ưu tiên giữ bản có dấu tiếng Việt
function _deduplicateCatNames(names) {
  const map = new Map();
  (names || []).forEach(name => {
    if (!name || !String(name).trim()) return;
    const t = String(name).trim();
    const n = _normStr(t);
    if (!n) return;
    const ex = map.get(n);
    if (!ex || (!_hasDiacritics(ex) && _hasDiacritics(t))) map.set(n, t);
  });
  return [...map.values()];
}

// Xây canonical map: normStr → preferred display name (ưu tiên dấu TV)
function _buildCanonMap(names) {
  const map = new Map();
  (names || []).forEach(name => {
    if (!name || !String(name).trim()) return;
    const t = String(name).trim();
    const n = _normStr(t);
    if (!n) return;
    const ex = map.get(n);
    if (!ex || (!_hasDiacritics(ex) && _hasDiacritics(t))) map.set(n, t);
  });
  return map;
}

// Ngày trong tuần từ dateStr 'YYYY-MM-DD': 0=Chủ Nhật, 1=T2…
function _dayOfWeek(dateStr) {
  if (!dateStr) return -1;
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return -1;
  return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
}

// Issue 6: Kiểm tra dòng trống thực sự (tất cả cells đều rỗng)
function _isEmptyRow(row) {
  return !row || row.every(cell =>
    cell === null || cell === undefined || String(cell).trim() === ''
  );
}

// Issue 5: Chuẩn hoá tên danh mục theo loại trước khi insert
function _formatCatName(type, name) {
  if (!name) return name;
  const t = String(name).trim();
  if (['ncc', 'nguoi', 'tp'].includes(type)) {
    return t.toUpperCase();
  }
  if (['loai', 'tb'].includes(type)) {
    // Title Case: chữ đầu mỗi từ viết hoa
    return t.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
  }
  return t; // 'ct', 'cn' — giữ nguyên
}

// Issue 2: Dedup trong cùng file import (trước khi check vs DB)
function _markDuplicateInBatch(records, keyFn) {
  const seen = new Set();
  const kept = [], duplicates = [];
  (records || []).forEach(r => {
    const k = keyFn(r);
    if (seen.has(k)) {
      duplicates.push(r);
    } else {
      seen.add(k);
      kept.push(r);
    }
  });
  return { kept, duplicates };
}

// ══════════════════════════════════════════════════════════════
// [2] CATALOG LOOKUP — Build normalized sets từ cats + projects hiện tại
// ══════════════════════════════════════════════════════════════

function _makeCatLookup() {
  const _set = arr => new Set((arr || []).filter(Boolean).map(v => _normStr(String(v))));

  // projMap: normStr → project {id, name}
  const projMap = new Map();
  (typeof projects !== 'undefined' ? projects : [])
    .filter(p => !p.deletedAt && p.name)
    .forEach(p => projMap.set(_normStr(p.name), p));

  // Canonical map: normStr → best display name
  const allDisplayNames = [
    ...((typeof projects !== 'undefined' ? projects : []).filter(p => !p.deletedAt).map(p => p.name)),
    ...(cats.loaiChiPhi || []),
    ...(cats.nhaCungCap || []),
    ...(cats.nguoiTH    || []),
    ...(cats.thauPhu    || []),
    ...(cats.congNhan   || []),
    ...(cats.tbTen      || []),
  ];
  const canonMap = _buildCanonMap(allDisplayNames);
  const canon = s => {
    if (!s) return s;
    return canonMap.get(_normStr(String(s))) || String(s).trim();
  };

  return {
    loai:  _set(cats.loaiChiPhi),
    ncc:   _set(cats.nhaCungCap),
    nguoi: _set(cats.nguoiTH),
    tp:    _set(cats.thauPhu),
    cn:    _set(cats.congNhan),
    tb:    _set(cats.tbTen),
    proj:  projMap,
    canonMap,
    canon,
  };
}

// Lookup mở rộng: existing cats + incoming DanhMuc + optional extra CT names
// Không ghi DB — chỉ dùng trong quá trình parse (truớc khi user confirm)
function _makeCatLookupWithExtra(catsParsed, extraCTs) {
  const _set = arr => new Set((arr || []).filter(Boolean).map(v => _normStr(String(v))));
  const inc = catsParsed || {};

  const merged = {
    loai:  [...(cats.loaiChiPhi || []), ...(inc.loai  || [])],
    ncc:   [...(cats.nhaCungCap || []), ...(inc.ncc   || [])],
    nguoi: [...(cats.nguoiTH    || []), ...(inc.nguoi || [])],
    tp:    [...(cats.thauPhu    || []), ...(inc.tp    || [])],
    cn:    [...(cats.congNhan   || []), ...(inc.cn    || [])],
    tb:    [...(cats.tbTen      || []), ...(inc.tb    || [])],
  };

  // Project map: existing (real) + incoming ct + extraCTs (provisional)
  const projMap = new Map();
  (typeof projects !== 'undefined' ? projects : [])
    .filter(p => !p.deletedAt && p.name)
    .forEach(p => projMap.set(_normStr(p.name), p));

  [...(inc.ct || []), ...(extraCTs || [])].forEach(name => {
    if (!name) return;
    const t = String(name).trim();
    const n = _normStr(t);
    if (t && !projMap.has(n)) {
      // Provisional entry — id thật sẽ được gán trong _resolveProvisionalProjectIds()
      projMap.set(n, { id: '_prov_' + n, name: t, _provisional: true });
    }
  });

  const allNames = [
    ...(typeof projects !== 'undefined' ? projects : []).filter(p => !p.deletedAt).map(p => p.name),
    ...merged.loai, ...merged.ncc, ...merged.nguoi, ...merged.tp, ...merged.cn, ...merged.tb,
  ];
  const canonMap = _buildCanonMap(allNames);
  const canon = s => s ? (canonMap.get(_normStr(String(s))) || String(s).trim()) : s;

  return {
    loai:  _set(merged.loai),
    ncc:   _set(merged.ncc),
    nguoi: _set(merged.nguoi),
    tp:    _set(merged.tp),
    cn:    _set(merged.cn),
    tb:    _set(merged.tb),
    proj:  projMap,
    canonMap,
    canon,
  };
}

// Sau khi DanhMuc được apply (projects thật đã tạo), thay _prov_* IDs bằng real IDs
function _resolveProvisionalProjectIds(session, lookup) {
  const _fix = (r, ctField) => {
    if (!r.projectId || !String(r.projectId).startsWith('_prov_')) return;
    const name = r[ctField] || r.congtrinh || r.ct || '';
    const real  = name ? lookup.proj.get(_normStr(name)) : null;
    if (real && !real._provisional) {
      r.projectId = real.id;
      if ('ctPid' in r) r.ctPid = real.id;
    }
  };
  ['invQ','invD','ung','tb','thu','tp'].forEach(key => {
    if (session.sheets[key]) session.sheets[key].records.forEach(r => _fix(r, 'congtrinh'));
  });
  if (session.sheets.cc) {
    session.sheets.cc.records.forEach(r => _fix(r, 'ct'));
  }
}

// Error object chuẩn
function _mkErr(sheet, row, field, value, message) {
  return { sheet, row, field, value: String(value ?? ''), message };
}

// Format error để hiển thị trong UI và log
function _fmtErr(e) {
  return `[Dòng ${e.row}, ${e.field}: "${e.value}"] ${e.message}`;
}

// ══════════════════════════════════════════════════════════════
// [3] SHEET PARSERS — đọc theo fixed column index
// ══════════════════════════════════════════════════════════════

// ── Sheet 1: HoaDonNhanh ─────────────────────────────────────
// Col: NGÀY(0) · CÔNG TRÌNH(1) · LOẠI CHI PHÍ(2) · NỘI DUNG(3)
//      SỐ TIỀN(4) · NGƯỜI THỰC HIỆN(5) · NHÀ CUNG CẤP(6) · SỐ HĐ(7) · ID(8)
function parseSheet1(rows, lookup) {
  const records = [], errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ngay       = _parseDate(row[0]);
    const ctRaw      = _str(row[1]);
    const loaiRaw    = _str(row[2]);
    const nd         = _str(row[3]);
    const tienRaw    = row[4];
    const nguoiRaw   = _str(row[5]);
    const nccRaw     = _str(row[6]);
    const soHD       = _str(row[7]);
    const existingId = _str(row[8]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'ngay', row[0], 'Ngày không hợp lệ (cần YYYY-MM-DD)'));

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (!loaiRaw) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'loai', '', 'Loại chi phí không được để trống'));
    } else if (!lookup.loai.has(_normStr(loaiRaw))) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'loai', loaiRaw, 'Loại chi phí không tồn tại trong danh mục'));
    }

    const tien = _pNum(tienRaw);
    if (tien === null || tien <= 0) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'tien', tienRaw, 'Số tiền phải là số dương'));
    }

    if (nguoiRaw && !lookup.nguoi.has(_normStr(nguoiRaw))) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'nguoi', nguoiRaw, 'Người thực hiện không tồn tại trong danh mục'));
    }
    if (nccRaw && !lookup.ncc.has(_normStr(nccRaw))) {
      rowErrs.push(_mkErr('HoaDonNhanh', i+1, 'ncc', nccRaw, 'Nhà cung cấp không tồn tại trong danh mục'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      id:        existingId || crypto.randomUUID(),
      ngay,
      congtrinh: proj.name,
      projectId: proj.id,
      loai:      lookup.canon(loaiRaw),
      nd,
      tien:      Math.round(tien),
      nguoi:     nguoiRaw ? lookup.canon(nguoiRaw) : '',
      ncc:       nccRaw   ? lookup.canon(nccRaw)   : '',
      soHD,
      source:    'excel_invQ',
      createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
    });
  }
  return { records, errors };
}

// ── Sheet 2: HoaDonChiTiet ───────────────────────────────────
// Col: NGÀY(0) · CÔNG TRÌNH(1) · LOẠI CHI PHÍ(2) · NỘI DUNG(3) · ĐVT(4)
//      SỐ LƯỢNG(5) · ĐƠN GIÁ(6) · THÀNH TIỀN(7) · NGƯỜI TH(8) · NHÀ CC(9)
// Gộp theo groupKey = ngay+CT+loai+ncc → 1 invoice nhiều items
function parseSheet2(rows, lookup) {
  const groups = new Map(); // groupKey → { header, items }
  const errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ngay        = _parseDate(row[0]);
    const ctRaw       = _str(row[1]);
    const loaiRaw     = _str(row[2]);
    const nd          = _str(row[3]);
    const dvt         = _str(row[4]);
    const slRaw       = row[5];
    const donGiaRaw   = row[6];
    const thanhTienRaw = row[7];
    const nguoiRaw    = _str(row[8]);
    const nccRaw      = _str(row[9]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'ngay', row[0], 'Ngày không hợp lệ'));

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (!loaiRaw) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'loai', '', 'Loại chi phí không được để trống'));
    } else if (!lookup.loai.has(_normStr(loaiRaw))) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'loai', loaiRaw, 'Loại chi phí không tồn tại trong danh mục'));
    }

    if (nguoiRaw && !lookup.nguoi.has(_normStr(nguoiRaw))) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'nguoi', nguoiRaw, 'Người thực hiện không tồn tại trong danh mục'));
    }
    if (nccRaw && !lookup.ncc.has(_normStr(nccRaw))) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'ncc', nccRaw, 'Nhà cung cấp không tồn tại trong danh mục'));
    }

    const sl        = _pNum(slRaw)        ?? 1;
    const donGia    = _pNum(donGiaRaw)    ?? 0;
    const thanhTien = _pNum(thanhTienRaw);
    const computed  = thanhTien !== null ? Math.round(thanhTien) : Math.round(sl * donGia);

    if (computed <= 0) {
      rowErrs.push(_mkErr('HoaDonChiTiet', i+1, 'thanhtien', thanhTienRaw, 'Thành tiền phải là số dương'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    const groupKey = `${ngay}|${_normStr(ctRaw)}|${_normStr(loaiRaw)}|${_normStr(nccRaw)}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        header: {
          id:        crypto.randomUUID(),
          ngay,
          congtrinh: proj.name,
          projectId: proj.id,
          loai:      lookup.canon(loaiRaw),
          nguoi:     nguoiRaw ? lookup.canon(nguoiRaw) : '',
          ncc:       nccRaw   ? lookup.canon(nccRaw)   : '',
          source:    'detail',
          createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
        },
        items: [],
      });
    }
    groups.get(groupKey).items.push({
      ten: nd, dv: dvt,
      sl,
      dongia:    Math.round(donGia),
      thanhtien: computed,
    });
  }

  const records = [];
  groups.forEach(({ header, items }) => {
    header.items     = items;
    header.thanhtien = items.reduce((s, it) => s + it.thanhtien, 0);
    header.tien      = header.thanhtien;
    header.nd        = buildNDFromItems(items);
    records.push(header);
  });
  return { records, errors };
}

// ── Sheet 3: ChamCong ─────────────────────────────────────────
// Col: NGÀY ĐẦU TUẦN(0) · CÔNG TRÌNH(1) · TÊN CN(2) · VAI TRÒ(3) ·
//      LƯƠNG NGÀY(4) · PHỤ CẤP(5) · HD MUA LẺ(6) ·
//      CN(7)·T2(8)·T3(9)·T4(10)·T5(11)·T6(12)·T7(13) · GHI CHÚ(14)
// Gộp theo (fromDate, ct) → 1 tuần nhiều workers
// Đặc quyền: worker chưa có trong CN catalog → tự thêm vào
function _addDays(iso, days){
  const [y,m,d]=iso.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+days);
  const yyyy=dt.getFullYear();
  const mm=String(dt.getMonth()+1).padStart(2,'0');
  const dd=String(dt.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
function parseSheet3(rows, lookup) {
  const groups = new Map(); // `${fromDate}|${normCt}` → { fromDate, ct, projectId, workers }
  const errors = [];
  const cnSet  = new Set(lookup.cn); // clone để track thêm mới

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const fromDate = _parseDate(row[0]);
    const ctRaw    = _str(row[1]);
    const nameRaw  = _str(row[2]);
    const role     = _str(row[3]);
    const luong    = _pNum(row[4])  ?? 0;
    const phucap   = _pNum(row[5])  ?? 0;
    const hdmuale  = _pNum(row[6])  ?? 0;
    const d        = [7,8,9,10,11,12,13].map(ci => _pNum(row[ci]) ?? 0);
    const nd       = _str(row[14]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!fromDate) {
      rowErrs.push(_mkErr('ChamCong', i+1, 'fromDate', row[0], 'Ngày đầu tuần không hợp lệ'));
    } else if (_dayOfWeek(fromDate) !== 0) {
      rowErrs.push(_mkErr('ChamCong', i+1, 'fromDate', fromDate, 'Ngày đầu tuần phải là Chủ nhật'));
    }

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('ChamCong', i+1, 'ct', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('ChamCong', i+1, 'ct', ctRaw, 'Công trình không tồn tại trong danh mục'));
    }

    if (!nameRaw) {
      rowErrs.push(_mkErr('ChamCong', i+1, 'name', '', 'Tên công nhân không được để trống'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    // Công nhân chưa có → tự thêm (đặc quyền CC sheet)
    const canonName = lookup.canon(nameRaw);
    if (!cnSet.has(_normStr(canonName))) {
      cnSet.add(_normStr(canonName));
    }

    const groupKey = `${fromDate}|${_normStr(ctRaw)}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { fromDate, ct: proj.name, projectId: proj.id, ctPid: proj.id, workers: [] });
    }
    const grp = groups.get(groupKey);
    const existingWorker = grp.workers.find(w => _normStr(w.name) === _normStr(canonName));
    if (existingWorker) {
      // Cùng CN, cùng tuần — kiểm tra role conflict (Issue 7)
      if (existingWorker.role && role && existingWorker.role !== role) {
        existingWorker.role = null; // conflict → xoá role
      }
      // Không thêm worker trùng
    } else {
      grp.workers.push({
        name: canonName, role,
        luong: Math.round(luong), phucap: Math.round(phucap), hdmuale: Math.round(hdmuale),
        d, nd,
      });
    }
  }

  // Collect new CN names (trong cnSet nhưng không có trong lookup.cn gốc)
  const newCNs = [];
  cnSet.forEach(norm => {
    if (!lookup.cn.has(norm)) {
      // Find display name from groups
      groups.forEach(g => g.workers.forEach(w => {
        if (_normStr(w.name) === norm && !newCNs.includes(w.name)) newCNs.push(w.name);
      }));
    }
  });

  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';
  const records = [...groups.values()].map(g => ({
    id:        crypto.randomUUID(),
    fromDate:  g.fromDate,
    toDate:    _addDays(g.fromDate, 6),
    ct:        g.ct,
    projectId: g.projectId,
    ctPid:     g.projectId, // mirror — luôn đồng bộ với projectId
    workers:   g.workers,
    createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
  }));

  return { records, errors, newCNs };
}

// ── Sheet 4: TienUng ──────────────────────────────────────────
// Col: NGÀY(0) · ĐỐI TƯỢNG(1) · TÊN(2) · CÔNG TRÌNH(3) · SỐ TIỀN(4) · NỘI DUNG(5) · ID(6)
// ĐỐI TƯỢNG: "Thầu phụ" → loai='thauphu', "Công nhân" → loai='congnhan'
function parseSheet4(rows, lookup) {
  const records = [], errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row        = rows[i];
    const ngay       = _parseDate(row[0]);
    const doiTuong   = _str(row[1]);
    const tenRaw     = _str(row[2]);
    const ctRaw      = _str(row[3]);
    const tienRaw    = row[4];
    const nd         = _str(row[5]);
    const existingId = _str(row[6]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('TienUng', i+1, 'ngay', row[0], 'Ngày không hợp lệ'));

    const dtNorm = _normStr(doiTuong);
    let loai = 'thauphu';
    if (dtNorm.includes('nha cung cap') || dtNorm.includes('nhacungcap')) {
      loai = 'nhacungcap';
    } else if (dtNorm.includes('thau phu') || dtNorm.includes('thauphu')) {
      loai = 'thauphu';
    } else if (doiTuong) {
      rowErrs.push(_mkErr('TienUng', i+1, 'loai', doiTuong, 'Đối tượng phải là "Thầu phụ" hoặc "Nhà cung cấp"'));
    }

    if (!tenRaw) {
      rowErrs.push(_mkErr('TienUng', i+1, 'tp', '', 'Tên đối tượng không được để trống'));
    } else {
      const catSet = loai === 'nhacungcap' ? lookup.ncc : lookup.tp;
      const label  = loai === 'nhacungcap' ? 'Nhà cung cấp' : 'Thầu phụ';
      if (!catSet.has(_normStr(tenRaw))) {
        rowErrs.push(_mkErr('TienUng', i+1, 'tp', tenRaw, `${label} không tồn tại trong danh mục`));
      }
    }

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('TienUng', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('TienUng', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    const tien = _pNum(tienRaw);
    if (tien === null || tien <= 0) {
      rowErrs.push(_mkErr('TienUng', i+1, 'tien', tienRaw, 'Số tiền phải là số dương'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      id:        existingId || crypto.randomUUID(),
      ngay,
      loai,
      tp:        lookup.canon(tenRaw),
      congtrinh: proj.name,
      projectId: proj.id,
      tien:      Math.round(tien),
      nd,
      createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
    });
  }
  return { records, errors };
}

// ── Sheet 5: ThietBi ──────────────────────────────────────────
// Col: NGÀY(0) · CÔNG TRÌNH(1) · TÊN THIẾT BỊ(2) · SỐ LƯỢNG(3) · TÌNH TRẠNG(4) · GHI CHÚ(5) · ID(6)
function parseSheet5(rows, lookup) {
  const records = [], errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row        = rows[i];
    const ngay       = _parseDate(row[0]);
    const ctRaw      = _str(row[1]);
    const tenRaw     = _str(row[2]);
    const slRaw      = row[3];
    const tinhtrang  = _str(row[4]);
    const ghichu     = _str(row[5]);
    const existingId = _str(row[6]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('ThietBi', i+1, 'ngay', row[0], 'Ngày không hợp lệ'));

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('ThietBi', i+1, 'ct', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('ThietBi', i+1, 'ct', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (!tenRaw) {
      rowErrs.push(_mkErr('ThietBi', i+1, 'ten', '', 'Tên thiết bị không được để trống'));
    } else if (!lookup.tb.has(_normStr(tenRaw))) {
      rowErrs.push(_mkErr('ThietBi', i+1, 'ten', tenRaw, 'Thiết bị không tồn tại trong danh mục'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      id:        existingId || crypto.randomUUID(),
      ngay,
      ct:        proj.name,
      projectId: proj.id,
      ten:       lookup.canon(tenRaw),
      soluong:   _pNum(slRaw) ?? 1,
      tinhtrang,
      ghichu,
      createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
    });
  }
  return { records, errors };
}

// ── Sheet 6: DanhMuc ──────────────────────────────────────────
// Col: LOẠI DANH MỤC(0) · TÊN(1) · EXTRA(2: vai trò CN)
// DUY NHẤT được TẠO MỚI items — không validate, chỉ insert mới
const _DANHMUC_GROUP_MAP = {
  'cong trinh':            'ct',
  'loai chi phi':          'loai',
  'nha cung cap':          'ncc',
  'nguoi thuc hien':       'nguoi',
  'thau phu':              'tp',
  'thau phu / tp':         'tp',
  'thau phu tp':           'tp',
  'cong nhan':             'cn',
  'may thiet bi thi cong': 'tb',
  'thiet bi thi cong':     'tb',
  'thiet bi':              'tb',
  'may thiet bi':          'tb',
};

function parseSheet6(rows) {
  const result = { ct: [], loai: [], ncc: [], nguoi: [], tp: [], cn: [], tb: [], cnRoles: {} };
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const groupRaw = _str(row[0]);
    const nameRaw  = _str(row[1]);
    const extra    = _str(row[2]);

    if (!groupRaw && !nameRaw) continue;
    if (!nameRaw) continue;

    const groupNorm = _normStr(groupRaw);
    let field = null;
    for (const [key, val] of Object.entries(_DANHMUC_GROUP_MAP)) {
      if (groupNorm === key || groupNorm.includes(key)) { field = val; break; }
    }

    if (!field) {
      errors.push(_mkErr('DanhMuc', i+1, 'loai', groupRaw, 'Loại danh mục không nhận dạng được'));
      continue;
    }

    const formattedName = _formatCatName(field, nameRaw);
    result[field].push(formattedName);
    if (field === 'cn' && extra) result.cnRoles[formattedName] = extra;
  }

  return { parsed: result, errors };
}

// ── Sheet 7: HopDongChinh ─────────────────────────────────────
// Col: NGÀY(0) · CÔNG TRÌNH(1) · NGƯỜI THỰC HIỆN(2) ·
//      GIÁ TRỊ HĐ CHÍNH(3) · GIÁ TRỊ HĐ PHỤ(4) · PHÁT SINH(5) · GHI CHÚ(6)
function parseSheet7(rows, lookup) {
  const records = [], errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const ngay     = _parseDate(row[0]);
    const ctRaw    = _str(row[1]);
    const nguoiRaw = _str(row[2]);
    const giaTri   = _pNum(row[3]) ?? 0;
    const giaTriphu = _pNum(row[4]) ?? 0;
    const phatSinh = _pNum(row[5]) ?? 0;
    const ghichu   = _str(row[6]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('HopDongChinh', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('HopDongChinh', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (nguoiRaw && !lookup.nguoi.has(_normStr(nguoiRaw))) {
      rowErrs.push(_mkErr('HopDongChinh', i+1, 'nguoi', nguoiRaw, 'Người thực hiện không tồn tại trong danh mục'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      ct:        proj.name,
      projectId: proj.id,
      ngay:      ngay || today(),
      nguoi:     nguoiRaw ? lookup.canon(nguoiRaw) : '',
      giaTri:    Math.round(giaTri),
      giaTriphu: Math.round(giaTriphu),
      phatSinh:  Math.round(phatSinh),
      ghichu,
    });
  }
  return { records, errors };
}

// ── Sheet 8: ThuTien ──────────────────────────────────────────
// Col: NGÀY(0) · NGƯỜI THỰC HIỆN(1) · CÔNG TRÌNH(2) · SỐ TIỀN(3) · NỘI DUNG(4) · ID(5)
function parseSheet8(rows, lookup) {
  const records = [], errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row        = rows[i];
    const ngay       = _parseDate(row[0]);
    const nguoiRaw   = _str(row[1]);
    const ctRaw      = _str(row[2]);
    const tienRaw    = row[3];
    const nd         = _str(row[4]);
    const existingId = _str(row[5]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('ThuTien', i+1, 'ngay', row[0], 'Ngày không hợp lệ'));

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('ThuTien', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('ThuTien', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (nguoiRaw && !lookup.nguoi.has(_normStr(nguoiRaw))) {
      rowErrs.push(_mkErr('ThuTien', i+1, 'nguoi', nguoiRaw, 'Người thực hiện không tồn tại trong danh mục'));
    }

    const tien = _pNum(tienRaw);
    if (tien === null || tien <= 0) {
      rowErrs.push(_mkErr('ThuTien', i+1, 'tien', tienRaw, 'Số tiền phải là số dương'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      id:        existingId || crypto.randomUUID(),
      ngay,
      nguoi:     nguoiRaw ? lookup.canon(nguoiRaw) : '',
      congtrinh: proj.name,
      projectId: proj.id,
      tien:      Math.round(tien),
      nd,
      createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
    });
  }
  return { records, errors };
}

// ── Sheet 9: HopDongThauPhu ───────────────────────────────────
// Col: NGÀY(0) · CÔNG TRÌNH(1) · TÊN THẦU PHỤ(2) · GIÁ TRỊ HĐ(3) · PHÁT SINH(4) · NỘI DUNG(5) · ID(6)
function parseSheet9(rows, lookup) {
  const records = [], errors = [];
  const now = Date.now();
  const dev = typeof DEVICE_ID !== 'undefined' ? DEVICE_ID : '';

  for (let i = 1; i < rows.length; i++) {
    const row        = rows[i];
    const ngay       = _parseDate(row[0]);
    const ctRaw      = _str(row[1]);
    const tpRaw      = _str(row[2]);
    const giaTri     = _pNum(row[3]) ?? 0;
    const phatSinh   = _pNum(row[4]) ?? 0;
    const nd         = _str(row[5]);
    const existingId = _str(row[6]);

    if (_isEmptyRow(rows[i])) continue;

    const rowErrs = [];
    if (!ngay) rowErrs.push(_mkErr('HopDongThauPhu', i+1, 'ngay', row[0], 'Ngày không hợp lệ'));

    let proj = null;
    if (!ctRaw) {
      rowErrs.push(_mkErr('HopDongThauPhu', i+1, 'congtrinh', '', 'Công trình không được để trống'));
    } else {
      proj = lookup.proj.get(_normStr(ctRaw));
      if (!proj) rowErrs.push(_mkErr('HopDongThauPhu', i+1, 'congtrinh', ctRaw, 'Không tồn tại trong danh mục công trình'));
    }

    if (!tpRaw) {
      rowErrs.push(_mkErr('HopDongThauPhu', i+1, 'thauphu', '', 'Tên thầu phụ không được để trống'));
    } else if (!lookup.tp.has(_normStr(tpRaw))) {
      rowErrs.push(_mkErr('HopDongThauPhu', i+1, 'thauphu', tpRaw, 'Thầu phụ không tồn tại trong danh mục'));
    }

    if (rowErrs.length) { errors.push(...rowErrs); continue; }

    records.push({
      id:        existingId || crypto.randomUUID(),
      ngay,
      congtrinh: proj.name,
      projectId: proj.id,
      thauphu:   lookup.canon(tpRaw),
      giaTri:    Math.round(giaTri),
      phatSinh:  Math.round(phatSinh),
      nd,
      createdAt: now, updatedAt: now, deletedAt: null, deviceId: dev,
    });
  }
  return { records, errors };
}
