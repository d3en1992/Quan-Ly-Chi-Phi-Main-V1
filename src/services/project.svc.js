// ══════════════════════════════════════════════════════════════
// src/services/project.svc.js — Project Service (Pure Logic)
// Prompt 4 — Bốc từ projects.js + tienich.js
// KHÔNG chứa UI/DOM — chỉ logic nghiệp vụ về công trình
// ══════════════════════════════════════════════════════════════

// ── Constants ───────────────────────────────────────────────
export const PROJECT_STATUS = {
  planning: 'Chuẩn bị thi công',
  active: 'Đang thi công',
  completed: 'Đã hoàn thành (chưa quyết toán)',
  closed: 'Đã quyết toán'
};

export const PROJECT_COMPANY = Object.freeze({
  id: 'COMPANY', name: 'CÔNG TY', status: 'active',
  startDate: null, endDate: null, note: 'Chi phí chung của công ty',
  createdAt: 0, updatedAt: 0
});

const _PROJ_DATE_RE = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{2}-\d{2}-\d{4}$/;
const _VALID_STATUSES = new Set(['planning', 'active', 'completed', 'closed']);
const _PROJ_VALID_TYPES = new Set(['CT', 'SC', 'OTHER']);
export const _PROJ_FACTORS = { CT: 1.6, SC: 1.0, OTHER: 1.2 };

// ── Helpers ─────────────────────────────────────────────────

/** Xác định loại CT theo tên: CT/SC/OTHER */
export function projTypeByName(name) {
  if (!name) return 'OTHER';
  const n = name.trim().toUpperCase();
  if (n.startsWith('CT')) return 'CT';
  if (n.startsWith('SC')) return 'SC';
  return 'OTHER';
}

/** Kiểm tra project hợp lệ */
export function isValidProject(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.deletedAt) return false;
  if (!p.id || typeof p.id !== 'string' || !p.id.trim()) return false;
  if (!p.name || typeof p.name !== 'string' || !p.name.trim()) return false;
  if (_PROJ_DATE_RE.test(p.name.trim())) return false;
  if (!_VALID_STATUSES.has(p.status)) return false;
  return true;
}

/** Tìm projectId theo tên (exact → accent-insensitive) */
export function findProjectIdByName(name, projects) {
  if (!name) return null;
  const n = name.trim();
  if (!n) return null;
  if (n === 'CÔNG TY' || n === 'KHO TỔNG') return 'COMPANY';
  const exact = projects.find(p => !p.deletedAt && p.name === n);
  if (exact) return exact.id;
  const _norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const nNorm = _norm(n);
  const fuzzy = projects.find(p => !p.deletedAt && _norm(p.name) === nNorm);
  return fuzzy ? fuzzy.id : null;
}

/** Tìm project theo ID */
export function getProjectById(id, projects) {
  if (id === 'COMPANY') return PROJECT_COMPANY;
  return projects.find(p => p.id === id && !p.deletedAt) || null;
}

/** Resolve tên CT từ record (projectId → name, fallback congtrinh) */
export function resolveProjectName(record, projects) {
  if (record && record.projectId) {
    const p = getProjectById(record.projectId, projects);
    if (p) return p.name;
  }
  return (record && (record.congtrinh || record.ct)) || '';
}

/** Kiểm tra record thuộc CÔNG TY */
export function isCompanyRecord(r) { return r && r.projectId === 'COMPANY'; }

/** Kiểm tra project thuộc năm */
export function isProjectInYear(p, year) {
  if (!year || year === 0) return true;
  if (!p || !p.startDate) return false;
  return p.startDate.startsWith(String(year));
}

/** Số ngày thi công trong năm */
export function getProjectDays(p, activeYear) {
  if (!p || !p.startDate) return 1;
  const _year = (activeYear && activeYear > 0) ? activeYear : 0;
  if (_year === 0) {
    const endMs = p.endDate ? new Date(p.endDate).getTime() : Date.now();
    const days = Math.ceil((endMs - new Date(p.startDate).getTime()) / 86400000);
    return days <= 0 ? 1 : days;
  }
  const yearStart = new Date(_year + '-01-01T00:00:00').getTime();
  const yearEnd = new Date(_year + '-12-31T23:59:59').getTime();
  const projStart = new Date(p.startDate + 'T00:00:00').getTime();
  const projEnd = p.endDate ? new Date(p.endDate + 'T23:59:59').getTime() : Date.now();
  if (projEnd < yearStart || projStart > yearEnd) return 0;
  const overlapStart = Math.max(projStart, yearStart);
  const overlapEnd = Math.min(projEnd, yearEnd);
  const days = Math.ceil((overlapEnd - overlapStart) / 86400000);
  return days <= 0 ? 1 : days;
}

/** Hệ số phân bổ theo loại CT */
export function getProjectFactor(p) {
  return _PROJ_FACTORS[projTypeByName(p && p.name)] || 1.2;
}

/** Trọng số = days × factor */
export function getProjectWeight(p, activeYear) {
  return getProjectDays(p, activeYear) * getProjectFactor(p);
}

/** Lấy startDate tự động từ cc record sớm nhất */
export function getProjectAutoStartDate(projectId, ccData) {
  if (!projectId || !ccData) return null;
  const records = ccData.filter(r => !r.deletedAt && r.fromDate && r.projectId === projectId);
  if (!records.length) return null;
  const earliest = records.reduce((min, r) => r.fromDate < min ? r.fromDate : min, records[0].fromDate);
  const d = new Date(earliest + 'T00:00:00');
  const day = d.getDay();
  const diffToMonday = day === 0 ? 1 : day === 1 ? 0 : -(day - 1);
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

/** Sắp xếp projects theo status → prefix → alpha */
export function getSortedProjects(projects) {
  const statusOrder = { planning: 1, active: 2, completed: 3, closed: 4 };
  const getPrefixOrder = name => {
    const n = (name || '').trim().toUpperCase();
    if (n.startsWith('CT')) return 1;
    if (n.startsWith('SC')) return 2;
    return 3;
  };
  return projects.filter(isValidProject).sort((a, b) => {
    const s1 = statusOrder[a.status] || 99;
    const s2 = statusOrder[b.status] || 99;
    if (s1 !== s2) return s1 - s2;
    const p1 = getPrefixOrder(a.name);
    const p2 = getPrefixOrder(b.name);
    if (p1 !== p2) return p1 - p2;
    return (a.name || '').localeCompare(b.name || '', 'vi');
  });
}

/**
 * Kiểm tra CT có hoạt động trong năm đang chọn
 * (year-filter logic bốc từ tienich.js)
 */
export function ctInActiveYear(name, activeYears, cats, invoices, ccData, ungRecords) {
  if (!activeYears || activeYears.size === 0) return true;
  if (!name) return false;
  const yr = cats.congTrinhYears && cats.congTrinhYears[name];
  if (yr && activeYears.has(yr)) return true;
  return entityInYear(name, 'ct', activeYears, invoices, ccData, ungRecords, null);
}

/** Lọc mềm: entity có phát sinh trong năm? */
export function entityInYear(name, type, activeYears, invoices, ccData, ungRecords, tbData) {
  if (!activeYears || activeYears.size === 0) return true;
  if (!name) return false;
  const inYear = dateStr => {
    if (!dateStr) return false;
    const yr = parseInt(dateStr.split('-')[0]);
    return activeYears.has(yr);
  };
  if (type === 'ct') {
    return (invoices || []).some(i => !i.deletedAt && inYear(i.ngay) && i.congtrinh === name)
      || (ccData || []).some(w => !w.deletedAt && inYear(w.fromDate) && w.ct === name)
      || (ungRecords || []).some(r => !r.deletedAt && inYear(r.ngay) && r.congtrinh === name);
  }
  if (type === 'cn') {
    return (ccData || []).some(w => !w.deletedAt && inYear(w.fromDate)
      && (w.workers || []).some(wk => wk.name === name));
  }
  if (type === 'tb') {
    return (tbData || []).some(r => r.ten === name && (
      r.tinhtrang === 'Đang hoạt động'
      || entityInYear(r.ct, 'ct', activeYears, invoices, ccData, ungRecords, null)
    ));
  }
  return true;
}

/** Rebuild cats.congTrinh từ projects (derived data) */
export function rebuildCatCTFromProjects(projects, cats) {
  const projNames = projects.filter(isValidProject).map(p => p.name);
  const deduped = [...new Set(projNames)];
  const newYears = { ...(cats.congTrinhYears || {}) };
  projects.filter(isValidProject).forEach(p => {
    if (p.startDate) {
      const yr = parseInt(p.startDate.split('-')[0]);
      if (yr > 2000 && yr < 2100) newYears[p.name] = yr;
    }
  });
  return { congTrinh: deduped, congTrinhYears: newYears };
}

// ── HĐ lookup helpers (from core.js) ────────────────────────

/**
 * Tra cứu hợp đồng backward-compat: projectId → tên CT → fallback
 */
export function hdLookup(projectIdOrName) {
  const hd = window.hopDongData;
  if (!projectIdOrName || !hd) return null;
  const direct = hd[projectIdOrName];
  if (direct && !direct.deletedAt) return direct;
  const projs = window.projects || [];
  const p = projs.find(proj => proj.name === projectIdOrName && !proj.deletedAt);
  if (p && hd[p.id] && !hd[p.id].deletedAt) return hd[p.id];
  const p2 = projs.find(proj => proj.id === projectIdOrName && !proj.deletedAt);
  if (p2 && hd[p2.name] && !hd[p2.name].deletedAt) return hd[p2.name];
  return null;
}

/**
 * Key chính xác trong hopDongData cho project
 */
export function hdKeyOf(project) {
  const hd = window.hopDongData;
  if (!project || !hd) return null;
  if (project.id && hd[project.id]) return project.id;
  if (project.name && hd[project.name]) return project.name;
  return null;
}

// ── Global project lookup wrappers (from core.js) ───────────

function _getProjectByIdGlobal(id) {
  if (typeof window.getProjectById === 'function') return window.getProjectById(id);
  const projs = window.projects || [];
  return getProjectById(id, projs);
}

function _getProjectNameByIdGlobal(id) {
  if (!id) return '';
  if (id === 'COMPANY') return 'CÔNG TY';
  const p = _getProjectByIdGlobal(id);
  return p ? p.name : '';
}

function _getProjectIdByNameGlobal(name) {
  if (typeof window.findProjectIdByName === 'function') return window.findProjectIdByName(name);
  const projs = window.projects || [];
  return findProjectIdByName(name, projs);
}

function _resolveCtNameGlobal(record) {
  if (!record) return '';
  if (record.projectId) {
    const n = _getProjectNameByIdGlobal(record.projectId);
    if (n) return n;
  }
  return record.ct || record.congtrinh || '';
}

// ══════════════════════════════════════════════════════════════
// 🔌 WINDOW BRIDGES — direct globals cho legacy scripts
// ══════════════════════════════════════════════════════════════
window._projectSvc = {
  PROJECT_STATUS, PROJECT_COMPANY,
  projTypeByName, isValidProject, findProjectIdByName, getProjectById,
  resolveProjectName, isCompanyRecord, isProjectInYear,
  getProjectDays, getProjectFactor, getProjectWeight,
  getProjectAutoStartDate, getSortedProjects,
  ctInActiveYear, entityInYear, rebuildCatCTFromProjects,
  hdLookup, hdKeyOf,
};

// Direct globals
window._hdLookup = hdLookup;
window._hdKeyOf = hdKeyOf;
window._getProjectById = _getProjectByIdGlobal;
window._getProjectNameById = _getProjectNameByIdGlobal;
window._getProjectIdByName = _getProjectIdByNameGlobal;
window._resolveCtName = _resolveCtNameGlobal;
window.getAllProjects = () => getSortedProjects(window.projects || []); // <-- Dòng bạn vừa thêm vào
window.getProjectById = (id) => getProjectById(id, window.projects || []);
window.getProjectNameById = (id) => { const p = getProjectById(id, window.projects || []); return p ? p.name : ''; };
window.findProjectIdByName = (name) => findProjectIdByName(name, window.projects || []);
window.resolveProjectName = (record) => resolveProjectName(record, window.projects || []);
window.getProjectAutoStartDate = getProjectAutoStartDate;
