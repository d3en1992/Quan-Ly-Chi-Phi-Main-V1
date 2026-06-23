// chamcong.week-form.js — Form nhập tuần, build table, row handlers, lưu/copy/paste tuần
// Load order: sau chamcong.core.js, trước chamcong.history-reports.js

// ─── init ────────────────────────────────────────────────────────
function initCC() {
  ccOffset = 0;
  ccGoToWeek(0);
  populateCCCtSel();
  rebuildCCNameList();
  // Event delegation cho checkbox TLT — gắn 1 lần, không bị mất khi re-render
  document.addEventListener("change", function (e) {
    if (e.target.classList.contains("cc-tlt-chk")) updateTLTSelectedSum();
  });
}

function ccGoToWeek(off) {
  ccOffset = off;
  const sunISO = ccSundayISO(off);
  const satISO = ccSaturdayISO(sunISO);
  document.getElementById("cc-from").value = sunISO;
  document.getElementById("cc-to").value = satISO;
  document.getElementById("cc-week-label").textContent =
    "Tuần: " + weekLabel(sunISO);
  loadCCWeekForm();
}
function ccPrevWeek() {
  ccGoToWeek(ccOffset - 1);
}
function ccNextWeek() {
  ccGoToWeek(ccOffset + 1);
}

function onCCFromChange() {
  const raw = document.getElementById("cc-from").value;
  if (!raw) return;
  // Snap bất kỳ ngày được chọn về CN của tuần đó
  const sunISO = snapToSunday(raw);
  const satISO = ccSaturdayISO(sunISO);
  document.getElementById("cc-from").value = sunISO;
  document.getElementById("cc-to").value = satISO;
  document.getElementById("cc-week-label").textContent =
    "Tuần: " + weekLabel(sunISO);
  // Tính lại offset so với tuần hiện tại
  const thisSun = ccSundayISO(0);
  const [ty, tm, td] = thisSun.split("-").map(Number);
  const [fy, fm, fd] = sunISO.split("-").map(Number);
  const diffMs = new Date(fy, fm - 1, fd) - new Date(ty, tm - 1, td);
  ccOffset = Math.round(diffMs / (7 * 86400000));
  loadCCWeekForm();
}

function loadCCWeekForm() {
  const f = document.getElementById("cc-from").value;
  const ccCtSel = document.getElementById("cc-ct-sel");
  const ct = (ccCtSel.value || "").trim();
  const ctPid = _readPidFromSel(ccCtSel);
  // Try to find saved data for this week+ct — projectId/ctPid ưu tiên, fallback ct string
  const _matchCT = (w) =>
    ctPid ? w.projectId === ctPid || w.ctPid === ctPid : w.ct === ct;
  const rec = ccData.find(
    (w) => !w.deletedAt && w.fromDate === f && _matchCT(w),
  );
  if (rec) {
    buildCCTable(rec.workers);
  } else if (ct) {
    // Tự động copy DANH SÁCH công nhân + Lương/ngày sang tuần mới — nhưng có ĐIỀU KIỆN:
    // CHỈ copy từ ĐÚNG tuần liền trước đó (lùi 7 ngày), và CHỈ KHI tuần liền trước
    // thực sự có phát sinh ngày công. Mục đích: tránh việc bấm "Tuần sau" liên tục
    // qua các tuần trống làm rác dữ liệu (tên + lương) bị kéo dài mãi mãi.

    // Tính ngày Chủ Nhật của tuần liền trước (lùi đúng 7 ngày so với tuần đang mở)
    const prevDate = new Date(f + "T00:00:00");
    prevDate.setDate(prevDate.getDate() - 7);
    const prevWeekISO =
      prevDate.getFullYear() +
      "-" +
      String(prevDate.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(prevDate.getDate()).padStart(2, "0");

    // Tìm bản ghi của ĐÚNG tuần liền trước + cùng công trình (không lấy tuần xa hơn)
    const prev = ccData.find(
      (w) => !w.deletedAt && w.fromDate === prevWeekISO && _matchCT(w),
    );

    // Kiểm tra tuần liền trước có ngày công thực tế hay không
    // (ít nhất 1 công nhân có chấm công > 0 trong 7 ngày của tuần)
    const _hasActualWork =
      prev &&
      Array.isArray(prev.workers) &&
      prev.workers.some(
        (wk) => Array.isArray(wk.d) && wk.d.some((v) => Number(v) > 0),
      );

    if (_hasActualWork) {
      // Tuần liền trước CÓ dữ liệu → copy tên + lương, xóa sạch ngày công/phụ cấp/nợ
      const stub = prev.workers.map((wk) => ({
        name: wk.name,
        luong: wk.luong,
        d: [0, 0, 0, 0, 0, 0, 0],
        phucap: 0,
        hdmuale: 0,
        loanAmount: 0,
        nd: "",
        role: wk.role || "",
        tru: 0,
      }));
      buildCCTable(stub);
    } else {
      // Tuần liền trước KHÔNG có dữ liệu chấm công → để trống danh sách
      buildCCTable([]);
    }
  } else {
    buildCCTable([]);
  }
  updateCCSaveBtn();
  // Cập nhật bảng Tổng Lương Tuần mini theo tuần vừa load
  // (guard typeof vì file này nạp TRƯỚC chamcong.history-reports.js)
  if (typeof renderCCTLTMini === 'function') renderCCTLTMini();
}

// ─── build table ─────────────────────────────────────────────────
function buildCCTable(workers) {
  const fromStr = document.getElementById("cc-from").value;
  const thead = document.getElementById("cc-thead-row");
  const dates = CC_DATE_OFFSETS.map((off) => {
    if (!fromStr) return "";
    const d = new Date(fromStr + "T00:00:00");
    d.setDate(d.getDate() + off);
    return d.getDate() + "/" + (d.getMonth() + 1);
  });
  const BG = "background:#eeece7;color:var(--ink)";
  thead.innerHTML = `
    <th class="col-num">#</th>
    <th class="cc-sticky-name col-name">Tên Công Nhân</th>
    <th class="col-tp" style="text-align:center">T/P</th>
    ${CC_DAY_LABELS.map((l, i) => `<th class="cc-day-header col-day">${l}<br><span style="font-size:9px;font-weight:400;color:var(--ink2)">${dates[i]}</span></th>`).join("")}
    <th class="col-tc" style="text-align:center;${BG}">TC</th>
    <th class="col-luong" style="text-align:right;${BG}">Lương/Ngày</th>
    <th class="col-total-luong" style="text-align:right;${BG}">Tổng Lương</th>
    <th class="col-phucap" style="text-align:right;${BG}">
      <span style="display:inline-flex;align-items:center;gap:4px;justify-content:flex-end">
        Phụ Cấp
        <span class="cc-debt-toggle-th" onclick="toggleCCDebtCols()" title="Mở rộng: HĐ Mua Lẻ / Nội Dung" style="cursor:pointer;font-size:10px;user-select:none;color:var(--ink2);padding:0 2px">▶</span>
      </span>
    </th>
    <th class="cc-debt-col col-hdml" style="text-align:right;${BG}">HĐ Mua Lẻ</th>
    <th class="cc-debt-col col-nd" style="${BG}">Nội Dung</th>
    <th class="col-total" style="text-align:right;background:var(--gold);color:#fff;font-weight:700">Thực Lãnh</th>
    <th class="col-del" style="${BG}"></th>
  `;
  const tbody = document.getElementById("cc-tbody");
  tbody.innerHTML = "";
  const minRows = Math.max((workers || []).length, 8);
  for (let i = 0; i < minRows; i++) addCCRow((workers || [])[i] || null);
  updateCCSumRow();
  _applyCCDebtColsVisibility(); // Áp dụng trạng thái ẩn/hiện cột nợ hiện tại
}

function addCCWorker() {
  const tbody = document.getElementById("cc-tbody");
  const sumRow = tbody.querySelector(".cc-sum-row");
  const nr = buildCCRow(
    null,
    tbody.querySelectorAll("tr:not(.cc-sum-row)").length + 1,
  );
  tbody.insertBefore(nr, sumRow || null);
  renumberCC();
  updateCCSumRow();
  nr.querySelector(".cc-name-input")?.focus();
}

function addCCRow(w) {
  const tbody = document.getElementById("cc-tbody");
  const num = tbody.querySelectorAll("tr:not(.cc-sum-row)").length + 1;
  tbody.appendChild(buildCCRow(w, num));
}

function buildCCRow(w, num) {
  const tr = document.createElement("tr");
  const ds = w ? w.d : [0, 0, 0, 0, 0, 0, 0];
  const luong = w ? w.luong || 0 : 0;
  const phucap = w ? w.phucap || 0 : 0;
  const hdml = w ? w.hdmuale || 0 : 0;
  const role = w?.role || (w?.name ? cnRoles[w.name] || "" : "");
  const isKnown = w?.name
    ? cats.congNhan.some(
        (n) => n.toLowerCase() === (w.name || "").toLowerCase(),
      )
    : false;

  tr.innerHTML = `
    <td class="row-num col-num">${num}</td>
    <td class="cc-sticky-name col-name" style="padding:0">
      <input class="cc-name-input" data-cc="name"
        value="${x(w ? w.name || "" : "" || "")}" placeholder="Tên..." autocomplete="off">
    </td>
    <td class="col-tp" style="padding:4px 2px;text-align:center">
      <input type="hidden" data-cc="tp" value="${role}">
      <span class="cc-tp-display" style="display:inline-block;min-width:22px;font-size:12px;font-weight:700;color:${role ? "var(--ink)" : "var(--ink3)"}">${role || "—"}</span>
    </td>
    ${ds
      .map(
        (
          v,
          i,
        ) => `<td class="col-day" style="padding:0"><input class="cc-day-input ${v === 1 ? "has-val" : v > 0 && v < 1 ? "half-val" : ""}"
      data-cc="d${i}" value="${v || ""}" placeholder="·" autocomplete="off" inputmode="decimal"></td>`,
      )
      .join("")}
    <td class="cc-tc-cell col-tc" data-cc="tc">0</td>
    <td class="col-luong" style="padding:0"><input class="cc-wage-input" data-cc="luong" data-raw="${luong || ""}" inputmode="decimal"
      value="${luong ? numFmt(luong) : ""}" placeholder="0"></td>
    <td class="cc-total-cell col-total-luong" data-cc="total">—</td>
    <td class="col-phucap" style="padding:0"><input class="cc-wage-input" data-cc="phucap" data-raw="${phucap || ""}" inputmode="decimal"
      value="${phucap ? numFmt(phucap) : ""}" placeholder="0"></td>
    <td class="cc-debt-col col-hdml" style="padding:0"><input class="cc-wage-input" data-cc="hdml" data-raw="${hdml || ""}" inputmode="decimal"
      value="${hdml ? numFmt(hdml) : ""}" placeholder="0"></td>
    <td class="cc-debt-col col-nd" style="padding:0"><input class="cc-name-input" data-cc="nd"
      value="${x(w ? w.nd || "" : "" || "")}" placeholder="Nội dung..."
      style="font-size:11px"></td>
    <td class="cc-total-cell col-total" data-cc="tongcong" style="color:var(--gold);font-size:13px">—</td>
    <td class="col-del"><button class="del-btn" onclick="delCCRow(this)">✕</button></td>
  `;
  tr.querySelectorAll('[data-cc^="d"]').forEach((el) =>
    el.addEventListener("input", () => {
      onCCDayKey(el);
      updateCCSumRow();
    }),
  );
  tr.querySelector('[data-cc="luong"]').addEventListener("input", function () {
    onCCWageKey(this);
    updateCCSumRow();
  });
  tr.querySelector('[data-cc="phucap"]').addEventListener("input", function () {
    onCCMoneyKey(this);
    updateCCSumRow();
  });
  tr.querySelector('[data-cc="hdml"]').addEventListener("input", function () {
    onCCMoneyKey(this);
    updateCCSumRow();
  });
  tr.querySelector('[data-cc="name"]').addEventListener("input", function () {
    _acShow(this, cats.congNhan, (v) => {
      this.value = v;
      onCCNameInput(this);
      updateCCSumRow();
    });
    onCCNameInput(this);
    updateCCSumRow();
  });
  tr.querySelector('[data-cc="name"]').addEventListener("focus", function () {
    if (cats.congNhan.length)
      _acShow(this, cats.congNhan, (v) => {
        this.value = v;
        onCCNameInput(this);
        updateCCSumRow();
      });
  });
  tr.querySelector('[data-cc="name"]').addEventListener("blur", function () {
    // Validate: chỉ cho phép tên có trong danh mục
    const v = this.value.trim();
    if (!v) return;
    // Tìm tên chuẩn trong danh mục bằng normalizeKey (bỏ dấu + lowercase)
    // → "nguyen van a" khớp "NGUYỄN VĂN A" → điền đúng tên chuẩn, không ép UPPERCASE mù quáng
    const canonical = cats.congNhan.find(
      (n) => normalizeKey(n) === normalizeKey(v),
    );
    if (!canonical) {
      this.style.boxShadow = "inset 0 0 0 2px var(--red)";
      toast('⚠️ "' + v + '" không có trong danh mục công nhân!', "error");
      this.value = "";
      this.style.boxShadow = "";
      updateCCSumRow();
    } else {
      this.style.boxShadow = "";
      this.value = canonical; // điền đúng tên chuẩn từ danh mục
    }
  });
  tr.querySelector('[data-cc="nd"]').addEventListener("input", updateCCSumRow);
  calcCCRow(tr);
  return tr;
}

function onCCNameInput(inp) {
  const name = inp.value.trim();
  if (!name) {
    inp.style.boxShadow = "";
    inp.title = "";
    return;
  }
  // Chống trùng tên không phân biệt hoa thường
  const nameLower = name.toLowerCase();
  let count = 0;
  document.querySelectorAll('#cc-tbody [data-cc="name"]').forEach((el) => {
    if (el.value.trim().toLowerCase() === nameLower) count++;
  });
  if (count > 1) {
    inp.style.boxShadow = "inset 0 0 0 2px var(--red)";
    inp.title = "⚠️ Tên trùng! Vui lòng đổi tên để phân biệt.";
    toast(
      '⚠️ Tên "' + name + '" bị trùng – hãy đổi tên để tránh nhầm lẫn!',
      "error",
    );
  } else {
    inp.style.boxShadow = "";
    inp.title = "";
  }
  // Auto-fill T/P nếu thợ đã có trong danh mục
  const tr = inp.closest("tr");
  if (!tr) return;
  const tpInput = tr.querySelector('[data-cc="tp"]');
  const tpDisplay = tr.querySelector(".cc-tp-display");
  if (!tpInput) return;
  const known = cats.congNhan.find((n) => n.toLowerCase() === nameLower);
  const role = known ? cnRoles[known] || "" : "";
  tpInput.value = role;
  if (tpDisplay) {
    tpDisplay.textContent = role || "—";
    tpDisplay.style.color = role ? "var(--ink)" : "var(--ink3)";
  }
}

function onCCDayKey(inp) {
  const n = parseFloat(inp.value.replace(",", ".")) || 0;
  inp.classList.toggle("has-val", n === 1);
  inp.classList.toggle("half-val", n > 0 && n < 1);
  calcCCRow(inp.closest("tr"));
}
function onCCWageKey(inp) {
  const raw = inp.value.replace(/\./g, "").replace(/,/g, "");
  inp.dataset.raw = raw;
  if (raw) inp.value = numFmt(parseInt(raw) || 0);
  calcCCRow(inp.closest("tr"));
}
function onCCMoneyKey(inp) {
  const raw = inp.value.replace(/\./g, "").replace(/,/g, "");
  inp.dataset.raw = raw;
  if (raw) inp.value = numFmt(parseInt(raw) || 0);
  calcCCRow(inp.closest("tr"));
}

function calcCCRow(tr) {
  let tc = 0;
  for (let i = 0; i < 7; i++)
    tc += parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value || 0) || 0;
  tc = round1(tc);
  tr.querySelector('[data-cc="tc"]').textContent = tc || 0;
  const luong =
    parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw || 0) || 0;
  const total = tc * luong;
  const phucap =
    parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw || 0) || 0;
  const hdml =
    parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw || 0) || 0;

  const totCell = tr.querySelector('[data-cc="total"]');
  totCell.textContent = total > 0 ? numFmt(total) : "—";
  totCell.style.color = total > 0 ? "var(--green)" : "var(--ink3)";

  // Thực Lãnh = Tổng Lương + Phụ Cấp + HĐ Mua Lẻ
  // (Tạm ứng / trả nợ đã tách hoàn toàn sang popup "Tiền ứng CN" + sổ cái Ứng Công Nhân)
  const thucLanh = total + phucap + hdml;
  const tcCell = tr.querySelector('[data-cc="tongcong"]');
  if (thucLanh > 0) {
    tcCell.textContent = numFmt(thucLanh);
    tcCell.style.color = "var(--gold)";
  } else if (thucLanh < 0) {
    tcCell.textContent = "(" + numFmt(-thucLanh) + ")";
    tcCell.style.color = "var(--red)";
  } else {
    tcCell.textContent = "—";
    tcCell.style.color = "var(--ink3)";
  }
}

function delCCRow(btn) {
  btn.closest("tr").remove();
  renumberCC();
  updateCCSumRow();
}
function renumberCC() {
  renumberRows("#cc-tbody", ".cc-sum-row");
}

function updateCCSumRow() {
  const rows = document.querySelectorAll("#cc-tbody tr:not(.cc-sum-row)");
  const dayT = new Array(7).fill(0);
  let tc = 0,
    totalLuong = 0,
    totalPC = 0,
    totalHD = 0,
    totalTC = 0;
  rows.forEach((tr) => {
    for (let i = 0; i < 7; i++)
      dayT[i] +=
        parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value || 0) || 0;
    const t =
      parseFloat(tr.querySelector('[data-cc="tc"]')?.textContent || 0) || 0;
    tc += t;
    const l =
      parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw || 0) || 0;
    const pc =
      parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw || 0) || 0;
    const hd =
      parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw || 0) || 0;
    totalLuong += t * l;
    totalPC += pc;
    totalHD += hd;
    totalTC += t * l + pc + hd; // Thực Lãnh = Lương + Phụ Cấp + HĐ Lẻ
  });
  let sumRow = document.querySelector("#cc-tbody .cc-sum-row");
  if (!sumRow) {
    sumRow = document.createElement("tr");
    sumRow.className = "cc-sum-row";
    document.getElementById("cc-tbody").appendChild(sumRow);
  }
  const mono = "font-family:'IBM Plex Mono',monospace;font-weight:700";
  sumRow.innerHTML = `
    <td class="row-num col-num" style="font-size:10px;font-weight:700;color:var(--ink2)">∑</td>
    <td class="cc-sticky-name col-name" style="padding:7px 10px;font-size:10px;font-weight:700;color:var(--ink2);text-transform:uppercase;letter-spacing:.5px">TỔNG</td>
    <td class="col-tp"></td>
    ${dayT.map((v) => `<td class="col-day" style="text-align:center;${mono};font-size:12px;color:var(--ink2);padding:6px 4px">${round1(v) || ""}</td>`).join("")}
    <td class="col-tc" style="text-align:center;${mono};font-size:14px;color:var(--gold);padding:6px 8px">${round1(tc)}</td>
    <td class="col-luong"></td>
    <td class="col-total-luong" style="text-align:right;${mono};font-size:13px;color:var(--green);padding:6px 8px;white-space:nowrap">${totalLuong > 0 ? numFmt(totalLuong) : "—"}</td>
    <td class="col-phucap" style="text-align:right;${mono};font-size:12px;color:var(--blue);padding:6px 8px;white-space:nowrap">${totalPC > 0 ? numFmt(totalPC) : "—"}</td>
    <td class="cc-debt-col col-hdml" style="text-align:right;${mono};font-size:12px;color:var(--ink2);padding:6px 8px;white-space:nowrap">${totalHD > 0 ? numFmt(totalHD) : "—"}</td>
    <td class="cc-debt-col col-nd"></td>
    <td class="col-total" style="text-align:right;${mono};font-size:14px;color:var(--gold);padding:6px 8px;white-space:nowrap;background:#fff8e8">${totalTC > 0 ? numFmt(totalTC) : totalTC < 0 ? "(" + numFmt(-totalTC) + ")" : "—"}</td>
    <td class="col-del"></td>
  `;
  document.getElementById("cc-sum-tc").textContent = round1(tc);
  document.getElementById("cc-sum-luong").textContent = fmtM(totalLuong);
  document.getElementById("cc-sum-tongcong").textContent = fmtM(totalTC);
}

// ─── save ─────────────────────────────────────────────────────────
function saveCCWeek() {
  // Chống double click — disable nút trong lúc save
  const btn = document.getElementById("cc-save-btn");
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;

  const fromDate = document.getElementById("cc-from").value;
  const toDate = document.getElementById("cc-to").value;
  const ccCtSel = document.getElementById("cc-ct-sel");
  const ct = (ccCtSel.value || "").trim();
  const ctPid = _readPidFromSel(ccCtSel);

  const _enableBtn = () => {
    if (btn) {
      btn.disabled = false;
      updateCCSaveBtn();
    }
  };

  if (!fromDate) {
    toast("Chọn ngày bắt đầu tuần!", "error");
    _enableBtn();
    return;
  }
  if (!ct) {
    toast("Chọn công trình!", "error");
    _enableBtn();
    return;
  }
  if (_checkProjectClosed(ctPid, ct)) {
    _enableBtn();
    return;
  }

  // check duplicate names (không phân biệt hoa thường)
  const names = [];
  let dupFound = false;
  document
    .querySelectorAll('#cc-tbody tr:not(.cc-sum-row) [data-cc="name"]')
    .forEach((el) => {
      const n = el.value.trim();
      const nL = n.toLowerCase();
      if (n && names.includes(nL)) {
        dupFound = true;
        el.style.boxShadow = "inset 0 0 0 2px var(--red)";
      } else if (n) names.push(nL);
    });
  if (dupFound) {
    toast("⚠️ Còn tên trùng nhau! Sửa trước khi lưu.", "error");
    _enableBtn();
    return;
  }

  const workers = [];
  document.querySelectorAll("#cc-tbody tr:not(.cc-sum-row)").forEach((tr) => {
    const name = tr.querySelector('[data-cc="name"]')?.value?.trim() || "";
    const luong =
      parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw || 0) || 0;
    const phucap =
      parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw || 0) || 0;
    const hdmuale =
      parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw || 0) || 0;
    const nd = tr.querySelector('[data-cc="nd"]')?.value?.trim() || "";
    const role = tr.querySelector('[data-cc="tp"]')?.value || "";
    const d = [];
    for (let i = 0; i < 7; i++)
      d.push(
        parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value || 0) || 0,
      );
    if (name || d.some((v) => v > 0))
      // loanAmount / tru = 0: nghiệp vụ tạm ứng & trả nợ đã tách hẳn sang popup "Tiền ứng CN"
      // (ung_v1, loai=congnhan). Giữ field = 0 cho tương thích schema cũ; dữ liệu cũ vẫn
      // được _calcDebtBefore cộng dồn để không mất nợ tồn.
      workers.push({
        name,
        luong,
        d,
        phucap,
        hdmuale,
        loanAmount: 0,
        nd,
        role,
        tru: 0,
      });
  });
  if (!workers.length) {
    toast("Chưa có công nhân nào!", "error");
    _enableBtn();
    return;
  }

  // ── Dedup + save theo key duy nhất: fromDate|projectId ────────
  // [MODIFIED] matchKey: projectId ưu tiên tuyệt đối, fallback ct
  const matchKey = (w) => {
    if (w.deletedAt) return false;
    if (w.fromDate !== fromDate) return false;
    if (ctPid) return w.projectId === ctPid || w.ctPid === ctPid;
    return w.ct === ct;
  };
  // Xóa mọi duplicate — giữ record updatedAt mới nhất nếu bị trùng
  const dups = ccData.filter((w) => matchKey(w));
  if (dups.length > 1) {
    dups.sort(
      (a, b) => (b.updatedAt || b.id || 0) - (a.updatedAt || a.id || 0),
    );
    ccData = ccData.filter((w) => !matchKey(w));
    ccData.unshift(dups[0]);
  }
  // Update hoặc tạo mới — dùng mkRecord/mkUpdate để luôn đủ 6 field chuẩn
  // (id, createdAt, updatedAt, deletedAt, deviceId, projectId)
  const idx = ccData.findIndex((w) => matchKey(w));
  if (idx >= 0) {
    // Gom các thay đổi rồi đưa qua mkUpdate: giữ id/createdAt cũ,
    // tự cập nhật updatedAt + deviceId của thiết bị hiện tại.
    const changes = { workers, toDate };
    if (ctPid) {
      changes.projectId = ctPid;
      changes.ctPid = ctPid;
    }
    if (ct) changes.ct = ct;
    ccData[idx] = mkUpdate(ccData[idx], changes);
  } else {
    // Tạo record mới: mkRecord tự sinh id/createdAt/updatedAt/deletedAt/deviceId
    ccData.unshift(
      mkRecord({ fromDate, toDate, ct, ctPid, projectId: ctPid || null, workers }),
    );
  }
  save("cc_v2", ccData);
  clearInvoiceCache();
  updateTop(); // xóa cache cũ → rebuild từ ccData mới nhất

  // Không tự động thêm công nhân mới vào danh mục từ dữ liệu chấm công

  rebuildCCNameList();
  populateCCCtSel();
  // Restore filter context: đúng tuần + đúng CT cho cả 2 bảng
  document.getElementById("cc-hist-week").value = fromDate;
  document.getElementById("cc-tlt-week").value = fromDate;
  const _histCt = document.getElementById("cc-hist-ct");
  const _tltCt = document.getElementById("cc-tlt-ct");
  if (_histCt) _histCt.value = ct;
  if (_tltCt) _tltCt.value = ct;
  renderCCHistory(); // cập nhật bảng lịch sử và TLT sau khi lưu
  renderCCTLTMini(); // cập nhật bảng tổng lương mini ở subtab 1
  // Scroll xuống bảng tổng lương mini (user đang ở subtab 1) để thấy dữ liệu vừa lưu
  setTimeout(() => {
    document
      .getElementById("cc-tlt-mini-summary")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 150);
  const totalLuong = workers.reduce((s, wk) => {
    const tc = round1(wk.d.reduce((a, v) => a + v, 0));
    return s + tc * (wk.luong || 0) + (wk.phucap || 0);
  }, 0);
  const hdCount = workers.filter((w) => w.hdmuale > 0).length;
  const msg =
    `✅ Đã lưu ${viShort(fromDate)}–${viShort(toDate)} [${ct}]` +
    (hdCount ? ` · ${hdCount} HĐ lẻ` : "") +
    (totalLuong > 0 ? " · Nhân công cập nhật" : "");
  toast(msg, "success");
  // Re-enable nút sau khi IDB write xong (~500ms)
  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      updateCCSaveBtn();
    }
  }, 500);
}

function clearCCWeek() {
  if (!confirm("Xóa bảng nhập tuần này?")) return;
  buildCCTable([]);
}
let ccClipboard = null;
function copyCCWeek() {
  const workers = [];
  document.querySelectorAll("#cc-tbody tr:not(.cc-sum-row)").forEach((tr) => {
    const name = tr.querySelector('[data-cc="name"]')?.value?.trim() || "";
    const luong =
      parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw || 0) || 0;
    const d = [];
    for (let i = 0; i < 7; i++)
      d.push(
        parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value || 0) || 0,
      );
    const roleCopy = tr.querySelector('[data-cc="tp"]')?.value || "";
    // Chỉ copy: tên, lương, ngày công — không copy phụ cấp/HĐ lẻ/vay/trừ/nội dung (dữ liệu phát sinh theo tuần)
    if (name || luong > 0 || d.some((v) => v > 0))
      workers.push({
        name,
        luong,
        d,
        phucap: 0,
        hdmuale: 0,
        loanAmount: 0,
        nd: "",
        role: roleCopy,
        tru: 0,
      });
  });
  if (!workers.length) {
    toast("Bảng trống, chưa có gì để copy!", "error");
    return;
  }
  ccClipboard = workers;
  document.getElementById("cc-paste-btn").style.display = "";
  const tc = workers.reduce((s, w) => s + w.d.reduce((a, v) => a + v, 0), 0);
  toast(
    "📋 Đã copy " +
      workers.length +
      " công nhân (" +
      tc +
      " công) — nhấn Dán để áp dụng!",
    "success",
  );
}
function pasteCCWeek() {
  if (!ccClipboard || !ccClipboard.length) {
    toast("Chưa copy tuần nào!", "error");
    return;
  }
  // Dán: tên, lương, ngày công (phụ cấp/HĐ lẻ/trừ/nội dung đã reset từ lúc copy)
  buildCCTable(ccClipboard.map((w) => ({ ...w })));
  toast(
    "📌 Đã dán " + ccClipboard.length + " công nhân đầy đủ ngày công!",
    "success",
  );
}
