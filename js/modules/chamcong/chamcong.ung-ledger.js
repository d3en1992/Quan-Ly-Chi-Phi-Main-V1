// chamcong.ung-ledger.js — Sổ cái Ứng Công Nhân + popup Nhập Tiền Ứng nhanh
// Load order: sau chamcong.history-reports.js
//
// Tái sử dụng store ung_v1 (cùng nơi với Tiền Ứng Thầu Phụ/NCC) nhưng với loai='congnhan',
// trường tp = tên công nhân. Trang Tiền Ứng (nhapung) và Công Nợ chỉ lọc loai
// thauphu/nhacungcap nên các phiếu congnhan không bao giờ lẫn sang đó.
//
// Công nợ 1 thợ tại tuần [fromDate, toDate]:
//   nợ cũ mang sang = Σ ứng(ngay < fromDate) + Σ loanAmount lịch sử(tuần trước) − Σ tru(tuần trước)
//   ứng trong tuần   = Σ ứng(fromDate ≤ ngay ≤ toDate)
//   tổng nợ hiện tại = nợ cũ mang sang + ứng trong tuần
// (Các helper _calcDebtBefore / ccUngForWorkerInWeek / ccWorkerDebtNow nằm ở chamcong.core.js)

// ─── Bộ chọn tuần riêng cho sổ cái ───────────────────────────────────
let ccUngOffset = 0;

function ccUngGoToWeek(off) {
  ccUngOffset = off;
  const sunISO = ccSundayISO(off);
  const satISO = ccSaturdayISO(sunISO);
  const fromEl = document.getElementById("cc-ung-from");
  const toEl = document.getElementById("cc-ung-to");
  const lblEl = document.getElementById("cc-ung-week-label");
  if (fromEl) fromEl.value = sunISO;
  if (toEl) toEl.value = satISO;
  if (lblEl) lblEl.textContent = "Tuần: " + weekLabel(sunISO);
  renderCCUngLedger();
}
function ccUngPrevWeek() {
  ccUngGoToWeek(ccUngOffset - 1);
}
function ccUngNextWeek() {
  ccUngGoToWeek(ccUngOffset + 1);
}
function onCCUngFromChange() {
  const raw = document.getElementById("cc-ung-from").value;
  if (!raw) return;
  const sunISO = snapToSunday(raw);
  const satISO = ccSaturdayISO(sunISO);
  document.getElementById("cc-ung-from").value = sunISO;
  document.getElementById("cc-ung-to").value = satISO;
  document.getElementById("cc-ung-week-label").textContent =
    "Tuần: " + weekLabel(sunISO);
  // Tính lại offset so với tuần hiện tại
  const thisSun = ccSundayISO(0);
  const [ty, tm, td] = thisSun.split("-").map(Number);
  const [fy, fm, fd] = sunISO.split("-").map(Number);
  const diffMs = new Date(fy, fm - 1, fd) - new Date(ty, tm - 1, td);
  ccUngOffset = Math.round(diffMs / (7 * 86400000));
  renderCCUngLedger();
}

// ─── Render sổ cái ───────────────────────────────────────────────────
function renderCCUngLedger() {
  const tbody = document.getElementById("cc-ung-tbody");
  if (!tbody) return;
  const sumEl = document.getElementById("cc-ung-summary");

  // Khởi tạo tuần mặc định (tuần hiện tại) nếu chưa chọn
  let fromDate = document.getElementById("cc-ung-from")?.value || "";
  if (!fromDate) {
    const sunISO = ccSundayISO(0);
    const satISO = ccSaturdayISO(sunISO);
    const fromEl = document.getElementById("cc-ung-from");
    const toEl = document.getElementById("cc-ung-to");
    const lblEl = document.getElementById("cc-ung-week-label");
    if (fromEl) fromEl.value = sunISO;
    if (toEl) toEl.value = satISO;
    if (lblEl) lblEl.textContent = "Tuần: " + weekLabel(sunISO);
    fromDate = sunISO;
  }
  const toDate =
    document.getElementById("cc-ung-to")?.value || ccSaturdayISO(fromDate);
  const kw = (document.getElementById("cc-ung-search")?.value || "")
    .trim()
    .toLowerCase();

  // Tập tên công nhân cần xét: danh mục ∪ tên có phát sinh ứng/nợ
  const names = new Set();
  (cats.congNhan || []).forEach((n) => names.add(n));
  (typeof ungRecords !== "undefined" ? ungRecords : []).forEach((r) => {
    if (!r.deletedAt && r.loai === "congnhan" && r.tp) names.add(r.tp);
  });
  (typeof ccData !== "undefined" ? ccData : []).forEach((w) => {
    if (w.deletedAt) return;
    (w.workers || []).forEach((wk) => {
      if (wk.name && ((wk.loanAmount || 0) !== 0 || (wk.tru || 0) !== 0))
        names.add(wk.name);
    });
  });

  // Tính 3 cột cho từng thợ, chỉ giữ thợ có phát sinh (nợ cũ / ứng tuần / tổng nợ ≠ 0)
  const rows = [];
  names.forEach((name) => {
    if (kw && !name.toLowerCase().includes(kw)) return;
    const noCu = _calcDebtBefore(name, fromDate, true);
    const ungWeek = ccUngForWorkerInWeek(name, fromDate, toDate);
    const tongNo = noCu + ungWeek;
    if (noCu === 0 && ungWeek === 0 && tongNo === 0) return;
    rows.push({ name, noCu, ungWeek, tongNo });
  });
  rows.sort((a, b) => b.tongNo - a.tongNo || a.name.localeCompare(b.name, "vi"));

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center;padding:18px;color:var(--ink3)">Chưa có công nợ phát sinh trong tuần này</td></tr>`;
    if (sumEl) sumEl.innerHTML = "";
    return;
  }

  const mono = "font-family:'IBM Plex Mono',monospace";
  let sumNoCu = 0,
    sumUng = 0,
    sumTong = 0;
  const _cell = (v, colorPos, colorZero) => {
    if (v > 0) return `<span style="color:${colorPos}">${numFmt(v)}</span>`;
    if (v < 0) return `<span style="color:var(--green)">(${numFmt(-v)})</span>`;
    return `<span style="color:${colorZero}">—</span>`;
  };
  tbody.innerHTML = rows
    .map((r) => {
      sumNoCu += r.noCu;
      sumUng += r.ungWeek;
      sumTong += r.tongNo;
      return `<tr>
        <td style="font-weight:700;font-size:13px">${x(r.name)}</td>
        <td class="text-secondary" style="text-align:center;font-size:12px;font-weight:700">${cnRoles[r.name] || "—"}</td>
        <td style="text-align:right;${mono}">${_cell(r.noCu, "var(--ink)", "var(--ink3)")}</td>
        <td style="text-align:right;${mono}">${r.ungWeek > 0 ? `<span style="color:var(--gold);font-weight:700">${numFmt(r.ungWeek)}</span>` : '<span style="color:var(--ink3)">—</span>'}</td>
        <td style="text-align:right;${mono};font-weight:700">${_cell(r.tongNo, "var(--red)", "var(--ink3)")}</td>
        <td style="text-align:center">
          <button class="btn btn-outline-secondary btn-sm" style="font-size:11px;padding:2px 8px" onclick="openCCUngHist('${x(r.name).replace(/'/g, "\\'")}')">📜 Xem</button>
        </td>
      </tr>`;
    })
    .join("");

  if (sumEl)
    sumEl.innerHTML = `<span>${rows.length} công nhân · Nợ cũ: <strong class="font-monospace">${fmtS(sumNoCu)}</strong> · Ứng tuần: <strong class="text-warning font-monospace">${fmtS(sumUng)}</strong> · Tổng nợ: <strong class="text-danger font-monospace">${fmtS(sumTong)}</strong></span>`;
}

// ─── Popup Nhập Tiền Ứng nhanh ───────────────────────────────────────
function openCCUngModal(prefillName) {
  // Đảm bảo datalist tên công nhân tồn tại
  if (typeof rebuildCCNameList === "function") rebuildCCNameList();

  const dateEl = document.getElementById("cc-ung-m-date");
  const nameEl = document.getElementById("cc-ung-m-name");
  const tienEl = document.getElementById("cc-ung-m-tien");
  const ctEl = document.getElementById("cc-ung-m-ct");
  const ndEl = document.getElementById("cc-ung-m-nd");
  if (dateEl) dateEl.value = today();
  if (nameEl) nameEl.value = prefillName || "";
  if (tienEl) tienEl.value = "";
  if (ndEl) ndEl.value = "";
  if (ctEl) ctEl.innerHTML = _buildProjOpts("", "-- Không gắn công trình --");

  // Format số tiền khi gõ
  if (tienEl)
    tienEl.oninput = function () {
      const raw = this.value.replace(/[^\d]/g, "");
      this.value = raw ? numFmt(parseInt(raw, 10)) : "";
    };

  const el = document.getElementById("cc-ung-modal");
  if (el && typeof bootstrap !== "undefined")
    bootstrap.Modal.getOrCreateInstance(el).show();
  setTimeout(() => nameEl && nameEl.focus(), 200);
}

function saveCCUng() {
  const date = document.getElementById("cc-ung-m-date")?.value || "";
  const nameRaw = (document.getElementById("cc-ung-m-name")?.value || "").trim();
  const tien =
    parseInt(
      (document.getElementById("cc-ung-m-tien")?.value || "").replace(
        /[^\d]/g,
        "",
      ),
      10,
    ) || 0;
  const ctSel = document.getElementById("cc-ung-m-ct");
  const ct = (ctSel?.value || "").trim();
  const ctPid = _readPidFromSel(ctSel);
  const nd = (document.getElementById("cc-ung-m-nd")?.value || "").trim();

  if (!date) {
    toast("Chọn ngày ứng!", "error");
    return;
  }
  if (!nameRaw) {
    toast("Chọn tên công nhân!", "error");
    return;
  }
  // Tên phải có trong danh mục công nhân (chuẩn hóa bỏ dấu)
  const canonical = (cats.congNhan || []).find(
    (n) => normalizeKey(n) === normalizeKey(nameRaw),
  );
  if (!canonical) {
    toast('⚠️ "' + nameRaw + '" không có trong danh mục công nhân!', "error");
    return;
  }
  if (tien <= 0) {
    toast("Nhập số tiền ứng > 0!", "error");
    return;
  }

  ungRecords.unshift(
    mkRecord({
      ngay: date,
      loai: "congnhan",
      tp: canonical,
      congtrinh: ct,
      projectId: ctPid || null,
      tien,
      nd,
    }),
  );
  save("ung_v1", ungRecords);

  // Đóng modal + refresh đồng bộ
  const el = document.getElementById("cc-ung-modal");
  if (el && typeof bootstrap !== "undefined")
    bootstrap.Modal.getOrCreateInstance(el).hide();

  if (typeof rebuildCCNameList === "function") rebuildCCNameList();
  renderCCUngLedger();
  _ccSyncWeekDebt(); // cập nhật auto-fill cột Trừ ở Sổ Chấm Công (không phá dữ liệu đang nhập)

  toast(`✅ Đã ghi ứng ${numFmt(tien)} cho ${canonical}`, "success");
}

// Cập nhật lại gợi ý dư nợ + auto-fill cột Trừ cho mọi dòng đang mở ở Sổ Chấm Công,
// KHÔNG rebuild bảng (giữ nguyên dữ liệu người dùng đang nhập dở).
function _ccSyncWeekDebt() {
  const tb = document.getElementById("cc-tbody");
  if (!tb) return;
  tb.querySelectorAll("tr:not(.cc-sum-row)").forEach((tr) => {
    if (typeof calcCCRow === "function") calcCCRow(tr);
  });
  if (typeof updateCCSumRow === "function") updateCCSumRow();
}

// ─── Lịch sử ứng/trừ của 1 công nhân ─────────────────────────────────
function openCCUngHist(name) {
  const nameEl = document.getElementById("cc-ung-hist-name");
  if (nameEl) nameEl.textContent = name;
  renderCCUngHistory(name);
  const el = document.getElementById("cc-ung-hist-modal");
  if (el && typeof bootstrap !== "undefined")
    bootstrap.Modal.getOrCreateInstance(el).show();
}

function renderCCUngHistory(name) {
  const tbody = document.getElementById("cc-ung-hist-tbody");
  if (!tbody) return;
  const sumEl = document.getElementById("cc-ung-hist-summary");
  const items = [];

  // (1) Phiếu ứng realtime (ung_v1, loai='congnhan')
  (typeof ungRecords !== "undefined" ? ungRecords : []).forEach((r) => {
    if (r.deletedAt || r.loai !== "congnhan" || r.tp !== name) return;
    items.push({
      ngay: r.ngay || "",
      type: "ung",
      ct: r.projectId ? resolveProjectName(r) : r.congtrinh || "",
      nd: r.nd || "Ứng tiền",
      ung: Number(r.tien) || 0,
      tru: 0,
      id: r.id,
    });
  });

  // (2) Dữ liệu trong cc_v2: vay-trong-tuần cũ (loanAmount) + trừ nợ (tru)
  (typeof ccData !== "undefined" ? ccData : []).forEach((w) => {
    if (w.deletedAt) return;
    (w.workers || []).forEach((wk) => {
      if (wk.name !== name) return;
      const wkLabel = "Tuần " + weekLabel(w.fromDate);
      const ctName = typeof _resolveCtName === "function" ? _resolveCtName(w) : w.ct || "";
      if ((wk.loanAmount || 0) > 0)
        items.push({
          ngay: w.fromDate,
          type: "ung_old",
          ct: ctName + " · " + wkLabel,
          nd: "Vay trong tuần (cũ)",
          ung: wk.loanAmount,
          tru: 0,
        });
      if ((wk.tru || 0) > 0)
        items.push({
          ngay: w.fromDate,
          type: "tru",
          ct: ctName + " · " + wkLabel,
          nd: "Trừ nợ/ứng vào lương",
          ung: 0,
          tru: wk.tru,
        });
    });
  });

  items.sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0));

  if (!items.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center;padding:18px;color:var(--ink3)">Chưa có giao dịch công nợ</td></tr>`;
    if (sumEl) sumEl.innerHTML = "";
    return;
  }

  const mono = "font-family:'IBM Plex Mono',monospace";
  let totUng = 0,
    totTru = 0;
  tbody.innerHTML = items
    .map((it) => {
      totUng += it.ung;
      totTru += it.tru;
      const delBtn =
        it.type === "ung"
          ? `<button class="del-btn" title="Xóa phiếu ứng" onclick="delCCUngRecord('${String(it.id).replace(/'/g, "\\'")}')">✕</button>`
          : "";
      const typeLabel =
        it.type === "tru"
          ? '<span class="text-danger">Trừ nợ</span>'
          : it.type === "ung_old"
            ? '<span class="text-secondary">Vay (cũ)</span>'
            : '<span class="text-warning">Ứng tiền</span>';
      return `<tr>
        <td style="white-space:nowrap">${viShort(it.ngay)}/${(it.ngay || "").split("-")[0] || ""}</td>
        <td style="font-size:12px;font-weight:600">${typeLabel}</td>
        <td style="font-size:12px">${x(it.ct || "—")}</td>
        <td style="font-size:12px">${x(it.nd || "")}</td>
        <td style="text-align:right;${mono};color:var(--gold)">${it.ung > 0 ? numFmt(it.ung) : "—"}</td>
        <td style="text-align:right;${mono};color:var(--red)">${it.tru > 0 ? numFmt(it.tru) : "—"}</td>
        <td style="text-align:center">${delBtn}</td>
      </tr>`;
    })
    .join("");

  if (sumEl)
    sumEl.innerHTML = `<span>Tổng ứng: <strong class="text-warning font-monospace">${fmtS(totUng)}</strong> · Tổng đã trừ: <strong class="text-danger font-monospace">${fmtS(totTru)}</strong> · Còn nợ: <strong class="font-monospace">${fmtS(totUng - totTru)}</strong></span>`;
}

// Xóa mềm 1 phiếu ứng công nhân (giữ chuẩn metadata để đồng bộ)
function delCCUngRecord(id) {
  if (!confirm("Xóa phiếu ứng này?")) return;
  const idx = ungRecords.findIndex((r) => String(r.id) === String(id));
  if (idx < 0) {
    toast("Không tìm thấy phiếu ứng!", "error");
    return;
  }
  const name = ungRecords[idx].tp || "";
  ungRecords[idx] = mkUpdate(ungRecords[idx], { deletedAt: Date.now() });
  save("ung_v1", ungRecords);
  renderCCUngHistory(name);
  renderCCUngLedger();
  _ccSyncWeekDebt();
  toast("Đã xóa phiếu ứng", "success");
}
