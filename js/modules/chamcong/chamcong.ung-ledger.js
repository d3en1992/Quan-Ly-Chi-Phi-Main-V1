// chamcong.ung-ledger.js — Sổ cái Ứng Công Nhân + popup "Tiền ứng CN" (gộp Ứng tiền + Trả nợ)
// Load order: sau chamcong.history-reports.js
//
// Tái sử dụng store ung_v1 (cùng nơi Tiền Ứng Thầu Phụ/NCC) nhưng:
//   loai = 'congnhan'      → trang Tiền Ứng (nhapung) & Công Nợ chỉ lọc thauphu/nhacungcap
//                            nên phiếu công nhân không bao giờ lẫn sang đó.
//   tp     = tên công nhân
//   cnKind = 'ung' (ứng tiền, +nợ) | 'tra' (trả nợ, −nợ)
//
// Công nợ realtime do các helper ở chamcong.core.js tính:
//   _calcDebtBefore(name, dateISO)   → dư nợ TRƯỚC mốc (nợ cũ mang sang)
//   ccWorkerDebtUpTo(name, dateISO)  → tổng nợ đến hết mốc
//   ccUngInRange / ccTraInRange      → tổng ứng / trả trong khoảng ngày

// ─── Helper ngày tháng cho bộ lọc ───────────────────────────────────
function _ccUngMonthRange(ym) {
  // ym = 'YYYY-MM' → ['YYYY-MM-01', 'YYYY-MM-<lastDay>']
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [ym + "-01", ym + "-" + String(last).padStart(2, "0")];
}

// Xác định khoảng [start, end] theo bộ lọc Tháng/Tuần hiện tại
function _ccUngPeriod() {
  const week = document.getElementById("cc-ung-week")?.value || "";
  const month = document.getElementById("cc-ung-month")?.value || "";
  if (week) return [week, ccSaturdayISO(week), "week"];
  if (month) {
    const [s, e] = _ccUngMonthRange(month);
    return [s, e, "month"];
  }
  // Tất cả: theo năm đang chọn; nếu "Tất cả năm" (activeYear=0) → toàn bộ
  if (typeof activeYear !== "undefined" && activeYear === 0)
    return ["0000-01-01", "9999-12-31", "all"];
  const yr =
    typeof activeYear !== "undefined" && activeYear
      ? activeYear
      : new Date().getFullYear();
  return [yr + "-01-01", yr + "-12-31", "year"];
}

// ─── Dựng dropdown Tháng + Tuần từ dữ liệu ──────────────────────────
function buildCCUngFilters() {
  const monthSel = document.getElementById("cc-ung-month");
  const weekSel = document.getElementById("cc-ung-week");
  if (!monthSel || !weekSel) return;

  // Gom mốc thời gian: phiếu ứng công nhân + tuần chấm công, trong năm đang chọn
  const monthSet = new Set();
  const weekSet = new Set();
  (typeof ungRecords !== "undefined" ? ungRecords : []).forEach((r) => {
    if (r.deletedAt || r.loai !== "congnhan" || !r.ngay) return;
    if (!inActiveYear(r.ngay)) return;
    monthSet.add(r.ngay.slice(0, 7));
    weekSet.add(snapToSunday(r.ngay));
  });
  (typeof ccData !== "undefined" ? ccData : []).forEach((w) => {
    if (w.deletedAt || !w.fromDate) return;
    if (!inActiveYear(w.fromDate)) return;
    monthSet.add(w.fromDate.slice(0, 7));
    weekSet.add(w.fromDate);
  });

  // Tháng — sort giảm dần
  const curMonth = monthSel.value;
  const months = [...monthSet].sort().reverse();
  monthSel.innerHTML =
    '<option value="">Tất cả tháng</option>' +
    months
      .map((m) => {
        const [y, mm] = m.split("-");
        return `<option value="${m}" ${m === curMonth ? "selected" : ""}>Tháng ${Number(mm)}/${y}</option>`;
      })
      .join("");

  // Tuần — nếu đang chọn 1 tháng thì chỉ hiện tuần giao với tháng đó
  const curWeek = weekSel.value;
  const selMonth = monthSel.value;
  let weeks = [...weekSet];
  if (selMonth) {
    weeks = weeks.filter((sun) => {
      const sat = ccSaturdayISO(sun);
      return sun.slice(0, 7) === selMonth || sat.slice(0, 7) === selMonth;
    });
  }
  weeks.sort().reverse();
  weekSel.innerHTML =
    '<option value="">Tất cả tuần</option>' +
    weeks
      .map(
        (sun) =>
          `<option value="${sun}" ${sun === curWeek ? "selected" : ""}>${weekLabel(sun)}</option>`,
      )
      .join("");
}

function onCCUngMonthChange() {
  // Đổi tháng → reset lựa chọn tuần rồi dựng lại danh sách tuần theo tháng
  const weekSel = document.getElementById("cc-ung-week");
  if (weekSel) weekSel.value = "";
  buildCCUngFilters();
  renderCCUngLedger();
}

// ─── Render sổ cái ───────────────────────────────────────────────────
function renderCCUngLedger() {
  const tbody = document.getElementById("cc-ung-tbody");
  if (!tbody) return;
  const sumEl = document.getElementById("cc-ung-summary");
  buildCCUngFilters();

  const [pStart, pEnd] = _ccUngPeriod();
  const kw = (document.getElementById("cc-ung-search")?.value || "")
    .trim()
    .toLowerCase();

  // Tập tên cần xét: danh mục ∪ tên có phát sinh ứng/nợ
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

  const rows = [];
  names.forEach((name) => {
    if (kw && !name.toLowerCase().includes(kw)) return;
    const noCu = _calcDebtBefore(name, pStart);
    const ungKy = ccUngInRange(name, pStart, pEnd);
    const traKy = ccTraInRange(name, pStart, pEnd);
    const tongNo = ccWorkerDebtUpTo(name, pEnd);
    if (noCu === 0 && ungKy === 0 && traKy === 0 && tongNo === 0) return;
    rows.push({ name, noCu, ungKy, traKy, tongNo });
  });
  rows.sort((a, b) => b.tongNo - a.tongNo || a.name.localeCompare(b.name, "vi"));

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center;padding:18px;color:var(--ink3)">Chưa có công nợ phát sinh trong kỳ này</td></tr>`;
    if (sumEl) sumEl.innerHTML = "";
    return;
  }

  const mono = "font-family:'IBM Plex Mono',monospace";
  let sNoCu = 0,
    sUng = 0,
    sTra = 0,
    sTong = 0;
  // Hiển thị 1 ô số có dấu: >0 đỏ (nợ), <0 xanh (dư)
  const _debtCell = (v) => {
    if (v > 0) return `<span style="color:var(--red)">${numFmt(v)}</span>`;
    if (v < 0) return `<span style="color:var(--green)">(${numFmt(-v)})</span>`;
    return `<span style="color:var(--ink3)">—</span>`;
  };
  tbody.innerHTML = rows
    .map((r) => {
      sNoCu += r.noCu;
      sUng += r.ungKy;
      sTra += r.traKy;
      sTong += r.tongNo;
      const nmeSafe = x(r.name).replace(/'/g, "\\'");
      return `<tr>
        <td style="font-weight:700;font-size:13px">${x(r.name)}</td>
        <td class="text-secondary" style="text-align:center;font-size:12px;font-weight:700">${cnRoles[r.name] || "—"}</td>
        <td style="text-align:right;${mono}">${_debtCell(r.noCu)}</td>
        <td style="text-align:right;${mono}">${r.ungKy > 0 ? `<span style="color:var(--gold);font-weight:700">${numFmt(r.ungKy)}</span>` : '<span style="color:var(--ink3)">—</span>'}</td>
        <td style="text-align:right;${mono}">${r.traKy > 0 ? `<span style="color:var(--green);font-weight:700">${numFmt(r.traKy)}</span>` : '<span style="color:var(--ink3)">—</span>'}</td>
        <td style="text-align:right;${mono};font-weight:700">${_debtCell(r.tongNo)}</td>
        <td style="text-align:center">
          <button class="btn btn-outline-secondary btn-sm" style="font-size:11px;padding:2px 8px" onclick="openCCUngHist('${nmeSafe}')">📜 Xem</button>
        </td>
      </tr>`;
    })
    .join("");

  if (sumEl)
    sumEl.innerHTML = `<span>${rows.length} công nhân · Nợ cũ: <strong class="font-monospace">${fmtS(sNoCu)}</strong> · Ứng kỳ: <strong class="text-warning font-monospace">${fmtS(sUng)}</strong> · Trả kỳ: <strong class="text-success font-monospace">${fmtS(sTra)}</strong> · Tổng nợ: <strong class="text-danger font-monospace">${fmtS(sTong)}</strong></span>`;
}

// ─── Popup "Tiền ứng CN" (Ứng tiền / Trả nợ) ─────────────────────────
function openCCUngModal(prefillName) {
  if (typeof rebuildCCNameList === "function") rebuildCCNameList();

  const dateEl = document.getElementById("cc-ung-m-date");
  const nameEl = document.getElementById("cc-ung-m-name");
  const tienEl = document.getElementById("cc-ung-m-tien");
  const ctEl = document.getElementById("cc-ung-m-ct");
  const ndEl = document.getElementById("cc-ung-m-nd");
  const kindUng = document.getElementById("cc-ung-m-kind-ung");
  if (kindUng) kindUng.checked = true; // mặc định: Ứng tiền
  if (dateEl) dateEl.value = today();
  if (nameEl) nameEl.value = prefillName || "";
  if (tienEl) tienEl.value = "";
  if (ndEl) ndEl.value = "";
  if (ctEl) ctEl.innerHTML = _buildProjOpts("", "-- Không gắn công trình --");

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
  const kind =
    document.querySelector('input[name="cc-ung-m-kind"]:checked')?.value ||
    "ung";
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

  if (!date) return toast("Chọn ngày giao dịch!", "error");
  if (!nameRaw) return toast("Chọn tên công nhân!", "error");
  const canonical = (cats.congNhan || []).find(
    (n) => normalizeKey(n) === normalizeKey(nameRaw),
  );
  if (!canonical)
    return toast(
      '⚠️ "' + nameRaw + '" không có trong danh mục công nhân!',
      "error",
    );
  if (tien <= 0) return toast("Nhập số tiền > 0!", "error");

  ungRecords.unshift(
    mkRecord({
      ngay: date,
      loai: "congnhan",
      cnKind: kind === "tra" ? "tra" : "ung",
      tp: canonical,
      congtrinh: ct,
      projectId: ctPid || null,
      tien,
      nd,
    }),
  );
  save("ung_v1", ungRecords);

  const el = document.getElementById("cc-ung-modal");
  if (el && typeof bootstrap !== "undefined")
    bootstrap.Modal.getOrCreateInstance(el).hide();

  if (typeof rebuildCCNameList === "function") rebuildCCNameList();
  renderCCUngLedger();

  toast(
    `✅ Đã ghi ${kind === "tra" ? "trả nợ" : "ứng"} ${numFmt(tien)} cho ${canonical}`,
    "success",
  );
}

// ─── Lịch sử ứng/trả của 1 công nhân ─────────────────────────────────
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

  // (1) Sổ cái realtime (ung_v1, loai='congnhan') — ứng (+) hoặc trả (−)
  (typeof ungRecords !== "undefined" ? ungRecords : []).forEach((r) => {
    if (r.deletedAt || r.loai !== "congnhan" || r.tp !== name) return;
    const isTra = r.cnKind === "tra";
    items.push({
      ngay: r.ngay || "",
      type: isTra ? "tra" : "ung",
      ct: r.projectId ? resolveProjectName(r) : r.congtrinh || "",
      nd: r.nd || (isTra ? "Trả nợ" : "Ứng tiền"),
      ung: isTra ? 0 : Number(r.tien) || 0,
      tru: isTra ? Number(r.tien) || 0 : 0,
      id: r.id,
    });
  });

  // (2) Dữ liệu chấm công CŨ: vay-trong-tuần (loanAmount) + trừ nợ (tru)
  (typeof ccData !== "undefined" ? ccData : []).forEach((w) => {
    if (w.deletedAt) return;
    (w.workers || []).forEach((wk) => {
      if (wk.name !== name) return;
      const wkLabel = "Tuần " + weekLabel(w.fromDate);
      const ctName =
        typeof _resolveCtName === "function" ? _resolveCtName(w) : w.ct || "";
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
          type: "tru_old",
          ct: ctName + " · " + wkLabel,
          nd: "Trừ nợ vào lương (cũ)",
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
      const delBtn = it.id
        ? `<button class="del-btn" title="Xóa giao dịch" onclick="delCCUngRecord('${String(it.id).replace(/'/g, "\\'")}')">✕</button>`
        : "";
      const typeLabel =
        it.type === "tra"
          ? '<span class="text-success">Trả nợ</span>'
          : it.type === "tru_old"
            ? '<span class="text-success">Trừ (cũ)</span>'
            : it.type === "ung_old"
              ? '<span class="text-secondary">Vay (cũ)</span>'
              : '<span class="text-warning">Ứng tiền</span>';
      return `<tr>
        <td style="white-space:nowrap">${viShort(it.ngay)}/${(it.ngay || "").split("-")[0] || ""}</td>
        <td style="font-size:12px;font-weight:600">${typeLabel}</td>
        <td style="font-size:12px">${x(it.ct || "—")}</td>
        <td style="font-size:12px">${x(it.nd || "")}</td>
        <td style="text-align:right;${mono};color:var(--gold)">${it.ung > 0 ? numFmt(it.ung) : "—"}</td>
        <td style="text-align:right;${mono};color:var(--green)">${it.tru > 0 ? numFmt(it.tru) : "—"}</td>
        <td style="text-align:center">${delBtn}</td>
      </tr>`;
    })
    .join("");

  if (sumEl)
    sumEl.innerHTML = `<span>Tổng ứng: <strong class="text-warning font-monospace">${fmtS(totUng)}</strong> · Tổng trả: <strong class="text-success font-monospace">${fmtS(totTru)}</strong> · Còn nợ: <strong class="text-danger font-monospace">${fmtS(totUng - totTru)}</strong></span>`;
}

// Xóa mềm 1 giao dịch (ứng/trả) trong sổ cái
function delCCUngRecord(id) {
  if (!confirm("Xóa giao dịch này?")) return;
  const idx = ungRecords.findIndex((r) => String(r.id) === String(id));
  if (idx < 0) return toast("Không tìm thấy giao dịch!", "error");
  const name = ungRecords[idx].tp || "";
  ungRecords[idx] = mkUpdate(ungRecords[idx], { deletedAt: Date.now() });
  save("ung_v1", ungRecords);
  renderCCUngHistory(name);
  renderCCUngLedger();
  toast("Đã xóa giao dịch", "success");
}
