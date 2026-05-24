# AI_CONTEXT.md

Tài liệu ngữ cảnh kỹ thuật cho AI Code khi làm việc với project **App Quản Lý Chi Phí Công Trình**.

---

## 1. Tổng quan ứng dụng (Project Overview)

| Hạng mục | Mô tả |
|---|---|
| Loại ứng dụng | SPA tĩnh, Vanilla JS, không bundler, không ES module import/export |
| Entry point | `index.html` nạp toàn bộ CSS/JS bằng `<script>` tuần tự |
| Mục đích | Quản lý chi phí công trình: hóa đơn, chấm công, thiết bị, tiền ứng, doanh thu, công nợ, nhập/xuất dữ liệu |
| UI language | Tiếng Việt, domain text dùng thuật ngữ xây dựng/kế toán Việt Nam |
| Core tech | HTML, CSS, Vanilla JavaScript, IndexedDB qua Dexie, Firebase/Firestore REST sync, XLSX import/export, html2canvas export image |
| Runtime style | Global mutable state trên `window`/global scope; file sau gọi trực tiếp biến/hàm của file trước |

Kiến trúc tổng thể:

```mermaid
flowchart TD
  UI["index.html UI: tabs, forms, tables, dashboards"] --> JS["Global JS runtime"]
  JS --> Core["core.*.js: load/save, Dexie, migrations, categories (3 files)"]
  JS --> Domain["Domain modules: projects, hoadon, chamcong, thietbi, doanhthu, danhmuc"]
  JS --> Tools["nhapxuat.js + datatools.js"]
  Core --> IDB[("IndexedDB / Dexie: qlct")]
  Sync["sync.js"] --> Cloud[("Firebase Firestore REST")]
  Core --> Sync
  Sync --> Core
```

---

## 2. Thứ tự nạp Script (Script Load Order)

Thứ tự chính xác trong `index.html`:

| # | Script | Vai trò |
|---:|---|---|
| 1 | `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` | Thư viện Excel |
| 2 | `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js` | Export UI/table thành ảnh |
| 3 | `https://unpkg.com/dexie@4/dist/dexie.min.js` | IndexedDB wrapper |
| 4 | `js/core/core.storage.js` | Lớp nền thấp nhất: `DEFAULTS`, `CATS`, `FB_CONFIG`, Dexie `db`, `DB_KEY_MAP`, `_mem`, `load/save`, pending sync counter (`_pendingChanges`, `_SYNC_DATA_KEYS`, `_incPending`, `_resetPending`, `_updateSyncBtnBadge`), `LAST_SYNC_KEY`, `mkRecord`, `mkUpdate`, autocomplete |
| 5 | `js/core/core.state-backup.js` | State orchestration: `DATA_VERSION`, `migrateData`, `_migrateHopDongKeys`, project lookup helpers, `BACKUP_KEYS`, backup/restore (`_snapshotNow`, `restoreFromBackup`, `renderBackupList`), `exportJSON`, `importJSON`, `importJSONFull`, `clearAllCache`, `afterDataChange`, `_reloadGlobals`, khởi tạo global `cats`, `cnRoles`, `invoices`, `filteredInvs`, `curPage`, `PG` |
| 6 | `js/core/core.cloud-cats-ui.js` | Cloud helpers: `fbReady`, compress/expand (Firestore format), `fsWrap/fsUnwrap`, `fbYearPayload`, `fbCatsPayload`, Firebase REST (`fsGet/fsSet`), `gsLoadAll`, sync dot UI, modal Firebase config (`openBinModal`, `fbSaveConfig`, `fbDisconnect`), `buildYearSelect`, `saveCats`, cat items soft-delete (`_syncCatItems`, `_rebuildCatArrsFromItems`, `_migrateCatItemsIfNeeded`), `showSyncBanner`, `_setSyncState` |
| 7 | `js/modules/projects/projects.model.js` | Domain model công trình: `PROJECT_STATUS`, `PROJECT_COMPANY`, `let projects = []`, `_saveProjects`, `rebuildCatCTFromProjects`, `createProject`, `updateProject`, `getProjectById`, `findProjectIdByName`, `getSortedProjects`, `getAllProjects`, `getProjectOptions`, `getProjectDays/Factor/Weight`, `getCompanyCost`, `allocateCompanyCost`, `canDeleteProject`, `resolveProjectName` |
| 8 | `js/modules/projects/projects.migration-selects.js` | Migration linking + shared select helpers: `migrateProjectLinks`, `deduplicateProjects`, `_buildProjOpts`, `_buildProjFilterOpts`, `_readPidFromSel`, `_checkProjectClosed` |
| 9 | `js/modules/projects/projects.ui.js` | Full UI tab Công Trình: `_fmtProjDate`, `_PT_STATUS_META`, `_PT_GROUP_LABELS`, `_PT_ORDER`, `_goTabWithCT`, `renderProjectsPage`, `renderCTOverview`, `_ctApply`, `_ctRenderGrid`, `openCTDetail`, `openCTCreateModal`, `saveCTCreate`, `openCTEditModal`, `saveCTEdit`, `quickCloseCT`, `confirmQuickClose`, `quickCompleteCT`, `confirmQuickComplete`, `confirmDeleteCT` |
| 10 | `js/legacy/tienich.js` | Utility, formatter, `buildInvoices()`, invoice cache |
| 11 | `js/modules/hoadon/hoadon.quick-entry.js` | Nhập hóa đơn nhanh, duplicate check, shared row/money helpers: `initTable`, `addRows`, `addRow`, `delRow`, `renumber`, `calcSummary`, `clearTable`, `saveAllRows`, `_showDupModal`, `closeDupModal`, `forceSaveAll`, `_ensureInvRef`, `_doSaveRows`, `calcRowMoney`, `getRowData` |
| 12 | `js/modules/hoadon/hoadon.sheet-grid.js` | Engine lưới nhập liệu giống Excel cho hóa đơn nhanh: selection, copy/paste vùng, keyboard navigation, autocomplete trực tiếp trong bảng |
| 13 | `js/modules/hoadon/hoadon.detail-entry.js` | Hóa đơn chi tiết nhiều dòng vật tư/nội dung: `goInnerSub`, `_initDetailFormSelects`, `renderDetailRowHTML`, `addDetailRow`, `delDetailRow`, `calcDetailRow`, `calcDetailTotals`, `generateDetailNd`, `saveDetailInvoice`, `clearDetailForm`, `_setSelectFlexible`, `openDetailEdit`, `getDetailRows` |
| 14 | `js/modules/hoadon/hoadon.list-trash.js` | Filter/render danh sách, sửa/xóa, thùng rác, hóa đơn trong ngày: `switchTatCaView`, `buildFilters`, `filterAndRender`, `renderTable`, `goTo`, `delInvoice`, `editCCInvoice`, `openEntryEdit`, `_resolveInvSource`, `editManualInvoice`, `trash` (global), `trashAdd`, `trashRestore`, `trashDeletePermanent`, `trashClearAll`, `renderTrash`, `renderTodayInvoices`, `refreshHoadonCtDropdowns` |
| 15 | `js/modules/danhmuc/danhmuc.categories.js` | Danh mục/settings: normalize, render settings, CT page, CN role, tbTen, rebuild selects, dedup cat arrays |
| 16 | `js/modules/tienung/tienung.core.js` | Tiền Ứng core: `ungRecords`, migration/normalize deletedAt/projectId, shared state cho entry/history |
| 17 | `js/modules/tienung/tienung.entry.js` | Form nhập tiền ứng nhiều dòng, đổi loại ứng, lưu/xóa dòng, rebuild selects |
| 18 | `js/modules/tienung/tienung.history.js` | Lịch sử tiền ứng, lọc/tìm kiếm, phân trang, xuất CSV/ảnh phiếu ứng |
| 19 | `js/modules/danhmuc/danhmuc.tools.js` | Wrapper backup/restore (`toolBackupNow`, `toolRestoreBackup`) |
| 20 | `js/modules/nhapxuat/nhapxuat.parsers.js` | Helper parse/normalize Excel + parser sheet 1–9: `_normStr`, `_parseDate`, `_pNum`, `_str`, `_sheetRows`, `_hasDiacritics`, `_deduplicateCatNames`, `_buildCanonMap`, `_dayOfWeek`, `_isEmptyRow`, `_formatCatName`, `_markDuplicateInBatch`, `_makeCatLookup`, `_makeCatLookupWithExtra`, `_resolveProvisionalProjectIds`, `_mkErr`, `_fmtErr`, `parseSheet1`–`parseSheet9`, `_DANHMUC_GROUP_MAP` |
| 21 | `js/modules/nhapxuat/nhapxuat.import.js` | Import session, detect sheet, preview, apply import, log: `_isDupInvQ/D/Ung/Thu/Tb/Tp/CC`, `_detectSheetType`, `_importSession`, `_doImportParse`, `_markDuplicates`, `_showImportPreviewNew`, `_toggleAllImportSheets`, `_applyImport`, `_generateImportLog`, `openImportModal`, `handleImportFile` |
| 22 | `js/modules/nhapxuat/nhapxuat.export.js` | Export modal, Excel sheet builders, CSV exports: `openExportModal`, `_buildSheet`, `buildHoaDonNhanh/ChiTiet/ChamCong/TienUng/ThietBi/DanhMuc/HopDongChinh/ThuTien/HopDongThauPhu/HuongDan`, `exportExcel`, `_doExport`, `exportEntryCSV`, `exportAllCSV`, `toolImportExcel`, `toolExportExcel` |
| 23 | `js/legacy/datatools.js` | Dashboard, reset/delete-year, data health, migration tools |
| 24 | `js/modules/chamcong/chamcong.core.js` | Global data (`ccData`, `ccOffset`, `ccHistPage`, `ccTltPage`), constants (`CC_DAY_LABELS`, `CC_DATE_OFFSETS`), date/week helpers, normalize/category helpers, CT selector helpers: `_dedupCC`, `round1`, `toggleCCDebtCols`, `_calcDebtBefore`, `isoFromParts`, `ccSundayISO`, `ccSaturdayISO`, `snapToSunday`, `weekLabel`, `ccAllNames`, `rebuildCCNameList`, `normalizeAllChamCong`, `rebuildCCCategories`, `updateTopFromCC`, `populateCCCtSel`, `updateCCSaveBtn`, `onCCCtSelChange`, `_fmtDate` |
| 25 | `js/modules/chamcong/chamcong.week-form.js` | Form nhập tuần, build table, row handlers, lưu/copy/paste: `initCC`, `ccGoToWeek`, `ccPrevWeek`, `ccNextWeek`, `onCCFromChange`, `loadCCWeekForm`, `buildCCTable`, `addCCWorker`, `addCCRow`, `buildCCRow`, `onCCNameInput`, `onCCDayKey`, `onCCWageKey`, `onCCMoneyKey`, `calcCCRow`, `delCCRow`, `renumberCC`, `updateCCSumRow`, `saveCCWeek`, `clearCCWeek`, `copyCCWeek`, `pasteCCWeek`; global `ccClipboard` |
| 26 | `js/modules/chamcong/chamcong.history-reports.js` | Lịch sử, tổng lương tuần, load/delete, CSV exports, phiếu lương/ảnh: `buildCCHistFilters`, `renderCCHistory`, `ccHistGoTo`, `renderCCTLT`, `fmtK`, `updateTLTSelectedSum`, `exportCCTLTCSV`, `ccTltGoTo`, `loadCCWeekById`, `delCCWeekById`, `delCCWorker`, `exportCCWeekCSV`, `exportCCHistCSV`, `removeVietnameseTones`, `xuatPhieuLuong`, `exportUngToImage` |
| 27 | `js/legacy/thietbi.js` | Quản lý thiết bị/kho tổng |
| 28 | `js/modules/doanhthu/doanhthu.core.js` | Global data (`hopDongData`, `thuRecords`, `thauPhuContracts`), state, shared helpers: `calcHopDongValue`, `_migrateHopDongSL`, `_normalizeThuProjectIds`, `bindItemsToTable`, `dtGoSub`, `dtPopulateSels`, `fmtInputMoney`, `_readMoneyInput`, `_dtPaginationHtml`, `_dtMatchProjFilter`, `_dtMatchHDCFilter`, pagination state, CT filter |
| 29 | `js/modules/doanhthu/doanhthu.forms.js` | Form save/edit/delete và render tables: `hdcUpdateTotal`, `saveHopDongChinh`, `editHopDongChinh`, `delHopDongChinh`, `renderHdcTable`, `saveThuRecord`, `editThuRecord`, `delThuRecord`, `renderThuTable`, `hdtpUpdateTotal`, `saveHopDongThauPhu`, `editHopDongThauPhu`, `delHopDongThauPhu`, `renderHdtpTable` |
| 30 | `js/modules/doanhthu/doanhthu.reports-export.js` | Công nợ, Lãi/Lỗ, init, copy/paste KLCT, xuất phiếu ảnh: `renderCongNoThauPhu`, `_renderCongNoTable`, `renderCongNoNhaCungCap`, `renderLaiLo`, `initDoanhThu`, `copyKLCT`, `pasteKLCT`, `exportHdcToImage`, `exportHdtpToImage`, `exportThuToImage`; gán `window.initDoanhThu`, `window.dtGoSub` |
| 31 | `js/sync/sync.v2format.js` | V2 Firestore format helpers — human-readable document IDs, field maps, typed value converters, push subcollection (year + meta), pull subcollection (year), debug helper |
| 32 | `js/sync/sync.v2meta.js` | V2 Meta Pull Module — đọc 4 loại meta từ V2 subcollections song song: `_v2PullProjects`, `_v2PullUsers`, `_v2PullDanhMuc`, `_v2PullHopDong`, `_v2PullMetaFull`; `_mergeUsersV2` (password-safe merge) |
| 33 | `js/sync/sync.js` | Sync engine Firestore, conflict merge, auto/manual sync |
| 34 | `js/app/auth.js` | Auth/session/role UI: đăng nhập, đăng xuất, đổi thông tin tài khoản, quản lý `users_v1`, phân quyền `admin`/`giamdoc`/`ketoan` |
| 35 | `js/app/main.js` | Bootstrap khởi động cuối cùng: init, year filter, tab rendering, role UI, auto-sync |

Thứ tự này quan trọng vì code không dùng module system. Nhóm `core.*.js` **bắt buộc nạp trước tất cả module nghiệp vụ**. Các file dùng chung biến/hàm global như `load`, `save`, `cats`, `projects`, `invoices`, `ccData`, `hopDongData`, `buildInvoices`, `pullChanges`, `manualSync`. Nếu đổi thứ tự, module có thể đọc biến chưa khai báo hoặc render trước khi `dbInit()` populate `_mem`.

> **`sync.v2format.js` (vị trí 31)** phải nạp **trước `sync.v2meta.js` và `sync.js`** vì cả hai file sau đều dùng `_v2FsGetSubcollDocs`, `_v2FromFsFields`, `_v2ReverseApplyFieldMap`, `_V2_FIELD_MAPS`, `_V2_SUBCOLL_NAME` từ file này. File này không có side-effect lúc nạp, sử dụng `FS_BASE()` và `FB_CONFIG` từ `core.storage.js` (vị trí 4).

> **`sync.v2meta.js` (vị trí 32)** phải nạp **sau `sync.v2format.js`** (phụ thuộc các helpers V2) và **trước `sync.js`** (pullChanges gọi `_v2PullMetaFull`). File không có side-effect lúc nạp.

---

## 3. Sơ đồ thư mục (Directory Structure)

```text
index.html                    ← Entry point SPA
AI_CONTEXT.md
assets/
  css/
    style.css                 ← Stylesheet duy nhất

js/
  core/                       ← Nạp đầu tiên, nền tảng toàn app
    core.storage.js
    core.state-backup.js
    core.cloud-cats-ui.js

  modules/                    ← Các module nghiệp vụ đã tách
    hoadon/
      hoadon.quick-entry.js
      hoadon.sheet-grid.js
      hoadon.detail-entry.js
      hoadon.list-trash.js
    projects/
      projects.model.js
      projects.migration-selects.js
      projects.ui.js
    danhmuc/
      danhmuc.categories.js
      danhmuc.tools.js
    tienung/
      tienung.core.js
      tienung.entry.js
      tienung.history.js
    nhapxuat/
      nhapxuat.parsers.js
      nhapxuat.import.js
      nhapxuat.export.js
    chamcong/
      chamcong.core.js
      chamcong.week-form.js
      chamcong.history-reports.js
    doanhthu/
      doanhthu.core.js
      doanhthu.forms.js
      doanhthu.reports-export.js

  legacy/                     ← File chưa tách module, vẫn ở dạng đơn khối
    tienich.js
    hoadon.js
    datatools.js
    thietbi.js

  sync/
    sync.v2format.js          ← V2 Firestore format helpers (push year + meta, pull year)
    sync.v2meta.js            ← V2 Meta Pull Module (pull projects/users/catItems/hopDong)
    sync.js                   ← Sync engine Firestore

  app/
    auth.js
    main.js                   ← Bootstrap cuối cùng
```

**Lưu ý tổ chức thư mục:**
- Thư mục chỉ là tổ chức **vật lý** — không phải module system, không dùng `import/export`.
- Toàn bộ file vẫn chạy global scope qua `<script>` tuần tự trong `index.html`.
- `js/legacy/` chứa các file chưa được tách module; có thể tách thêm trong tương lai theo cùng pattern.
- Khi thêm file mới: phải thêm `<script src="...">` vào `index.html` đúng thứ tự và cập nhật `AI_CONTEXT.md`.

---

## 4. Kiến trúc lưu trữ (Storage Architecture)

| Layer | Thành phần | Vai trò |
|---|---|---|
| Source of truth local | IndexedDB qua Dexie DB `qlct` | Nguồn dữ liệu gốc khi app chạy offline-first |
| Memory snapshot | `_mem` trong `core.js` | Cache runtime; `load(k, def)` chỉ đọc từ `_mem` sau `dbInit()` |
| Write path | `save(k, v)` | Cập nhật `_mem`, ghi Dexie bằng `_dbSave()`, invalidate invoice cache, đánh dấu pending, debounce sync |
| Sync cloud | `sync.js` + Firebase/Firestore REST | Pull/merge/push dữ liệu theo năm và document categories |
| LocalStorage | Config/session only | Lưu Firebase config, `deviceId`, session user, pending marker, block-pull marker; không là nguồn dữ liệu nghiệp vụ |

Dexie physical schema:

| Dexie table | Key/index | Logical keys |
|---|---|---|
| `invoices` | `id, updatedAt` | `inv_v3` |
| `attendance` | `id, updatedAt` | `cc_v2` |
| `equipment` | `id, updatedAt` | `tb_v1` |
| `ung` | `id, updatedAt` | `ung_v1` |
| `revenue` | `id, updatedAt` | `thu_v1` |
| `settings` | `id` | `projects_v1`, `hopdong_v1`, `thauphu_v1`, `trash_v1`, `users_v1`, `cat_ct_years`, `cat_cn_roles`, `cat_items_v1` |

Offline-first data flow:

```mermaid
sequenceDiagram
  participant User
  participant UI
  participant Mem as _mem
  participant IDB as IndexedDB/Dexie
  participant Sync as sync.js
  participant Cloud as Firestore

  User->>UI: create/edit/delete
  UI->>Mem: save(key, value)
  Mem->>IDB: _dbSave(key, value)
  Mem->>Sync: schedulePush() debounce
  Sync->>Cloud: pushChanges()
  Sync->>Cloud: pullChanges()
  Cloud-->>Sync: year/categories docs
  Sync->>Mem: mergeDatasets()/normalizeCC()
  Mem->>IDB: _memSet()
  UI->>Mem: load(key, default)
```

Sync rules:

| Rule | Mô tả |
|---|---|
| Conflict resolution | `resolveConflict(local, cloud)`: tombstone (`deletedAt`) ưu tiên, sau đó `updatedAt` mới hơn thắng |
| Multi-year sync | `_getAllLocalYears()` gom năm từ `inv_v3`, `ung_v1`, `cc_v2`, `tb_v1`, `thu_v1`; push/pull theo year document |
| Categories sync | Document categories chứa: <br> - `cat_items_v1`: { [type]: { id, name, isDeleted, updatedAt }[] } (Master category storage) <br> - `cat_ct`: string[] (Derived from projects_v1) <br> - `cat_ct_years`: { [ctName]: number } <br> - `cat_loai`, `cat_ncc`, `cat_nguoi`, `cat_tp`, `cat_cn`, `cat_tbteb`: string[] (Derived from cat_items_v1) |
| Pull guard | `_blockPullUntil`/`localStorage._blockPullUntil` chặn pull sau reset/import để tránh cloud cũ ghi đè local mới |
| Pending | `_pendingChanges` và `_PENDING_KEY` giúp hiển thị trạng thái còn thay đổi chưa sync |
| **V2 Firestore Subcollection** | Cấu trúc: parent document chứa summary fields (tiếng Việt, typed) + subcollection `ban_ghi/` chứa từng record riêng lẻ với human-readable document ID (`{ngay}_{slug}_{tien}_{uid6}`). **Push** (`sync.v2format.js`): chạy sau manual sync hoặc auto-debounce (đã tăng 30s → 5 phút). Incremental: lần đầu full write, lần sau chỉ ghi record `updatedAt > lastPush`, xóa `deletedAt > lastPush`. Timestamp `lastPush` ở localStorage `_v2SubcollLastPush`. **Pull year** (`sync.v2format.js`): `_v2PullYearFull(yr)` đọc 5 loại năm từ V2 subcollections. **Pull meta** (`sync.v2meta.js`): `_v2PullMetaFull()` đọc 4 loại meta song song — V2 là **primary read source** cho cả year data và meta data; V1 cats/year docs chỉ còn là fallback khi V2 chưa có data. `_mergeUsersV2` đảm bảo password không bị mất khi merge (V2 không lưu password). `meta_danh_muc` parent document lưu thêm `cn_roles` + `ct_years` để pull về được. **V1 cats push đã XÓA hoàn toàn** trong pushChanges. |
| **V2 Quota Optimization (Phase 1+2+3+4)** | Tối ưu giảm reads ~99% và writes ~99% cho idle sync. **Phase 1 — Last-Modified Guard:** mỗi parent doc lưu field `last_modified_ms = max(updatedAt, deletedAt)`. Pull đọc parent trước (1 read), nếu `cloud.last_modified_ms <= localStorage._v2SubcollLastPull[docId]` → skip subcollection read (tiết kiệm hàng trăm reads/sync). Helpers: `_v2GetLastPull`, `_v2SetLastPull`, `_v2CheckLastModified`, `_v2ResetAllLastPull`. **Phase 2 — Skip-when-unchanged:** `_v2PushSubcoll` skip cả summary PATCH + writes khi `lastPush>0 && writes.length===0`. `_v2PushSubcollFull` (cho danh_muc/hop_dong) dùng **hash-skip**: tính hash `id:updatedAt` từ active records, lưu `localStorage._v2HashFull_<docId>`; nếu hash trùng → skip toàn bộ (tránh full rewrite 163 writes/sync vô ích). **Phase 3 — Skip summary PATCH:** gộp vào Phase 2 — khi writes=0 thì cũng không PATCH parent summary. **Phase 4 — Frequency + Cleanup:** debounce auto-sync `30_000` → `300_000` ms (5 phút). Pre-push pull skip nếu `Date.now() - localStorage._lastPullTs < 60_000` (vừa pull gần đây). Users pre-push merge chuyển từ `fsGet(fbDocCats())` sang `_v2PullUsers()` (rẻ với guard). **localStorage keys mới:** `_v2SubcollLastPull` (map docId→ts), `_v2HashFull_<docId>` (hash per doc), `_v2Initialized` ('1' sau lần `_v2PushMeta` đầu tiên — pull dùng làm V2-ready signal thay vì check data.length), `_lastPullTs` (timestamp pullChanges xong). |

---

## 5. Sơ đồ dữ liệu (Data Model)

| Logical key | Kiểu | Object chính | Fields quan trọng |
|---|---|---|---|
| `inv_v3` | `Array<Object>` | Hóa đơn | `id:string`, `ngay:YYYY-MM-DD`, `congtrinh:string`, `projectId:string|null`, `loai:string`, `nguoi:string`, `ncc:string`, `nd:string`, `tien:number`, `thanhtien:number`, `sl:number`, `items:array?`, `source:string?`, `ccKey:string?`, `createdAt:number`, `updatedAt:number`, `deletedAt:number|null`, `deviceId:string` |
| `cc_v2` | `Array<Object>` | Chấm công tuần | `id:string`, `fromDate:YYYY-MM-DD`, `toDate:YYYY-MM-DD`, `ct:string`, `projectId:string|null`, `ctPid:string?`, `workers:array`, `createdAt:number`, `updatedAt:number`, `deletedAt:number|null`, `deviceId:string` |
| `cc_v2.workers[]` | `Array<Object>` | Dòng công nhân | `name:string`, `d:number[7]`, `luong:number`, `phucap:number`, `hdmuale:number`, `tru:number`, `loanAmount:number`, `nd:string`, `role:string?` |
| `tb_v1` | `Array<Object>` | Thiết bị | `id:string`, `ct:string`, `projectId:string|null`, `ten:string`, `soluong:number`, `tinhtrang:string`, `nguoi:string`, `ghichu:string`, `ngay:string`, metadata |
| `ung_v1` | `Array<Object>` | Tiền ứng | `id:string`, `ngay:string`, `loai:'thauphu'|'nhacungcap'|'congnhan'`, `tp:string`, `congtrinh:string`, `projectId:string|null`, `tien:number`, `nd:string`, metadata |
| `thu_v1` | `Array<Object>` | Thu tiền | `id:string`, `ngay:string`, `congtrinh:string`, `projectId:string|null`, `tien:number`, `nguoi:string`, `nd:string`, metadata |
| `projects_v1` | `Array<Object>` | Master công trình | `projects_v1`: { id, name, type, status, startDate, endDate, closedDate, note, createdYear, createdAt, updatedAt, deletedAt } <br> - Special ID: `COMPANY` (CÔNG TY) for overhead costs. <br> - Statuses: `planning`, `active`, `completed`, `closed`. <br> - Types: `CT` (Công trình), `SC` (Sửa chữa), `OTHER`. |
| `hopdong_v1` | `Object map` | Hợp đồng chính | Key ưu tiên là `projectId`, legacy fallback là tên CT. Value: `giaTri:number`, `giaTriphu:number`, `phatSinh:number`, `nguoi:string`, `ngay:string`, `projectId:string`, `items:array?`, `updatedAt:number`, `deletedAt:number|null` |
| `thauphu_v1` | `Array<Object>` | Hợp đồng thầu phụ | `id:string`, `ngay:string`, `congtrinh:string`, `projectId:string|null`, `thauphu:string`, `giaTri:number`, `phatSinh:number`, `nd:string`, `items:array?`, metadata |
| `trash_v1` | `Array/Object` | Thùng rác hóa đơn | Lưu record bị đưa vào trash; vẫn cần giữ metadata để phục hồi/đối chiếu |
| `users_v1` | `Array<Object>` | User/auth | `id:string`, `username:string`, `password:string`, `role:'admin'|'giamdoc'|'ketoan'`, `updatedAt:number`, `sessionVersion:number`, `sessions:array` |
| `cat_items_v1` | `Object<string, Array>` | Danh mục có soft delete | Type keys: `loai`, `ncc`, `nguoi`, `tp`, `cn`, `tbteb`; item gồm `id:string`, `name:string`, `isDeleted:boolean`, `updatedAt:number` |
| `cat_cn_roles` | `Object` | Vai trò công nhân | `{ [workerName:string]: string }` |
| `cat_ct_years` | `Object` | Năm công trình | `{ [projectName:string]: number }` |

Metadata chuẩn cho record nghiệp vụ:

| Field | Kiểu | Quy tắc |
|---|---|---|
| `id` | `string` | UUID từ `crypto.randomUUID()`; legacy id có migration trong Data Tools |
| `createdAt` | `number` | Unix ms khi tạo; giữ nguyên khi edit |
| `updatedAt` | `number` | Unix ms khi sửa/import/apply; dùng cho LWW |
| `deletedAt` | `number|null` | Soft delete/tombstone cho record nghiệp vụ |
| `deviceId` | `string` | Sinh một lần trong `sync.js`, lưu localStorage |

---

## 6. Hàm và Biến Global quan trọng (Key Functions & Globals)

| File | Globals quan trọng | Hàm xương sống |
|---|---|---|
| `js/core/core.storage.js` | `DEFAULTS`, `CATS`, `FB_CONFIG`, `FS_BASE`, `FB_CFG_KEY`, `db`, `DB_KEY_MAP`, `_mem`, `_pendingChanges`, `_blockPullUntil`, `LAST_SYNC_KEY`, `_SYNC_DATA_KEYS` | `_loadLS()`, `_saveLS()`, `_memSet()`, `dedupById()`, `mergeUnique()`, `_dbSave()`, `dbInit()`, `_incPending()`, `_resetPending()`, `_updateSyncBtnBadge()`, `load()`, `save()`, `mkRecord()`, `mkUpdate()`, `buildNDFromItems()`, `_normViStr()`, `_acHide()`, `_acShow()` |
| `js/core/core.state-backup.js` | `DATA_VERSION`, `DATA_VERSION_KEY`, `BACKUP_KEYS`, `BACKUP_KEY`, `cats`, `cnRoles`, `invoices`, `filteredInvs`, `curPage`, `PG` | `migrateData()`, `_migrateHopDongKeys()`, `_hdLookup()`, `_hdKeyOf()`, `_getProjectById()`, `_getProjectNameById()`, `_resolveCtName()`, `_restoreStore()`, `clearAllCache()`, `getState()`, `afterDataChange()`, `_reloadGlobals()`, `_snapshotNow()`, `getBackupList()`, `restoreFromBackup()`, `renderBackupList()`, `exportJSON()`, `importJSON()`, `importJSONFull()` |
| `js/core/core.cloud-cats-ui.js` | `lastSyncUI`, `_CATITEM_TYPE_MAP` | `fbReady()`, `compressInv()`, `expandInv()`, `compressCC()`, `expandCC()`, `compressUng()`, `expandUng()`, `compressTb()`, `expandTb()`, `fsWrap()`, `fsUnwrap()`, `fbDocYear()`, `fbDocCats()`, `fbYearPayload()`, `fbCatsPayload()`, `fsUrl()`, `fsGet()`, `fsSet()`, `estimateYearKb()`, `gsLoadAll()`, `updateJbBtn()`, `openBinModal()`, `closeBinModal()`, `fbSaveConfig()`, `fbDisconnect()`, `reloadFromCloud()`, `syncNow()`, `buildYearSelect()`, `saveCats()`, `_catNormKey()`, `_dedupCatItemsNow()`, `_syncCatItems()`, `_rebuildCatArrsFromItems()`, `_migrateCatItemsIfNeeded()`, `showSyncBanner()`, `hideSyncBanner()`, `_setSyncState()` |
| `js/app/main.js` | `activeYears`, `activeYear`, `currentUser`, `_roleObserver`, `_userHeartbeatTimer`, `window._dataReady` | `init()`, `initAuth()`, `goPage()`, `renderActiveTab()`, `buildYearSelect()`, `onYearChange()`, `applyRoleUI()`, `loadUsers()`, `saveUsers()` |
| `js/modules/projects/projects.model.js` | `PROJECT_STATUS`, `PROJECT_COMPANY`, `projects`, `_PROJ_DATE_RE`, `_VALID_STATUSES`, `_PROJ_VALID_TYPES`, `_PROJ_FACTORS` | `_projTypeByName()`, `_isValidProject()`, `cleanupInvalidProjects()`, `_saveProjects()`, `rebuildCatCTFromProjects()`, `_migrateProjectDates()`, `getProjectAutoStartDate()`, `createProject()`, `updateProject()`, `getProjectById()`, `findProjectIdByName()`, `getSortedProjects()`, `getAllProjects()`, `getProjectOptions()`, `getProjectDays()`, `getProjectFactor()`, `getProjectWeight()`, `getCompanyCost()`, `allocateCompanyCost()`, `canDeleteProject()`, `resolveProjectName()` |
| `js/modules/projects/projects.migration-selects.js` | _(không có global riêng)_ | `migrateProjectLinks()`, `deduplicateProjects()`, `_buildProjOpts()`, `_buildProjFilterOpts()`, `_readPidFromSel()`, `_checkProjectClosed()` |
| `js/modules/projects/projects.ui.js` | `_fmtProjDate`, `_PT_STATUS_META`, `_PT_GROUP_LABELS`, `_PT_ORDER`, `_ctSearch`, `_ctFStatus`, `_ctFType`, `_ctFLaiLo` | `_goTabWithCT()`, `renderProjectsPage()`, `_ctGetCosts()`, `_buildInvoiceMap()`, `_ctGetCostsFromMap()`, `_ptDuration()`, `_ptStatusBadge()`, `_ptStatBox()`, `_ptDurationDays()`, `renderCTOverview()`, `_ctApply()`, `_ctRenderGrid()`, `openCTDetail()`, `openCTCreateModal()`, `saveCTCreate()`, `openCTEditModal()`, `saveCTEdit()`, `quickCloseCT()`, `confirmQuickClose()`, `quickCompleteCT()`, `confirmQuickComplete()`, `confirmDeleteCT()` |
| `js/legacy/tienich.js` | `invoiceCache`, numeric keypad state | `buildInvoices()`, `getInvoicesCached()`, `clearInvoiceCache()`, format/date utilities |
| `js/modules/hoadon/hoadon.quick-entry.js` | _(không có global riêng ngoài scope của module)_ | `initTable()`, `addRows()`, `refreshEntryDropdowns()`, `addRow()`, `delRow()`, `renumber()`, `calcSummary()`, `clearTable()`, `saveAllRows()`, `_showDupModal()`, `closeDupModal()`, `forceSaveAll()`, `_ensureInvRef()`, `_doSaveRows()`, `calcRowMoney()`, `getRowData()` |
| `js/modules/hoadon/hoadon.sheet-grid.js` | Sheet/grid interaction state | Excel-like selection, copy/paste vùng, keyboard navigation, autocomplete trong bảng nhập nhanh |
| `js/modules/hoadon/hoadon.detail-entry.js` | _(không có global riêng)_ | `goInnerSub()`, `_initDetailFormSelects()`, `renderDetailRowHTML()`, `addDetailRow()`, `delDetailRow()`, `calcDetailRow()`, `calcDetailTotals()`, `generateDetailNd()`, `saveDetailInvoice()`, `clearDetailForm()`, `_setSelectFlexible()`, `openDetailEdit()`, `getDetailRows()` |
| `js/modules/hoadon/hoadon.list-trash.js` | `trash` (global shared state — gán lại bởi `_reloadGlobals()`) | `switchTatCaView()`, `buildFilters()`, `filterAndRender()`, `renderTable()`, `goTo()`, `delInvoice()`, `editCCInvoice()`, `openEntryEdit()`, `_resolveInvSource()`, `editManualInvoice()`, `trashAdd()`, `trashRestore()`, `trashDeletePermanent()`, `trashClearAll()`, `renderTrash()`, `renderTodayInvoices()`, `refreshHoadonCtDropdowns()` |
| `js/modules/danhmuc/danhmuc.categories.js` | `_catNamesMigrated`, `normalizeName`, `normalizeKey` | `renderCtPage()`, `showCtModal()`, `closeModal()`, `normalizeName()`, `normalizeKey()`, `_isDmItemUsedInYear()`, `_isDmItemUsedAnytime()`, `scanAndFixAllDataFormats()`, `_migrateCatNamesFormat()`, `renderSettings()`, `_dmFilterCard()`, `renderCTItem()`, `renderItem()`, `renderCNItem()`, `updateCNRole()`, `renderTbTenItem()`, `syncCNRoles()`, `startEdit()`, `cancelEdit()`, `finishEdit()`, `addItem()`, `isItemInUse()`, `delItem()`, `_dedupCatArr()`, `rebuildEntrySelects()` |
| `js/modules/danhmuc/danhmuc.tools.js` | _(không có global riêng)_ | `toolBackupNow()`, `toolRestoreBackup()` |
| `js/modules/tienung/tienung.core.js` | `ungRecords`, `filteredUng`, `ungPage`, `UNG_TP_PG`, `ungTpPage`, `_editingUngId` | `_normalizeUngDeletedAt()`, `_normalizeUngProjectIds()`, shared Tiền Ứng state/migration helpers |
| `js/modules/tienung/tienung.entry.js` | _(không có global riêng)_ | `renderUngPage()`, entry row builders, `saveAllUngRows()`, add/delete/clear tiền ứng rows, rebuild selects |
| `js/modules/tienung/tienung.history.js` | _(không có global riêng)_ | `renderUngTable()`, `renderUngThauPhuPage()`, `editUngRecord()`, history filter/pagination, CSV/export image helpers |
| `js/modules/nhapxuat/nhapxuat.parsers.js` | `_DANHMUC_GROUP_MAP` | `_normStr()`, `_parseDate()`, `_pNum()`, `_str()`, `_sheetRows()`, `_hasDiacritics()`, `_deduplicateCatNames()`, `_buildCanonMap()`, `_dayOfWeek()`, `_isEmptyRow()`, `_formatCatName()`, `_markDuplicateInBatch()`, `_makeCatLookup()`, `_makeCatLookupWithExtra()`, `_resolveProvisionalProjectIds()`, `_mkErr()`, `_fmtErr()`, `parseSheet1()`–`parseSheet9()` |
| `js/modules/nhapxuat/nhapxuat.import.js` | `_importSession` | `_isDupInvQ()`, `_isDupInvD()`, `_isDupUng()`, `_isDupThu()`, `_isDupTb()`, `_isDupTp()`, `_isDupCC()`, `_detectSheetType()`, `_doImportParse()`, `_markDuplicates()`, `_showImportPreviewNew()`, `_toggleAllImportSheets()`, `_applyImport()`, `_generateImportLog()`, `openImportModal()`, `handleImportFile()` |
| `js/modules/nhapxuat/nhapxuat.export.js` | _(không có global riêng)_ | `openExportModal()`, `_buildSheet()`, `buildHoaDonNhanh()`, `buildHoaDonChiTiet()`, `buildChamCong()`, `buildTienUng()`, `buildThietBi()`, `buildDanhMuc()`, `buildHopDongChinh()`, `buildThuTien()`, `buildHopDongThauPhu()`, `buildHuongDan()`, `exportExcel()`, `_doExport()`, `exportEntryCSV()`, `exportAllCSV()`, `toolImportExcel()`, `toolExportExcel()` |
| `js/modules/chamcong/chamcong.core.js` | `ccData`, `ccOffset`, `ccHistPage`, `ccTltPage`, `CC_PG_HIST`, `CC_PG_TLT`, `CC_DAY_LABELS`, `CC_DATE_OFFSETS`, `_ccDebtColsHidden` | `_dedupCC()`, `round1()`, `toggleCCDebtCols()`, `_applyCCDebtColsVisibility()`, `_calcDebtBefore()`, `isoFromParts()`, `ccSundayISO()`, `ccSaturdayISO()`, `snapToSunday()`, `viShort()`, `weekLabel()`, `iso()`, `ccAllNames()`, `rebuildCCNameList()`, `normalizeAllChamCong()`, `rebuildCCCategories()`, `updateTopFromCC()`, `populateCCCtSel()`, `updateCCSaveBtn()`, `onCCCtSelChange()`, `_fmtDate` |
| `js/modules/chamcong/chamcong.week-form.js` | `ccClipboard` | `initCC()`, `ccGoToWeek()`, `ccPrevWeek()`, `ccNextWeek()`, `onCCFromChange()`, `loadCCWeekForm()`, `buildCCTable()`, `addCCWorker()`, `addCCRow()`, `buildCCRow()`, `onCCNameInput()`, `onCCDayKey()`, `onCCWageKey()`, `onCCMoneyKey()`, `calcCCRow()`, `delCCRow()`, `renumberCC()`, `updateCCSumRow()`, `saveCCWeek()`, `clearCCWeek()`, `copyCCWeek()`, `pasteCCWeek()` |
| `js/modules/chamcong/chamcong.history-reports.js` | _(không có global riêng)_ | `buildCCHistFilters()`, `renderCCHistory()`, `ccHistGoTo()`, `renderCCTLT()`, `fmtK()`, `updateTLTSelectedSum()`, `exportCCTLTCSV()`, `ccTltGoTo()`, `loadCCWeekById()`, `delCCWeekById()`, `delCCWorker()`, `exportCCWeekCSV()`, `exportCCHistCSV()`, `removeVietnameseTones()`, `xuatPhieuLuong()`, `exportUngToImage()` |
| `js/legacy/thietbi.js` | `tbData`, `tbPage`, `khoPage` | `migrateTbData()`, `tbSaveRows()`/device save helpers, `tbRenderList()`, `renderKhoTong()` |
| `js/modules/doanhthu/doanhthu.core.js` | `hopDongData`, `thuRecords`, `thauPhuContracts`, `_hdcItems`, `_hdtpItems`, `_hdcPage`, `_hdtpPage`, `_thuPage`, `DT_PG`, `_dtCtFilter` | `calcHopDongValue()`, `_migrateHopDongSL()`, `_normalizeThuProjectIds()`, `_initDoanhThuAddons()`, `updateGlobalTotals()`, `bindItemsToTable()`, `fmtInputMoney()`, `_readMoneyInput()`, `_dtInYear()`, `_dtPaginationHtml()`, `_dtMatchProjFilter()`, `_dtMatchHDCFilter()`, `dtPopulateCtFilter()`, `dtSetCtFilter()`, `dtGoSub()`, `dtEnsureCongNoSubtab()`, `dtPopulateSels()`, `_dtAddCT()`, `_dtAddTP()` |
| `js/modules/doanhthu/doanhthu.forms.js` | _(không có global riêng)_ | `hdcUpdateTotal()`, `saveHopDongChinh()`, `_hdcResetForm()`, `editHopDongChinh()`, `delHopDongChinh()`, `renderHdcTable()`, `saveThuRecord()`, `editThuRecord()`, `_thuCancelEdit()`, `_thuResetForm()`, `delThuRecord()`, `renderThuTable()`, `hdtpUpdateTotal()`, `saveHopDongThauPhu()`, `_hdtpResetForm()`, `editHopDongThauPhu()`, `delHopDongThauPhu()`, `renderHdtpTable()` |
| `js/modules/doanhthu/doanhthu.reports-export.js` | `window.initDoanhThu`, `window.dtGoSub` (top-level assignments) | `renderCongNoThauPhu()`, `_renderCongNoTable()`, `renderCongNoNhaCungCap()`, `renderLaiLo()`, `initDoanhThu()`, `copyKLCT()`, `pasteKLCT()`, `exportHdcToImage()`, `exportHdtpToImage()`, `exportThuToImage()` |
| `js/sync/sync.v2format.js` | `_V2_YEAR_TYPES`, `_V2_META_TYPES`, `_V2_YEAR_KEY_MAP`, `_V2_FIELD_MAPS`, `_V2_SUBCOLL_NAME`, `_V2_LAST_PUSH_KEY`, `_V2_LAST_PULL_KEY`, `_V2_ID_SCHEMA_VER` | **Formatters:** `_v2FmtMoney(n)`, `_v2FmtDateTime(ts)`, `_v2FmtCtList(records,ctField)`, `_v2TypeLabel(type)` — **ID helpers:** `_v2Slug(s,maxLen)`, `_v2FmtMoneyShort(n)`, `_v2MakeDocId(type,rec)`, `_v2DocYearId(type,yr)`, `_v2DocMetaId(type)` — **Converters (to FS):** `_v2ToFsValue(v)`, `_v2ToFsFields(obj)`, `_v2ApplyFieldMap(rec,map,exclude)` — **Converters (from FS):** `_v2FromFsValue(v)`, `_v2FromFsFields(fields)`, `_v2ReverseApplyFieldMap(fsObj,map)` — **REST helpers:** `_v2FsPatchDoc(path,fields)`, `_v2FsListIds(parentId,coll)`, `_v2FsBatchWrite(writes[])`, `_v2FsGetSubcollDocs(parentDocId,collName)` — **Push:** `_v2GetLastPush(id)`, `_v2SetLastPush(id,ts)`, `_v2ResetLastPush(id)`, `_v2ResetAllLastPush()` (clear cả `_v2HashFull_*`, `_v2SubcollLastPull`, `_v2Initialized`), `_v2PushSubcoll(parentId,records,map,summary,idFn?)` (skip-when-unchanged + ghi `last_modified_ms`), `_v2PushSubcollFull(parentId,records,map,summary,idField?)` (hash-skip + ghi `last_modified_ms`), `_v2PushYear(yr)`, `_v2PushMeta()` (set `_v2Initialized='1'`) — **Pull guard (Phase 1):** `_v2GetLastPull(id)`, `_v2SetLastPull(id,ts)`, `_v2ResetAllLastPull()`, `_v2CheckLastModified(parentDocId)` → `{ exists, unchanged, parentFields, cloudLastMod }` — **Pull year:** `_v2PullSubcoll(parentDocId,fieldMap)` → `{ status:'absent'|'unchanged'|'empty'|'fresh', records, parentFields }`, `_v2PullYearFull(yr)` → `{ _v2Initialized, _yearChanged, [localKey]: records? }` — **Debug:** `debugV2(filter?)` |
| `js/sync/sync.v2meta.js` | _(không có global state — set `localStorage._v2Initialized='1'` khi pull phát hiện parent docs)_ | **Pull meta từ V2 subcollections (Phase 1 — guarded):** `_v2PullProjects()` → `{status, records, parentFields}` (delegate `_v2PullSubcoll`), `_v2PullUsers()` → same shape (records không có password), `_mergeUsersV2(localUsers,cloudUsers)` (restore password từ local cache trước khi merge), `_v2PullDanhMuc()` → `{ status, catItems?, cnRoles?, ctYears? }` (items từ subcoll + cnRoles/ctYears từ parentFields), `_v2PullHopDong()` → `{ status, hopDong?, thauPhu? }` (dùng `_v2CheckLastModified` trực tiếp vì cần raw fields), `_v2PullMetaFull()` → `{ _v2Initialized, projects?, users?, catItems?, cnRoles?, ctYears?, hopDong?, thauPhu? }` qua `Promise.allSettled` |
| `js/sync/sync.js` | `DEVICE_ID`, `_syncPulling`, `_syncPushing`, `_pushTimer` | `mkRecord()`, `stampEdit()`, `softDeleteById()`, `resolveConflict()`, `mergeDatasets()`, `normalizeCC()`, `pullChanges()` (lưu `localStorage._lastPullTs` cuối hàm, V2-ready check dùng `_v2Initialized` flag thay vì `data.length>0`), `pushChanges()` (Phase 4: skip pre-push pull nếu `_lastPullTs<60s`; users merge dùng `_v2PullUsers` thay vì cats; **đã XÓA** `fsSet(fbDocCats())`), `schedulePush()` (debounce 30s → 5 phút = 300_000ms), `manualSync()`, `startAutoSync()`, `stampNew()` |
| `js/app/auth.js` | `currentUser`, role/session helpers | `initAuth()`, login/logout/account settings, user/session persistence, role UI helpers |
| `js/legacy/datatools.js` | `selectedCT`, migration dry-run reports | `renderDashboard()`, `toolDeleteYear()`, `_doDeleteYear()`, `toolResetAll()`, `_doResetAll()`, `scanDataHealth()`, `normalizeProjectLinks()`, `migrateIdsToUUID()` |

Lưu ý đặc biệt: `buildInvoices()` không chỉ đọc `inv_v3`; nó tạo hóa đơn tổng hợp từ hóa đơn manual và dữ liệu chấm công (`cc_v2`) gồm `hdmuale` và tiền công nhân. Các render/report hóa đơn nên dùng `getInvoicesCached()` hoặc `buildInvoices()` thay vì chỉ đọc `invoices`.

---

## 7. Quy tắc lập trình (Coding Rules)

| Quy tắc | Cách áp dụng trong code |
|---|---|
| Giữ Vanilla JS/global style | Classic script, global scope — **không dùng ES module `import/export`**. Hàm cần gọi từ HTML inline phải ở global scope hoặc gán `window.fn = fn`. |
| Nhóm `hoadon.*.js` nạp sau tienich.js, trước danhmuc.*.js | `hoadon.quick-entry.js` → `hoadon.sheet-grid.js` → `hoadon.detail-entry.js` → `hoadon.list-trash.js`. File cũ `js/legacy/hoadon.js` đã tách thành nhóm này — không nạp lại. `hoadon.quick-entry.js` nạp trước vì chứa shared helpers `calcRowMoney()`, `getRowData()`, `_ensureInvRef()`, `_doSaveRows()` mà `detail-entry.js` dùng. `hoadon.sheet-grid.js` phụ trách thao tác Excel-like trong bảng nhập nhanh, nên phải nạp sau quick-entry DOM/row helpers và trước các thao tác UI phụ thuộc. `trash` là global shared state (`let trash = load('trash_v1', [])`) trong `list-trash.js` — có thể được reassign bởi `_reloadGlobals()`. `DEVICE_ID` (từ `sync.js`) chỉ dùng trong body của `delInvoice()` và `trashRestore()` trong list-trash — an toàn vì chỉ gọi sau khi app load đầy đủ. |
| Nhóm `core.*.js` nạp trước tất cả | `core.storage.js` → `core.state-backup.js` → `core.cloud-cats-ui.js` phải nạp trước mọi module nghiệp vụ. File cũ `core.js` đã được tách thành 3 file này — không nạp lại `core.js`. |
| Nhóm `projects.*.js` nạp sau core, trước tienich | `projects.model.js` → `projects.migration-selects.js` → `projects.ui.js`. File cũ `projects.js` đã tách thành 3 file này — không nạp lại `projects.js`. Thứ tự nội bộ quan trọng: model trước vì migration và UI đều phụ thuộc `projects[]`, `getProjectById`, v.v. |
| Nhóm `danhmuc.*.js` và `tienung.*.js` nạp sau hoadon.js, trước nhapxuat.js | `danhmuc.categories.js` → `tienung.core.js` → `tienung.entry.js` → `tienung.history.js` → `danhmuc.tools.js`. File cũ `danhmuc.js` đã tách; file cũ `danhmuc.ung.js` không còn tồn tại. `tienung.*.js` dùng normalize/category helpers từ `danhmuc.categories.js`, nên categories phải nạp trước. `ungRecords` là global shared state — được reassign bởi `_reloadGlobals()` và các thao tác tiền ứng; `DEVICE_ID` từ `sync.js` chỉ dùng trong function body, không ở top-level. |
| Nhóm `nhapxuat.*.js` nạp sau danhmuc.tools.js, trước datatools.js | `nhapxuat.parsers.js` → `nhapxuat.import.js` → `nhapxuat.export.js`. File cũ `nhapxuat.js` đã tách thành 3 file này — không nạp lại `nhapxuat.js`. `nhapxuat.parsers.js` phải nạp trước vì `nhapxuat.import.js` dùng mọi parser và helper. `nhapxuat.export.js` không được gọi ở top-level vì `hopDongData`/`thuRecords`/`thauPhuContracts` (từ `doanhthu.core.js`) nạp cùng lúc — hàm export chỉ chạy khi user click. Import phải tiếp tục dùng `save()` để IndexedDB, cache, pending sync và cloud sync nhất quán. |
| Nhóm `chamcong.*.js` nạp sau datatools.js, trước thietbi.js | `chamcong.core.js` → `chamcong.week-form.js` → `chamcong.history-reports.js`. File cũ `chamcong.js` đã tách thành 3 file này — không nạp lại `chamcong.js`. `chamcong.core.js` phải nạp trước vì chứa global shared state (`ccData` khởi tạo parse-time qua `_dedupCC(load('cc_v2',[]))`, `ccOffset`, `ccHistPage`, `ccTltPage`, `CC_DAY_LABELS`, `CC_DATE_OFFSETS`) và tất cả date/week helpers, normalize helpers mà week-form và history-reports đều phụ thuộc. `_dedupCC` có standalone fallback: nếu `sync.js` chưa load (parse-time), nó dùng logic inline; nếu `sync.js` đã load, nó delegate sang `normalizeCC()` canonical. Split là NON-LINEAR: các hàm core (`normalizeAllChamCong`, `rebuildCCCategories`, `updateTopFromCC`, `populateCCCtSel`, `updateCCSaveBtn`, `onCCCtSelChange`) nằm xen kẽ trong file gốc nhưng được gom đúng vào `chamcong.core.js`. `DEVICE_ID` (từ `sync.js`) chỉ dùng trong body của `delCCWeekById()` trong history-reports — an toàn vì hàm chỉ gọi sau khi app load đầy đủ. |
| Nhóm `doanhthu.*.js` nạp sau thietbi.js, trước sync.v2format.js | `doanhthu.core.js` → `doanhthu.forms.js` → `doanhthu.reports-export.js`. File cũ `doanhthu.js` đã tách thành 3 file này — không nạp lại `doanhthu.js`. `doanhthu.core.js` phải nạp trước vì chứa global data (`hopDongData`, `thuRecords`, `thauPhuContracts`, `_hdcItems`, `_hdtpItems`) và các top-level migration calls (`_normalizeThuProjectIds()`, `_migrateHopDongSL()`, `bindItemsToTable('hdc',...)`, `bindItemsToTable('hdtp',...)`) mà forms.js và reports-export.js đều phụ thuộc. `window.initDoanhThu` và `window.dtGoSub` được gán ở top-level trong `doanhthu.reports-export.js` — không gọi bất kỳ hàm export nào ở top-level vì chúng chỉ chạy khi user tương tác. `DEVICE_ID` (từ `sync.js`) chỉ được dùng trong body của `delThuRecord()` trong forms.js — an toàn vì hàm chỉ gọi sau khi app load đầy đủ. |
| Nhóm `sync.*.js` nạp sau doanhthu.*.js, trước auth.js | `sync.v2format.js` → `sync.v2meta.js` → `sync.js`. Thứ tự bắt buộc: v2format phải trước v2meta (v2meta dùng helpers từ v2format), v2meta phải trước sync.js (`pullChanges` gọi `_v2PullMetaFull`). Không nạp lại thứ tự nào khác. |
| Không đổi script order tùy tiện | File sau phụ thuộc biến/hàm file trước. `main.js` phải chạy cuối sau `sync.js`. |
| IndexedDB là nguồn dữ liệu nghiệp vụ | Đọc bằng `load()`, ghi bằng `save()`. Không ghi nghiệp vụ trực tiếp vào `localStorage`. |
| `save()` là write path chuẩn | Khi sửa dataset phải cập nhật global hiện hành nếu cần, rồi gọi `save(logicalKey, value)` để `_mem`, Dexie, cache và sync cùng nhất quán. |
| Soft Delete | Record nghiệp vụ dùng `deletedAt` thay vì xóa cứng để sync tombstone. Category item dùng `isDeleted`. UI/report thường filter `!deletedAt` hoặc `!isDeleted`. |
| ID chuẩn | - `mkRecord(fields)` — Creates record with `id` (UUID), `createdAt`, `updatedAt`, `deletedAt: null`, `deviceId`. <br> - `mkUpdate(existing, changes)` — Returns updated record (preserves `id`, `createdAt`). <br> - `load(key, default)` / `save(key, val)` — IndexedDB + Memory sync. <br> - `dbInit()` — Critical async bootstrap. |
| Conflict sync | LWW theo `updatedAt`; nếu một bản có `deletedAt`, tombstone thắng để tránh dữ liệu bị sống lại. |
| Project linking | `projectId` là khóa chuẩn; `congtrinh`/`ct` là text hiển thị legacy/fallback. Khi thêm record theo công trình, cố gắng resolve `projectId`. |
| Hợp đồng chính | `hopdong_v1` đang hỗ trợ cả key `projectId` và legacy key tên CT; code mới nên ưu tiên `projectId` và dùng `_hdLookup()`/helper tương ứng. |
| Chấm công dedup | `cc_v2` dedup theo logical key `fromDate + projectId` qua `normalizeCC()`/`normalizeAllChamCong()`, không chỉ theo `id`. |
| Import Excel | Parser strict theo sheet/cột định nghĩa; khi apply import, stamp `updatedAt` mới để local thắng cloud cũ. |
| UI tiếng Việt | Text hiển thị, toast, confirm, label dùng Tiếng Việt; technical identifier giữ English/Vietnamese mixed theo code hiện tại. |
| Normalize tên | So sánh tên thường bỏ dấu, lowercase, trim space (`normalize('NFD')`, remove diacritics); không dùng so sánh raw khi dedup danh mục/công trình. |
| Render sau sync | Sau `pullChanges()` hoặc tab switch, gọi `_reloadGlobals()` rồi render tab hiện hành để global state không cũ. |
| Data ready guard | Một số render kiểm tra `window._dataReady`; không render dữ liệu trước khi `dbInit()` hoàn tất. |
| Không hard delete khi reset/delete-year | Các tools ưu tiên tombstone/block pull/push để cloud nhận trạng thái xóa; nếu cần xóa cứng phải hiểu sync fallout. |
| Cấu trúc thư mục chỉ là tổ chức vật lý | `js/core/`, `js/modules/*/`, `js/legacy/`, `js/sync/`, `js/app/`, `assets/css/` là phân vùng vật lý — không phải module system. Không dùng `import/export`. Thứ tự nạp script trong `index.html` là nguồn quyết định duy nhất. Khi thêm file mới: (1) tạo file đúng thư mục phù hợp, (2) thêm `<script src="...">` vào `index.html` đúng vị trí thứ tự, (3) cập nhật bảng Script Load Order và Key Functions & Globals trong `AI_CONTEXT.md`. |
| **Format tên danh mục (canonical)** | Helper duy nhất: `normalizeCatDisplayName(catIdOrType, name)` trong `core.cloud-cats-ui.js`. Rule: `loaiChiPhi`/`loai`/`tbTen`/`tbteb` → **Title Case** (chữ đầu mỗi từ). `nhaCungCap`/`ncc`/`nguoiTH`/`nguoi`/`thauPhu`/`tp`/`congNhan`/`cn` → **UPPERCASE**. Hàm `normalizeName(catId, val)` trong `danhmuc.categories.js` là wrapper của helper này. `normalizeKey(val)` / `_catNormKey(s)` dùng **chỉ để so sánh trùng** (bỏ dấu + lowercase), không dùng làm display name. |
| **cat_items_v1 là nguồn master danh mục** | Mọi `item.name` trong `cat_items_v1` phải ở canonical format. Canonicalization được áp dụng nhất quán ở: (1) `_rebuildCatArrsFromItems()` — sau `_reloadGlobals()`; (2) `_syncCatItems()` — sau mỗi `saveCats()`; (3) `pullChanges()` catItems merge — sau pull từ cloud; (4) `_mergeCatArr()` trong `_applyImport()` — sau import Excel; (5) `_formatCatName()` trong parsers. Nếu canonicalize làm đổi item.name → dùng `save('cat_items_v1', ...)` (không `_memSet`) để pending được tăng và cloud nhận bản canonical trong lần push tiếp theo. `cat_items_v1` đã có trong `_SYNC_DATA_KEYS`. |
| **Không rebuild cat string arrays từ raw item.name** | Mọi đường rebuild `cat_loai`, `cat_tbteb`, v.v. từ `cat_items_v1` phải gọi `normalizeCatDisplayName(type, item.name)`. Tuyệt đối không lấy `item.name` trực tiếp vào string array mà không qua canonical helper. |

---

## 8. Cập nhật gần đây (Bootstrap Migration + Cleanup, 20-22/05/2026)

Các tài liệu tạm `BOOTSTRAP_MIGRATION_REPORT.md`, `BOOTSTRAP_POST_MIGRATION_AUDIT.md`, `BOOTSTRAP_CLEANUP_REPORT.md`, `BAO_CAO_CHI_TIET_UNG_DUNG.md`, `analysis_results.md` đã được đọc và gộp vào file này. Sau khi cập nhật, chỉ giữ lại `AI_CONTEXT.md` làm nguồn ngữ cảnh duy nhất.

### 8.1. Thay đổi cấu trúc/module đã xác nhận

| Hạng mục | Trạng thái mới |
|---|---|
| Bootstrap | `index.html` nạp Bootstrap 5.3.3 CSS trước `assets/css/style.css`, nạp Bootstrap Icons 1.11.3, và nạp Bootstrap bundle ở cuối body. |
| Tiền Ứng | Không còn `js/modules/danhmuc/danhmuc.ung.js`. Module Tiền Ứng hiện nằm ở `js/modules/tienung/` gồm `tienung.core.js`, `tienung.entry.js`, `tienung.history.js`. |
| Hóa đơn quick entry | Có thêm `js/modules/hoadon/hoadon.sheet-grid.js` cho lưới nhập liệu dạng Excel: selection, keyboard navigation, copy/paste, autocomplete. |
| Auth | Có `js/app/auth.js` riêng, nạp sau `sync.js` và trước `main.js`. File này phụ trách đăng nhập, đăng xuất, đổi tài khoản, phân quyền và session. |
| UI cleanup | Đã xóa marker migration tạm (`<!-- Sprint8 -->`, `/* Sprint8 */`, `REMOVED Sprint...`) khỏi runtime sau lỗi Danh Mục. |

### 8.2. Trạng thái Bootstrap hiện tại

| Nhóm UI | Trạng thái |
|---|---|
| Button | Đã chuyển phần lớn sang Bootstrap: `btn`, `btn-outline-secondary`, `btn-warning`, `btn-success`, `btn-danger`, `btn-sm`. CSS còn override `.btn`/`.btn.btn-sm` bằng biến `--bs-btn-*` để giữ kích thước compact; không hard-code màu. |
| Form/select | Nhiều input/select ngoài bảng đã chuyển sang `form-control form-control-sm`, `form-select form-select-sm`. |
| Card/panel | Nhiều wrapper chuyển sang `card shadow-sm`, `bg-body`, `bg-body-tertiary`, `border`, `rounded`. |
| Table danh sách | Nhiều bảng list chuyển sang `table table-sm table-hover align-middle mb-0`. |
| Nav/tab | Sub-nav đã chuyển theo hướng Bootstrap `nav nav-pills`, `nav-link`. |
| Modal/toast | Custom modal/toast đã đổi sang `.app-modal`, `.app-toast` để tránh xung đột Bootstrap `.modal`/`.toast`. Chưa chuyển hoàn toàn sang Bootstrap Modal/Toast thật vì các modal đang render HTML động và dùng global open/close helpers. |
| Pagination | Dùng `.app-pagination` cho pagination custom, tránh xung đột Bootstrap `.pagination`. |

### 8.3. Quy tắc bảo trì UI sau Bootstrap migration

| Quy tắc | Cách áp dụng |
|---|---|
| Không tạo marker migration trong runtime | Không chèn comment như `<!-- Sprint8 -->`, `/* Sprint8 */`, `REMOVED Sprint...` vào HTML/CSS/JS. Đã từng gây lỗi Danh Mục khi comment nằm trong opening tag input và làm `oninput` hiện ra UI. |
| Không đặt HTML comment trong opening tag | Tuyệt đối tránh dạng `style="..." <!-- note --> oninput="..."`. Nếu cần ghi chú, dùng comment JS/CSS bên ngoài template hoặc commit message. |
| Bootstrap là lớp component chính | Với UI phổ thông, ưu tiên `btn`, `form-control`, `form-select`, `card`, `table`, `nav`, `text-*`, `bg-*`, `border`, `shadow-sm`, `rounded`. |
| Không override màu Bootstrap mặc định | Không khai báo lại `--bs-primary`, `--bs-success`, `--bs-warning`, `--bs-danger`, v.v. Nếu cần màu semantic, dùng class/variable Bootstrap có sẵn. |
| Vùng nhập liệu dạng spreadsheet được bảo vệ | `entry-table`, `cell-input`, `cc-grid-table`, `sheet-*`, sticky column, autocomplete, và template print/export có thể giữ CSS custom vì Bootstrap table/form-control mặc định dễ làm vỡ layout nhập nhanh. |
| Custom component phải có prefix app | Modal/toast/pagination custom dùng `.app-modal`, `.app-toast`, `.app-pagination`; không dùng lại `.modal`, `.toast`, `.pagination` cho style custom. |
| CSS chết không giữ trong source | Không giữ block CSS đã comment kiểu "removed". Dùng git history thay vì giữ code chết trong `style.css`. |

### 8.4. Các màu/token còn được phép giữ

Một số token cũ vẫn tồn tại có chủ đích:

- `--gold`, `--green`, `--blue`, `--red`, `--ink*`, `--paper`, `--line*` trong bảng nhập liệu, chấm công, sheet selection, autocomplete.
- `#1a1814`, `#c8870a` trong template xuất ảnh/print như phiếu lương/hợp đồng vì cần màu cố định khi render ảnh.
- Màu topbar/brand tối có thể giữ nếu là chủ đích nhận diện app.

Với UI chính mới hoặc khi refactor tiếp, ưu tiên chuyển dần sang:

- `var(--bs-body-bg)`, `var(--bs-body-color)`, `var(--bs-secondary-color)`
- `var(--bs-tertiary-bg)`, `var(--bs-border-color)`
- `var(--bs-success)`, `var(--bs-danger)`, `var(--bs-warning)`, `var(--bs-primary)`
- `text-success`, `text-danger`, `text-warning`, `text-primary`, `text-secondary`
- `bg-success-subtle`, `bg-danger-subtle`, `bg-warning-subtle`, `bg-primary-subtle`

### 8.5. V2 Quota Optimization (23/05/2026) — Phase 1+2+3+4

Sau khi V2 migration hoàn tất, app chạm giới hạn Firestore Spark (50K reads/day) do mỗi sync đọc lại toàn bộ ~1,500 docs subcollection ngay cả khi không có thay đổi, và `meta_danh_muc`/`meta_hop_dong` rewrite full mỗi sync. Đã triển khai 4 phase tối ưu:

| Phase | Vấn đề | Giải pháp | Kết quả idle sync |
|-------|--------|----------|------------------|
| 1 | Subcollection pull đọc TẤT CẢ docs mỗi sync (~1,500 reads) | **Last-Modified Guard:** parent doc lưu `last_modified_ms`; pull đọc parent trước (1 read), so sánh với `localStorage._v2SubcollLastPull[docId]`, skip subcoll nếu unchanged | 1,500 → ~19 reads (-99%) |
| 2 | `_v2PushSubcollFull` rewrite full danh_muc (163) + hop_dong (17) mỗi sync | **Hash-skip:** tính hash `id:updatedAt` từ active records, lưu `_v2HashFull_<docId>`, skip toàn bộ nếu trùng. `_v2PushSubcoll`: skip cả summary PATCH + writes khi `writes.length===0 && lastPush>0` | 180 → 0 writes (-100%) |
| 3 | Summary PATCH chạy mỗi sync dù records không đổi (~19 writes) | Gộp vào Phase 2 — `_v2PushSubcoll` skip summary PATCH cùng với writes | -100% |
| 4 | Auto-sync 30s + pre-push pull duplicate + cats V1 push vô ích | Debounce 30s → 5 phút; skip pre-push pull nếu `_lastPullTs < 60s`; xóa hoàn toàn `fsSet(fbDocCats())`; users pre-push dùng `_v2PullUsers` (rẻ với guard) | Tần suất sync -90% |

**Tổng kết:** Sync idle: **1,500 reads / 200 writes → ~19 reads / 0 writes** (~99% giảm). Sync sau 1 edit: ~70 reads / 1-2 writes.

**localStorage keys mới phải biết:**
- `_v2SubcollLastPull` — JSON map `{ docId: cloudLastModMs }`, cập nhật sau mỗi lần pull subcoll thành công
- `_v2HashFull_<docId>` — string hash, cập nhật sau `_v2PushSubcollFull` thành công
- `_v2Initialized` — `'1'` sau `_v2PushMeta` thành công đầu tiên; pullChanges dùng làm V2-ready signal (thay cho check `data.length>0` cũ)
- `_lastPullTs` — timestamp ms khi `pullChanges` kết thúc; `pushChanges` dùng để skip pre-push pull

**Khi `_v2ResetAllLastPush()` chạy** (sau reset/import): clear cả `_v2HashFull_*`, `_v2SubcollLastPull`, `_v2Initialized` để force full re-push. Lần push tiếp theo sẽ set lại flag.

**Sau khi deploy code này lần đầu:** sync đầu tiên vẫn đọc toàn bộ (~1,500 reads) vì parent docs chưa có `last_modified_ms`. Sau lần push đầu tiên, các sync tiếp theo bắt đầu skip.

### 8.6b. Sync Reliability & Quota Fix (24/05/2026) — Phase 5

Ba lỗi nghiêm trọng được sửa trong phiên này:

#### Lỗi 1: Heartbeat session làm bão đồng bộ
**Nguyên nhân:** `_startSessionHeartbeat()` trong `auth.js` gọi `saveUsers()` mỗi 60s. `saveUsers` → `save('users_v1', ...)` → `_incPending()` → nút Sync báo đỏ liên tục → user bấm Sync nhiều lần → hàng ngàn Reads/Writes vô ích.

**Giải pháp:**
- `core.storage.js` — `save(k, v, opts)`: thêm tham số `opts.skipSync = true`. Khi `skipSync`, ghi IDB/`_mem` nhưng KHÔNG tăng `_pendingChanges`, KHÔNG gọi `schedulePush()`.
- `auth.js` — `saveUsers(arr, opts)`: propagate `opts` xuống `save()` và `schedulePush()`.
- `auth.js` — heartbeat tick: dùng `saveUsers(users, { skipSync: true })`.
- `auth.js` — `visibilitychange` (tab focus lại, cập nhật lastActive): dùng `saveUsers(users, { skipSync: true })`.

**Kết quả:** Heartbeat không còn làm tăng badge pending và không trigger cloud sync. User không cần bấm Sync cho lastActive.

#### Lỗi 2: Auto-sync kéo 19 reads mỗi 5 phút (dù không có thay đổi)
**Nguyên nhân:** `schedulePush()` gọi `pullChanges` trước khi push. Pull này đọc ~19 parent docs để kiểm tra `last_modified_ms`.

**Giải pháp:**
- `sync.js` — `schedulePush()`: bỏ hoàn toàn bước `pullChanges`. Gọi trực tiếp `pushChanges({ silent: true, skipPull: true })`. V2 subcollection độc lập per-record → push không ghi đè record của thiết bị khác → an toàn.
- Đổi debounce về **30 giây** (Phase 4 đã tăng lên 5 phút, nhưng 5 phút quá lâu với mobile).
- Sau push, gọi ngầm `_v2PushMeta()` để meta (danh mục, hợp đồng, công trình, tài khoản) được đẩy tự động mà không cần bấm Sync thủ công.

**Kết quả:** Auto-sync ngầm: ~19 reads/5 phút → 0 reads. Mỗi lần auto-sync chỉ tốn writes khi thực sự có thay đổi.

#### Lỗi 3: Mất dữ liệu khi khóa màn hình/tắt tab (mobile)
**Nguyên nhân:** Bộ đếm 30s (debounce) bị hủy khi JS freeze trên mobile. Data kẹt ở IndexedDB local, không lên cloud.

**Giải pháp:**
- `sync.js` — thêm `let _syncKeepAlive = false` (global flag).
- `sync.js` — thêm IIFE lắng nghe `visibilitychange` (hidden) và `pagehide`. Khi kích hoạt: nếu có `_pendingChanges > 0`, gọi `pushChanges({ silent: true, skipPull: true })` và bật `_syncKeepAlive = true`.
- `sync.v2format.js` — `_v2FsPatchDoc()`: đọc `_syncKeepAlive`, truyền `keepalive` vào `fetch()`.
- `sync.v2format.js` — `_v2FsBatchWrite()`: đọc `_syncKeepAlive`, truyền `keepalive` vào từng `fetch()` trong chunk.

**Kết quả:** Khi user khóa màn hình hoặc đóng tab, trình duyệt vẫn hoàn thành việc gửi data lên Firebase nhờ `keepalive: true`. Dữ liệu không bị kẹt local.

**Lưu ý cho AI:**
- `save(k, v, { skipSync: true })` là pattern chuẩn cho bất kỳ ghi internal nào không phải thay đổi nghiệp vụ (heartbeat, migration idempotent không có thay đổi thực sự).
- `_syncKeepAlive` được khai báo trong `sync.js` — `sync.v2format.js` đọc nó qua global scope (không cần truyền tham số vì cả hai đều chạy trong cùng page scope).
- `schedulePush()` debounce giờ là **30s** (không phải 5 phút nữa).

### 8.7. Cải tiến UI/UX (24/05/2026) — Tasks 7–14

#### Task 7 — Tiền Ứng: tách 2 bảng độc lập

**Vấn đề:** Thầu Phụ và Nhà Cung Cấp dùng chung 1 bảng, filter và pagination.

**Giải pháp:**
- `tienung.core.js`: thêm `filteredUngTp`, `filteredUngNcc`, `ungNccPage` vào global state.
- `tienung.history.js`: viết lại hoàn toàn. Hai bộ filter riêng (`buildUngTpFilters`, `buildUngNccFilters`), hai render riêng (`renderUngTpSection`, `renderUngNccSection`), two filter+render riêng (`filterAndRenderUngTp`, `filterAndRenderUngNcc`). Hàm `_syncFilteredUng()` giữ `filteredUng` là union của hai bảng. Các hàm cũ (`buildUngFilters`, `filterAndRenderUng`, `renderUngTable`) giữ lại làm backward-compat wrappers.
- `index.html`: thay section tiền ứng bằng hai block riêng — mỗi block có search input, dropdown entity riêng (`uf-tp-tp` / `uf-ncc-ncc`), dropdown CT, dropdown tháng, container bảng (`ung-tp-section` / `ung-ncc-section`), và pagination.

**IDs HTML mới:** `ung-tp-search`, `uf-tp-tp`, `uf-tp-ct`, `uf-tp-month`, `ung-tp-section`, `ung-tp-pagination`, `ung-ncc-search`, `uf-ncc-ncc`, `uf-ncc-ct`, `uf-ncc-month`, `ung-ncc-section`, `ung-ncc-pagination`.

#### Task 8 — TLT: ẩn/hiện cột TRỪ và THỰC LÃNH

**Vấn đề:** Khi chọn "Tất cả tuần", cột TRỪ và THỰC LÃNH không có ý nghĩa (tổng cộng toàn kỳ không phản ánh từng tuần cụ thể).

**Giải pháp:**
- `index.html`: thêm `class="cc-tlt-debt-col"` vào TH "Trừ" và TH "Thực Lãnh" trong bảng TLT header.
- `chamcong.history-reports.js`: thêm class `cc-tlt-debt-col` vào TD tương ứng trong row template; sau `renderCCTLT()`, dùng `querySelectorAll('.cc-tlt-debt-col')` để set `display: none/''` dựa vào biến filter tuần `fWk`.

#### Task 9 — Dashboard: trung bình chi phí tháng khi chọn nhiều năm

**Vấn đề:** Khi chọn nhiều năm, bar chart hiển thị tổng cộng toàn bộ năm thay vì trung bình — gây số liệu mất tính so sánh.

**Giải pháp:** `datatools.js` → `_dbBarChart()`:
- Multi-year mode: tính average thay vì tổng. Denominator chỉ đếm năm đã qua tháng đó (năm quá khứ = full 12 tháng; năm hiện tại = chỉ tháng ≤ tháng hiện tại; năm tương lai = bỏ qua).
- Chart title đổi thành `'Chi Phí TB / Tháng'` (multi-year) vs `'Chi Phí / Tháng'` (single-year).
- Tooltip suffix `(TB/năm)` cho multi-year.

#### Task 10 — Weekly detail: chống double-count HĐ + ỨNG NCC

**Vấn đề:** Hóa đơn có field `ncc` trùng với tên nhà cung cấp trong `ung_v1` (loai=nhacungcap) bị đếm 2 lần — một lần trong cột HĐ, một lần trong cột ỨNG NCC.

**Giải pháp:** `datatools.js` → `_dbCalcWeeklyData()` và `_dbBarChartWeekly()`:
- Build `knownNCC = new Set(ungRecords.filter(r => !r.deletedAt && r.loai==='nhacungcap').map(r => r.tp.trim().toUpperCase()))`.
- Khi lặp `invoiceData`: nếu `invoice.ncc` match `knownNCC` → bỏ qua (không thêm vào cột HĐ).
- Khi lặp `ungData` loại NCC: cộng vào `w.ungNCC` VÀ `w.total` (trước đây NCC không được cộng vào total).
- TỔNG = HĐ (filtered) + ỨNG TP + ỨNG NCC.

#### Task 11 — Modal: căn giữa + khóa cuộn trang nền trên mobile

**Vấn đề:** `@media (max-width: 768px)` set `.overlay { align-items: flex-end }` làm modal dock vào cuối màn hình thay vì căn giữa; khi vuốt trong modal, body scroll theo.

**Giải pháp:**
- `style.css` (base): thêm `body.modal-open { overflow: hidden; touch-action: none; }`.
- `style.css` (@media 768px): đổi `.overlay { align-items: flex-end }` → `align-items: center`; `.app-modal` giữ `border-radius: 12px` (bỏ bottom-sheet style), `max-height: 92vh`, dùng `transform: scale(0.96) translateY(10px)` cho animation.
- `doanhthu.core.js` → `openDtModal()`: thêm `document.body.classList.add('modal-open')`.
- `doanhthu.core.js` → `closeDtModal()`: remove `modal-open` khỏi body chỉ khi không còn overlay nào `.open`.

#### Task 12 — Tiền Ứng: cố định cột đối tượng khi cuộn ngang

**Vấn đề:** Trên mobile, cuộn ngang bảng Tiền Ứng làm mất cột tên thầu phụ/NCC.

**Giải pháp:** `tienung.history.js` → `_ungTableHTML()`:
- Thêm 2 biến inline style: `stickyChk = 'position:sticky;left:0;z-index:2;background:var(--bs-body-bg)'` và `stickyName = 'position:sticky;left:32px;z-index:2;background:var(--bs-body-bg);box-shadow:2px 0 4px -2px rgba(0,0,0,0.12)'`.
- Áp dụng `stickyChk` vào TH/TD checkbox; `stickyName` vào TH/TD cột tên (Thầu Phụ / Nhà Cung Cấp).
- Áp dụng cho cả 2 bảng (TP và NCC) vì dùng chung 1 builder.

#### Task 13 — Chấm Công: fix overflow ngang trên mobile

**Vấn đề:** `.entry-table-wrap { overflow: hidden }` clip child `.table-scroll { overflow-x: auto }` khiến bảng chấm công không cuộn được ngang trên mobile (cả content lẫn scrollbar bị crop bởi parent).

**Giải pháp:** `style.css` (@media 768px): thêm `.entry-table-wrap { overflow-x: auto; }`, override `overflow: hidden` chỉ ở trục X, giữ nguyên overflow-y. Parent trở thành scroll container ngang, child `.table-scroll` vẫn là scroll container phụ (không gây xung đột).

#### Task 14 — HỢP ĐỒNG: tái cấu trúc layout mobile

**Vấn đề:** 3 stat cards (col-sm-4) xếp đều → trên mobile cả 3 card xếp thành 1 cột, quá nhỏ. 3 action button `d-flex flex-wrap` → xếp không gọn trên màn hình nhỏ.

**Giải pháp:** `index.html` → section `dt-mini-dash` và action buttons:

*Stat cards:*
- TỔNG GIÁ TRỊ HĐ: `col-sm-4` → `col-12 col-sm-4` (full width trên mobile, 1/3 trên sm+).
- TỔNG ĐÃ THU: `col-sm-4` → `col-6 col-sm-4` (50% trên mobile, 1/3 trên sm+).
- CÒN PHẢI THU: `col-sm-4` → `col-6 col-sm-4` (50% trên mobile, 1/3 trên sm+).

*Action buttons:* Thay `d-flex gap-3 flex-wrap` bằng `row g-2`:
- Hàng 1: `col-6` × "+ Khai Báo HĐ Chính" + `col-6` × "+ Ghi Nhận Thu Tiền" (50/50 mọi breakpoint, dùng `w-100`).
- Hàng 2: `col-12` × "+ HĐ Thầu Phụ" (full width đơn độc).

---

### 8.6. Điểm kiểm tra sau cleanup

Sau cleanup gần nhất:

- Lỗi Danh Mục do `<!-- Sprint8 -->` trong `<input>` đã được xác định và cleanup report ghi nhận đã sửa.
- Các file JS đã được `node --check` trong cleanup report và không phát hiện lỗi cú pháp.
- Quét marker migration trong cleanup report ghi nhận `Sprint[5-8]`, `<!-- Sprint8 -->`, `/* Sprint8 */` còn 0 ở phạm vi runtime được kiểm tra.

Khi AI sửa UI tiếp theo, vẫn nên chạy lại:

```text
rg -n -- "<!-- Sprint|/\\* Sprint|REMOVED Sprint|btn-gold|btn-green|records-table|thu-table|ll-table|sub-nav-btn|inner-sub-btn|page-btn|page-btns" index.html assets/css/style.css js
```

Nếu có output mới, cần phân loại là comment mô tả hợp lệ hay code cũ cần xóa.

### 8.8. Cải tiến UI/UX Phase 2 (24/05/2026) — Sticky col + Dropdown + Layout

#### Task A — Tiền Ứng: sticky column ổn định khi cuộn ngang

**Vấn đề:** Sticky inline style ở `_ungTableHTML()` dùng `background:var(--bs-body-bg)` bị Bootstrap `.table-hover` ghi đè khi hover row → cột bị "trong suốt".

**Giải pháp:**
- `tienung.history.js` → `_ungTableHTML()`: thay inline style bằng class `.ung-sticky-chk` / `.ung-sticky-name` + table có class `.ung-sticky-table`.
- `style.css`: định nghĩa CSS sticky chuyên dụng:
  - z-index 3 (body) / 5 (header) để header luôn nằm trên body khi cuộn dọc.
  - Background tay đôi: cell mặc định `var(--bs-body-bg)`, hover/editing-row có rule riêng để preserve màu.
  - Box-shadow phải `4px 0 6px -3px rgba(0,0,0,0.18)` cho hiệu ứng "tách" cột sticky khỏi content cuộn.

#### Task B — Dropdown chống tràn màn hình

**Vấn đề:** `<select class="form-select w-auto">` filter công trình ở Tiền Ứng có thể chứa tên CT dài → tràn ngang trên mobile.

**Giải pháp:** `style.css` (@media 768px):
- `#page-nhapung .records-toolbar .form-select.w-auto`: `max-width: calc(100vw - 48px)`.
- `#page-nhapung select.form-select option`: `white-space: normal; word-break: break-word` để options khi bung được wrap.

#### Task C — Tái cấu trúc layout (mobile)

**Vấn đề:** Header chật, Tổng CP và Cloud button chiếm vị trí quan trọng, năm chọn lẫn vào giữa.

**Giải pháp layout mới (mobile):**

| Vùng | Trước | Sau |
|------|-------|-----|
| Header trái | ☰ + Logo + tab title + year select + Tổng CP pill (right) | ☰ + Logo + tab title + **Year select ở góc PHẢI** |
| Bottom bar | Cloud / User / Sync | **Tổng CP** / User / Sync (Cloud rời) |
| Cloud button | Bottom-left | **Trong dropdown User** (cả guest + auth view) |

**File thay đổi:**
- `index.html`:
  - Thêm `.ud-cloud-btn` vào `#user-guest` sau nút "Đăng nhập hệ thống".
  - Thêm `.ud-action-btn` (Kết nối Cloud) vào `#ud-main-view .ud-actions`.
- `style.css` (@media 768px):
  - `.top-stat-header-mobile { display:none !important }` — xóa Tổng CP khỏi header.
  - `.topbar-year-wrap { margin-left:auto !important }` — đẩy Year select sang phải.
  - `.topbar-controls #jb-btn { display:none !important }` — ẩn Cloud khỏi bottom bar.
  - `.topbar-controls .top-stat-mobile`: override `display:flex !important` + styling pill (background `#2a2620`, border + radius 999px) — Tổng CP hiển thị ở bottom-LEFT.
- `style.css` (global): class `.ud-cloud-btn` cho nút Cloud trong dropdown User.
- `core.cloud-cats-ui.js` → `updateJbBtn()`: đồng bộ trạng thái `#ud-cloud-status-guest` / `#ud-cloud-status-auth` (✅ Đã kết nối / Chưa kết nối) mỗi khi `updateJbBtn()` chạy.

**Lưu ý cho AI:**
- `top-total`, `top-total-mobile`, `top-total-header` là 3 ID cùng hiển thị Tổng CP — `updateTop()` ở `tienich.js` và `chamcong.core.js` đều update cả 3. Khi sửa layout không xóa bất kỳ ID nào.
- Nút Cloud (`#jb-btn`) chỉ ẩn trên mobile (via CSS), vẫn còn trong DOM để `updateJbBtn()` cập nhật được nếu desktop.
- `openBinModal()` dùng chung từ cả 3 entry points: jb-btn, ud-cloud-btn (guest), ud-action-btn (auth).

### 8.9. UI/UX Phase 3 (24/05/2026) — Sticky + dropdown + dashboard fixes

#### Task A — Year dropdown bị che (mobile)
**Vấn đề:** Sau khi đẩy `topbar-year-wrap` sang góc phải (Phase 2), dropdown anchored `left:0` tràn ra ngoài viewport → bị clip.

**Giải pháp:** `style.css` (@media 768px):
- `.year-dropdown { left:auto; right:0; max-width: calc(100vw - 24px) }` → dropdown anchor PHẢI và bung sang TRÁI.
- Base `.year-dropdown` thêm `max-height:70vh; overflow-y:auto` để không vượt chiều cao màn hình.

#### Task B — Ẩn Cloud button trên DESKTOP
**Lý do:** Phase 2 đã đưa Cloud vào dropdown User. Topbar không còn cần nút Cloud riêng.

**Giải pháp:** `style.css` global rule: `#jb-btn { display:none !important }`. Hàm `updateJbBtn()` vẫn chạy bình thường (chỉ update `if (btn)`) và đồng bộ status vào dropdown User.

#### Task C — Bảng NHẬP Tiền Ứng: ẩn `#` + sticky "Đối Tượng" (mobile)
**Cấu trúc table:** `<table class="entry-table">` trong `#page-nhapung > .entry-table-wrap > .table-scroll`. TH có class `.col-num` (cột `#`) và TD có class `.row-num`.

**Giải pháp:** `style.css` (@media 768px):
- Ẩn `.col-num` và `.row-num` (giải phóng không gian).
- Cột thứ 2 (Đối Tượng = `<select>` thầu phụ/NCC): `position:sticky; left:0` với background + box-shadow. Vì `display:none` không loại element khỏi DOM/order, `nth-of-type(2)` vẫn ám chỉ đúng cột "Đối Tượng".
- Header sticky z-index 5, body sticky z-index 3.

#### Task D — Bảng Thầu Phụ/NCC: ẩn checkbox + sticky cột Tên (mobile)
Phase 2 đã thêm sticky cho cả 2 cột chk + tên (left:0, left:32px). Phase 3:
- `.ung-sticky-table .ung-sticky-chk { display:none !important }` — ẩn cột checkbox.
- `.ung-sticky-table .ung-sticky-name { left:0 !important; min-width:110px }` — cột tên dời về left:0.

#### Task E — Bảng HĐ Thầu Phụ (Doanh Thu): clamp + tăng width cột "Nội Dung"
**Cấu trúc:** `<tbody id="hdtp-tbody">` render TR có cột Nội Dung tại `nth-child(5)`. Inline style cũ: `min-width:90px`.

**Giải pháp:** `style.css` global rule cho `#hdtp-tbody td:nth-child(5)`:
- `min-width:126px !important` (+40% so 90px), `max-width:220px`.
- `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; white-space:normal !important` → giới hạn 2 dòng + `...`.
- `word-break:break-word; line-height:1.35` để text gọn.

#### Task F — Stat boxes "Tổng đã thu" / "Còn phải thu": nowrap + responsive font
**Element:** `#dt-mini-tonghd`, `#dt-mini-dathu`, `#dt-mini-con` (id trong dt-mini-dash).

**Giải pháp:** `style.css` global:
- `white-space:nowrap !important; overflow:hidden; text-overflow:ellipsis`.
- `font-size: clamp(13px, 4.6vw, 20px) !important` cho mobile; `clamp(14px, 1.8vw, 20px)` cho sm+ (≥576px).
- Số tiền tự thu nhỏ khi card hẹp thay vì xuống dòng.

#### Task G — Dashboard chart scroll jump (mobile)
**Vấn đề:** Click cột T20, `_dbSelectWeek` → `_dbBarChartWeekly` → re-render innerHTML của `#db-bar-chart` → outer `<div style="overflow-x:auto">` bị thay mới → scrollLeft reset về 0 → user thấy giật về T1.

**Giải pháp:** `datatools.js` → `_dbSelectWeek(weekKey)`:
1. Capture `scrollLeft` của inner `div[style*="overflow-x"]` TRƯỚC re-render.
2. Capture `window.scrollY` để chống browser auto-scroll lên focused element.
3. Sau re-render, dùng `requestAnimationFrame` để khôi phục cả 2 scroll positions.
4. Nếu `window.scrollY` lệch quá 4px → `window.scrollTo({behavior:'instant'})`.

#### Task H — Bảng Chi Tiết Tuần: tiền nowrap
**Vấn đề:** Inline style của TD tiền trong `_dbBarChartWeekly weekDetailHtml` không có `white-space:nowrap` → số tiền dài bị bẻ 2 dòng trên mobile.

**Giải pháp:** `style.css` global selector:
- `#db-bar-chart table td[style*="monospace"]` → match tất cả TD monospace (cột Hóa đơn, Ứng TP, Ứng NCC, Tổng) → `white-space:nowrap !important`.
- `#db-bar-chart table tfoot td` → match grandTotal row + summary cell.

**Lưu ý cho AI:**
- `position:sticky` trên TD cần ancestor scrollable. `.entry-table` có `.table-scroll` (parent) + `.entry-table-wrap` (grandparent) — cả 2 đều `overflow-x:auto` trên mobile.
- Khi ẩn cột bằng `display:none`, `nth-of-type` / `nth-child` vẫn ám chỉ thứ tự DOM ban đầu (không tính lại) — đây là behavior cần thiết để CSS selector ổn định.
- `_dbSelectWeek` không tự render full dashboard — chỉ re-render bar chart + pie chart từ cached data. Scroll preservation chỉ cần cover 2 element này.

