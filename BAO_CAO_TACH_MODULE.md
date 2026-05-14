# Báo cáo phân tích và đề xuất tách module JS

Ngày lập: 2026-05-14  
Phạm vi đọc/quét: `AI_CONTEXT.md`, `index.html`, `core.js`, `projects.js`, `nhapxuat.js`, `danhmuc.js`, `doanhthu.js`

---

## 1. Kết luận nhanh

Codebase hiện tại là SPA tĩnh, Vanilla JS, không dùng bundler và không dùng `import/export`. Toàn bộ module đang chạy bằng biến/hàm global, phụ thuộc mạnh vào thứ tự `<script>` trong `index.html`.

Vì vậy hướng tách hợp lý nhất là **tách file vật lý nhưng vẫn giữ classic script global scope**. Không nên chuyển ngay sang ES module trong cùng một bước, vì nhiều hàm đang được gọi trực tiếp từ HTML inline như `onclick="saveAllUngRows()"`, `onchange="handleImportFile(event)"`, `onclick="saveHopDongChinh()"`.

Mục tiêu tách:

- Mỗi file gốc tách thành 2-3 file nhỏ hơn.
- Giữ nguyên hành vi runtime, API global và thứ tự phụ thuộc.
- Không đổi data model, không đổi `load/save`, không đổi IndexedDB/sync contract.
- Sau khi tách, mỗi file mới có trách nhiệm rõ ràng hơn để dễ bảo trì.

---

## 2. Hiện trạng kích thước file

| File | Số dòng | Nhận xét chính |
|---|---:|---|
| `core.js` | 1.575 | Trộn storage, migration, backup JSON, Firebase UI cũ, category item sync, pending sync UI, global state |
| `projects.js` | 1.773 | Trộn domain project, migration link, helper select, overview grid, detail modal, CRUD modal |
| `nhapxuat.js` | 2.034 | File lớn nhất; trộn parser Excel, preview/apply import, export Excel/CSV |
| `danhmuc.js` | 1.176 | Trộn danh mục/cấu hình với nghiệp vụ tiền ứng và backup tool wrapper |
| `doanhthu.js` | 1.653 | Trộn helper doanh thu, hợp đồng chính, thu tiền, hợp đồng thầu phụ, công nợ/lãi lỗ, export ảnh |

Tổng 5 file: khoảng 8.211 dòng.

---

## 3. Ràng buộc kiến trúc cần giữ

### 3.1. Thứ tự nạp script hiện tại

Hiện `index.html` đang nạp:

```html
<script src="core.js"></script>
<script src="projects.js"></script>
<script src="tienich.js"></script>
<script src="hoadon.js"></script>
<script src="danhmuc.js"></script>
<script src="nhapxuat.js"></script>
<script src="datatools.js"></script>
<script src="chamcong.js"></script>
<script src="thietbi.js"></script>
<script src="doanhthu.js"></script>
<script src="sync.js"></script>
<script src="main.js"></script>
```

Sau khi tách vẫn phải đảm bảo:

- Nhóm `core-*` nạp trước tất cả.
- Nhóm `projects-*` nạp trước `tienich.js`, `hoadon.js`, `danhmuc.js`, `nhapxuat.js`, `doanhthu.js`.
- Nhóm `danhmuc-*` vẫn nạp trước `nhapxuat.js` vì import/export dùng nhiều danh mục và biến `ungRecords`.
- Nhóm `doanhthu-*` vẫn nạp trước `sync.js` và `main.js`.
- Các hàm inline HTML vẫn phải tồn tại ở `window/global scope`.

### 3.2. Các global contract quan trọng

Không được làm mất hoặc đổi tên các global này trong bước tách đầu tiên:

| Nhóm | Global cần giữ |
|---|---|
| Core storage | `DEFAULTS`, `CATS`, `FB_CONFIG`, `db`, `DB_KEY_MAP`, `_mem`, `load`, `save`, `_memSet`, `_dbSave`, `dbInit` |
| Core state | `cats`, `cnRoles`, `invoices`, `filteredInvs`, `curPage`, `_reloadGlobals`, `afterDataChange`, `saveCats` |
| Record helpers | `mkRecord`, `mkUpdate`, `buildNDFromItems`, `dedupById`, `mergeUnique` |
| Project | `projects`, `PROJECT_COMPANY`, `createProject`, `updateProject`, `getProjectById`, `findProjectIdByName`, `resolveProjectName`, `_buildProjOpts`, `renderProjectsPage`, `openCTDetail` |
| Danh mục | `renderSettings`, `addItem`, `startEdit`, `finishEdit`, `delItem`, `ungRecords`, `saveAllUngRows`, `renderUngTable`, `buildUngFilters` |
| Nhập xuất | `_importSession`, `openImportModal`, `handleImportFile`, `_applyImport`, `openExportModal`, `exportExcel`, `exportEntryCSV`, `exportAllCSV` |
| Doanh thu | `hopDongData`, `thuRecords`, `thauPhuContracts`, `saveHopDongChinh`, `saveThuRecord`, `saveHopDongThauPhu`, `renderHdcTable`, `renderThuTable`, `renderHdtpTable`, `renderCongNoThauPhu`, `renderLaiLo`, `initDoanhThu` |

---

## 4. Đề xuất tách `core.js`

### 4.1. Vấn đề hiện tại

`core.js` đang là “nền móng” nhưng chứa nhiều lớp:

- Config mặc định và Firebase config.
- IndexedDB/Dexie schema, `_mem`, `load/save`.
- Migration và reload global state.
- Backup/import/export JSON.
- Helpers record.
- Autocomplete dùng chung.
- Firebase document format và modal cấu hình cloud cũ.
- Category item soft-delete sync.
- Pending sync badge.

Điểm rủi ro: rất nhiều file khác phụ thuộc trực tiếp vào `load`, `save`, `cats`, `invoices`, `_reloadGlobals`, `saveCats`, nên không thể tách tùy tiện.

### 4.2. File đề xuất

#### A. `core.storage.js`

Chứa phần nền thấp nhất:

- `DEFAULTS`, `CATS`
- `FB_CONFIG`, `FB_CFG_KEY`, `FS_BASE`
- `_loadLS`, `_saveLS`
- Dexie `db`, `DB_KEY_MAP`
- `_mem`, `_memSet`, `_dbSave`, `dbInit`
- `load`, `save`
- `dedupById`, `mergeUnique`
- `_INV_CACHE_KEYS`
- `mkRecord`, `mkUpdate`, `buildNDFromItems`
- `_normViStr`, autocomplete chung nếu đang cần sớm

Lý do: đây là API nền mà mọi module khác phải có trước.

#### B. `core.state-backup.js`

Chứa phần quản lý trạng thái, migration, backup:

- `DATA_VERSION`, `DATA_VERSION_KEY`, `migrateData`
- `_migrateHopDongKeys`, `_hdLookup`, `_hdKeyOf`
- `_getProjectById`, `_getProjectNameById`, `_getProjectIdByName`, `_resolveCtName`
- `BACKUP_KEYS`, `BACKUP_KEY`
- `_legacySnapToStore`, `_countStore`, `_restoreStore`
- `clearAllCache`, `getState`, `afterDataChange`, `_reloadGlobals`
- `_snapshotNow`, `getBackupList`, `restoreFromBackup`, `renderBackupList`
- `exportJSON`, `importJSON`, `_showImportJSONConfirm`, `importJSONFull`
- khởi tạo global: `cats`, `cnRoles`, `invoices`, `filteredInvs`, `curPage`, `PG`

Lý do: đây là lớp “state orchestration”, đọc/ghi qua `core.storage.js` nhưng không nên nằm chung với Dexie schema.

#### C. `core.cloud-cats-ui.js`

Chứa phần cloud legacy UI, category items và sync badge:

- `fbReady`
- `compressInv`, `expandInv`, `compressCC`, `expandCC`, `compressUng`, `expandUng`, `compressTb`, `expandTb`
- `fsWrap`, `fsUnwrap`, `fbDocYear`, `fbDocCats`, `fbYearPayload`, `fbCatsPayload`
- `fsUrl`, `fsGet`, `fsSet`, `estimateYearKb`, `gsLoadAll`
- `updateJbBtn`, `_ensureSyncDot`, `_setSyncDot`
- `openBinModal`, `closeBinModal`, `renderBinModal`, `_createModalOverlay`, `fbSaveConfig`, `fbDisconnect`, `reloadFromCloud`, `syncNow`
- `buildYearSelect`, `_renderYearSelect`, `_updateYearBtn`
- `saveCats`
- `_catNormKey`, `_dedupCatItemsNow`, `_CATITEM_TYPE_MAP`, `_syncCatItems`, `_rebuildCatArrsFromItems`, `_migrateCatItemsIfNeeded`
- `showSyncBanner`, `hideSyncBanner`, `_setSyncState`
- `_pendingChanges`, `_blockPullUntil`, `_SYNC_DATA_KEYS`, `_incPending`, `_resetPending`, `_updateSyncBtnBadge`

Lý do: đây là phần UI/đồng bộ phụ trợ, nên tách khỏi storage để `core.storage.js` không phình thêm.

### 4.3. Thứ tự nạp mới cho core

```html
<script src="core.storage.js"></script>
<script src="core.state-backup.js"></script>
<script src="core.cloud-cats-ui.js"></script>
```

---

## 5. Đề xuất tách `projects.js`

### 5.1. Vấn đề hiện tại

`projects.js` vừa quản lý dữ liệu công trình vừa render toàn bộ tab Công Trình. File này có 3 nhóm rõ:

- Domain/model: validate, CRUD, project lookup, allocate chi phí công ty.
- Migration/linking: migrate `projectId`, deduplicate project, rebuild `cat_ct`.
- UI: filter grid, detail modal, create/edit/close/delete modal.

### 5.2. File đề xuất

#### A. `projects.model.js`

Chứa domain và data project:

- `PROJECT_STATUS`
- `_PROJ_DATE_RE`, `_VALID_STATUSES`, `_PROJ_VALID_TYPES`, `_PROJ_FACTORS`
- `_projTypeByName`, `_isValidProject`, `cleanupInvalidProjects`
- `PROJECT_COMPANY`
- `projects`
- `_saveProjects`, `rebuildCatCTFromProjects`, `_migrateProjectDates`
- `getProjectAutoStartDate`
- `createProject`, `updateProject`
- `getProjectById`, `findProjectIdByName`
- `getSortedProjects`, `getAllProjects`, `getProjectOptions`
- `getProjectDays`, `getProjectFactor`, `getProjectWeight`, `getCompanyCost`, `allocateCompanyCost`
- `canDeleteProject`, `resolveProjectName`

#### B. `projects.migration-selects.js`

Chứa cầu nối dữ liệu cũ và helper select dùng xuyên module:

- `migrateProjectLinks`
- `deduplicateProjects`
- `_buildProjOpts`
- `_buildProjFilterOpts`
- `_readPidFromSel`
- `_checkProjectClosed`
- `_fmtProjDate`

Lý do tách riêng: các module nhập liệu như hóa đơn, tiền ứng, doanh thu, thiết bị cần dùng helper select nhưng không cần biết UI page Công Trình.

#### C. `projects.ui.js`

Chứa toàn bộ UI tab Công Trình:

- `_PT_STATUS_META`, `_PT_GROUP_LABELS`, `_PT_ORDER`
- `_goTabWithCT`
- `renderProjectsPage`, `_ctGetCosts`, `_buildInvoiceMap`, `_ctGetCostsFromMap`
- `_ptDuration`, `_ptStatusBadge`, `_ptStatBox`, `_ptDurationDays`
- `_ctSearch`, `_ctFStatus`, `_ctFType`, `_ctFLaiLo`
- `renderCTOverview`, `_ctApply`, `_ctRenderGrid`
- `openCTDetail`
- `openCTCreateModal`, `saveCTCreate`
- `openCTEditModal`, `saveCTEdit`
- `quickCloseCT`, `confirmQuickClose`
- `quickCompleteCT`, `confirmQuickComplete`
- `confirmDeleteCT`

### 5.3. Thứ tự nạp mới cho projects

```html
<script src="projects.model.js"></script>
<script src="projects.migration-selects.js"></script>
<script src="projects.ui.js"></script>
```

---

## 6. Đề xuất tách `danhmuc.js`

### 6.1. Vấn đề hiện tại

`danhmuc.js` đang chứa hai mảng nghiệp vụ khá khác nhau:

- Danh mục/cấu hình: render danh mục, thêm/sửa/xóa danh mục, chuẩn hóa tên, sync vai trò công nhân.
- Tiền ứng: form nhập tiền ứng, filter, render bảng, export CSV.
- Tool wrappers: backup/restore nhỏ.

Điểm cần chú ý: `nhapxuat.js` đang dùng `ungRecords`, nên nhóm tiền ứng phải nạp trước import/export.

### 6.2. File đề xuất

#### A. `danhmuc.categories.js`

Chứa danh mục và chuẩn hóa dữ liệu:

- `renderCtPage`, `showCtModal`, `closeModal`
- `normalizeName`, `normalizeKey`
- `_isDmItemUsedInYear`, `_isDmItemUsedAnytime`
- `scanAndFixAllDataFormats`
- `_catNamesMigrated`, `_migrateCatNamesFormat`
- `renderSettings`, `_dmFilterCard`
- `renderCTItem`, `renderItem`, `renderCNItem`, `renderTbTenItem`
- `updateCNRole`, `syncCNRoles`
- `startEdit`, `cancelEdit`, `finishEdit`
- `addItem`, `isItemInUse`, `delItem`
- `_dedupCatArr`, `rebuildEntrySelects`

#### B. `danhmuc.ung.js`

Chứa toàn bộ tiền ứng:

- `ungRecords`, `filteredUng`, `ungPage`, `UNG_TP_PG`, `ungTpPage`, `_editingUngId`
- `_normalizeUngDeletedAt`, `_normalizeUngProjectIds`
- `initUngTable`, `initUngTableIfEmpty`
- `addUngRows`, `clearUngRows`, `resetUngForm`
- `onUngLoaiChange`, `_ungTpOptions`
- `addUngRow`, `delUngRow`, `renumberUng`, `calcUngSummary`
- `clearUngTable`, `saveAllUngRows`, `editUngRecord`
- `buildUngFilters`, `filterAndRenderUng`
- `_ungSectionHTML`, `renderUngTable`, `goUngTpTo`, `delUngRecord`
- `rebuildUngSelects`
- `exportUngEntryCSV`, `exportUngAllCSV`

#### C. `danhmuc.tools.js`

Chứa wrapper tiện ích nhỏ:

- `toolBackupNow`
- `toolRestoreBackup`

Nếu muốn giảm số file, có thể gộp `danhmuc.tools.js` vào `danhmuc.categories.js`, vì chỉ có vài hàm.

### 6.3. Thứ tự nạp mới cho danh mục

```html
<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
<script src="danhmuc.tools.js"></script>
```

---

## 7. Đề xuất tách `nhapxuat.js`

### 7.1. Vấn đề hiện tại

`nhapxuat.js` là file lớn nhất và có ranh giới trách nhiệm khá rõ:

- Helper parse/normalize Excel.
- Parser từng sheet.
- Detect duplicate và session import.
- Preview/apply import.
- Export Excel/CSV.

File này nên tách để giảm rủi ro khi sửa import mà ảnh hưởng export, hoặc ngược lại.

### 7.2. File đề xuất

#### A. `nhapxuat.parsers.js`

Chứa helper và parser sheet:

- `_normStr`, `_parseDate`, `_pNum`, `_str`, `_sheetRows`
- `_hasDiacritics`, `_deduplicateCatNames`, `_buildCanonMap`
- `_dayOfWeek`, `_isEmptyRow`, `_formatCatName`
- `_markDuplicateInBatch`
- `_makeCatLookup`, `_makeCatLookupWithExtra`
- `_resolveProvisionalProjectIds`
- `_mkErr`, `_fmtErr`
- `parseSheet1` đến `parseSheet9`
- `_DANHMUC_GROUP_MAP`

#### B. `nhapxuat.import.js`

Chứa import session, preview và apply:

- `_isDupInvQ`, `_isDupInvD`, `_isDupUng`, `_isDupThu`, `_isDupTb`, `_isDupTp`, `_isDupCC`
- `_detectSheetType`
- `_importSession`
- `_doImportParse`
- `_markDuplicates`
- `_showImportPreviewNew`
- `_toggleAllImportSheets`
- `_applyImport`
- `_generateImportLog`
- `openImportModal`
- `handleImportFile`

#### C. `nhapxuat.export.js`

Chứa export:

- `openExportModal`
- `_buildSheet`
- `buildHoaDonNhanh`, `buildHoaDonChiTiet`, `buildChamCong`, `buildTienUng`, `buildThietBi`, `buildDanhMuc`, `buildHopDongChinh`, `buildThuTien`, `buildHopDongThauPhu`, `buildHuongDan`
- `exportExcel`
- `_doExport`
- `exportEntryCSV`
- `exportAllCSV`
- `toolImportExcel`
- `toolExportExcel`

### 7.3. Thứ tự nạp mới cho nhập/xuất

```html
<script src="nhapxuat.parsers.js"></script>
<script src="nhapxuat.import.js"></script>
<script src="nhapxuat.export.js"></script>
```

---

## 8. Đề xuất tách `doanhthu.js`

### 8.1. Vấn đề hiện tại

`doanhthu.js` đang chứa cả phần nhập liệu và phần báo cáo:

- Global data: hợp đồng chính, thu tiền, hợp đồng thầu phụ.
- Helpers bảng khối lượng chi tiết.
- Subtab/filter.
- CRUD hợp đồng chính.
- CRUD thu tiền.
- CRUD hợp đồng thầu phụ.
- Công nợ/lãi lỗ.
- Export ảnh.

Nên tách theo “khai báo dữ liệu” và “báo cáo”.

### 8.2. File đề xuất

#### A. `doanhthu.core.js`

Chứa global data và helper dùng chung:

- `hopDongData`, `thuRecords`, `thauPhuContracts`
- `_normalizeThuProjectIds`
- `_hdcItems`, `_hdtpItems`
- `calcHopDongValue`, `_migrateHopDongSL`, `_initDoanhThuAddons`
- `updateGlobalTotals`, `bindItemsToTable`
- `_hdcPage`, `_hdtpPage`, `_thuPage`, `DT_PG`
- `_dtCtFilter`, `_dtMatchProjFilter`, `_dtMatchHDCFilter`
- `dtPopulateCtFilter`, `dtSetCtFilter`
- `fmtInputMoney`, `_readMoneyInput`, `_dtInYear`, `_dtPaginationHtml`
- `dtGoSub`, `dtEnsureCongNoSubtab`
- `dtPopulateSels`
- `_dtAddCT`, `_dtAddTP`

#### B. `doanhthu.forms.js`

Chứa CRUD/nhập liệu:

- `hdcUpdateTotal`, `saveHopDongChinh`, `_hdcResetForm`, `editHopDongChinh`, `delHopDongChinh`, `renderHdcTable`
- `saveThuRecord`, `editThuRecord`, `_thuCancelEdit`, `_thuResetForm`, `delThuRecord`, `renderThuTable`
- `hdtpUpdateTotal`, `saveHopDongThauPhu`, `_hdtpResetForm`, `editHopDongThauPhu`, `delHopDongThauPhu`, `renderHdtpTable`

#### C. `doanhthu.reports-export.js`

Chứa báo cáo và export ảnh:

- `renderCongNoThauPhu`
- `_renderCongNoTable`
- `renderCongNoNhaCungCap`
- `renderLaiLo`
- `initDoanhThu`
- `copyKLCT`, `pasteKLCT`
- `exportHdcToImage`, `exportHdtpToImage`, `exportThuToImage`

### 8.3. Thứ tự nạp mới cho doanh thu

```html
<script src="doanhthu.core.js"></script>
<script src="doanhthu.forms.js"></script>
<script src="doanhthu.reports-export.js"></script>
```

---

## 9. Thứ tự script đề xuất sau khi tách

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://unpkg.com/dexie@4/dist/dexie.min.js"></script>

<script src="core.storage.js"></script>
<script src="core.state-backup.js"></script>
<script src="core.cloud-cats-ui.js"></script>

<script src="projects.model.js"></script>
<script src="projects.migration-selects.js"></script>
<script src="projects.ui.js"></script>

<script src="tienich.js"></script>
<script src="hoadon.js"></script>

<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
<script src="danhmuc.tools.js"></script>

<script src="nhapxuat.parsers.js"></script>
<script src="nhapxuat.import.js"></script>
<script src="nhapxuat.export.js"></script>

<script src="datatools.js"></script>
<script src="chamcong.js"></script>
<script src="thietbi.js"></script>

<script src="doanhthu.core.js"></script>
<script src="doanhthu.forms.js"></script>
<script src="doanhthu.reports-export.js"></script>

<script src="sync.js"></script>
<script src="main.js"></script>
```

---

## 10. Kế hoạch triển khai an toàn

### Giai đoạn 1: Tách cơ học, không đổi hành vi

1. Tạo file mới theo nhóm đề xuất.
2. Di chuyển nguyên khối code theo đúng thứ tự hiện tại.
3. Không đổi tên hàm, không đổi tên biến global.
4. Cập nhật `index.html` để nạp các file mới.
5. Giữ file cũ tạm thời dưới dạng backup hoặc xóa khỏi `index.html` trước, chưa xóa khỏi repo ngay.

Tiêu chí đạt:

- App load không lỗi console.
- `dbInit()` chạy được.
- `main.js init()` chạy được.
- Các tab chính render được.

### Giai đoạn 2: Kiểm thử hồi quy thủ công

Checklist nên chạy sau tách:

- Mở app, đăng nhập nếu có auth.
- Tab Hóa Đơn: thêm/sửa/xóa hóa đơn nhanh và chi tiết.
- Tab Công Trình: tạo công trình, sửa, hoàn thành, quyết toán, xóa khi không còn dữ liệu.
- Tab Danh Mục: thêm/sửa/xóa loại chi phí, nhà cung cấp, người thực hiện, công nhân, thiết bị.
- Tab Tiền Ứng: thêm tiền ứng thầu phụ, nhà cung cấp, công nhân; sửa/xóa; lọc bảng.
- Import Excel: import file có DanhMuc + HoaDon + ChamCong + TienUng + DoanhThu.
- Export Excel: xuất đủ 10 sheet.
- Doanh Thu: lưu hợp đồng chính, thu tiền, hợp đồng thầu phụ; kiểm tra công nợ và lãi/lỗ.
- Sync: bấm sync thủ công, kiểm tra pending badge.
- Backup JSON: export/import snapshot nếu có môi trường test riêng.

### Giai đoạn 3: Làm sạch sau khi tách

Sau khi chắc chắn app chạy ổn:

- Xóa các file cũ khỏi `index.html`.
- Có thể giữ file cũ trong repo một nhánh riêng hoặc backup ngoài, nhưng không nạp nữa.
- Thêm comment đầu mỗi file ghi rõ load order và trách nhiệm.
- Cập nhật `AI_CONTEXT.md` với script order mới.

### Giai đoạn 4: Refactor nhẹ sau tách

Chỉ làm sau khi tách cơ học ổn:

- Gom helper trùng tên/ý nghĩa như `_normStr`, `normalizeKey`, `_catNormKey` vào một helper chung nếu không gây vòng phụ thuộc.
- Chuẩn hóa API project select: `_buildProjOpts`, `_buildProjFilterOpts`, `getProjectOptions`.
- Rà lại các global chỉ dùng nội bộ để đổi tiền tố `_` hoặc đưa vào object namespace.
- Tách tiếp `core.cloud-cats-ui.js` nếu muốn chuyển phần Firebase cũ sang `sync.js` trong tương lai.

---

## 11. Rủi ro chính và cách tránh

| Rủi ro | File liên quan | Cách tránh |
|---|---|---|
| Hàm inline HTML không còn ở global scope | `index.html`, mọi file | Không dùng IIFE/module wrapper trong giai đoạn 1 |
| Sai thứ tự nạp làm `load/save/cats/projects` chưa tồn tại | tất cả | Giữ script order theo mục 9 |
| `save()` gọi `_SYNC_DATA_KEYS` trước khi biến được khai báo | `core.storage.js`, `core.cloud-cats-ui.js` | Đảm bảo không gọi `save()` ở top-level trước khi `core.cloud-cats-ui.js` nạp xong; tốt nhất đặt `_SYNC_DATA_KEYS` gần `save()` hoặc giữ pending block trong `core.storage.js` |
| `projects.ui.js` dùng `fmtISODate`, `getInvoicesCached` từ `tienich.js` | `projects.js`, `tienich.js` | Hiện tại `projects.js` nạp trước `tienich.js` nhưng các hàm UI chỉ chạy sau bootstrap; vẫn an toàn nếu không gọi render sớm |
| `nhapxuat.import.js` cần parser từ `nhapxuat.parsers.js` | `nhapxuat.js` | Nạp parsers trước import |
| `nhapxuat.export.js` cần data từ `doanhthu.js` nhưng đang nạp trước doanhthu | `nhapxuat.js`, `doanhthu.js` | Chỉ dùng khi user click export sau khi toàn app đã nạp; vẫn an toàn. Không gọi export ở top-level |
| `danhmuc.ung.js` cần helper category | `danhmuc.js` | Nạp `danhmuc.categories.js` trước |
| `doanhthu.reports-export.js` cần forms/core data | `doanhthu.js` | Nạp `doanhthu.core.js`, rồi `doanhthu.forms.js`, rồi reports |

Ghi chú quan trọng về `core`: trong bản tách thật, nên cân nhắc để `_SYNC_DATA_KEYS`, `_pendingChanges`, `_incPending`, `_resetPending`, `_updateSyncBtnBadge` nằm cùng file với `save()` để giảm rủi ro temporal dependency. Nếu vẫn muốn tách sang `core.cloud-cats-ui.js`, cần chắc chắn không có `save()` top-level trước khi file đó được nạp.

---

## 12. Plan tách chi tiết theo thứ tự commit

### Commit 1: Tách `core.js`

- Tạo `core.storage.js`, `core.state-backup.js`, `core.cloud-cats-ui.js`.
- Cập nhật `index.html`.
- Chạy smoke test app load.
- Không đụng các file module khác.

Lý do làm `core` trước: đây là nền. Nếu core tách ổn thì các module còn lại dễ tách hơn.

### Commit 2: Tách `projects.js`

- Tạo `projects.model.js`, `projects.migration-selects.js`, `projects.ui.js`.
- Cập nhật `index.html`.
- Test tab Công Trình và các dropdown công trình ở Hóa Đơn/Tiền Ứng/Doanh Thu.

### Commit 3: Tách `danhmuc.js`

- Tạo `danhmuc.categories.js`, `danhmuc.ung.js`, tùy chọn `danhmuc.tools.js`.
- Cập nhật `index.html`.
- Test danh mục, tiền ứng, export CSV tiền ứng.

### Commit 4: Tách `nhapxuat.js`

- Tạo `nhapxuat.parsers.js`, `nhapxuat.import.js`, `nhapxuat.export.js`.
- Cập nhật `index.html`.
- Test import preview, apply import, export Excel, export CSV.

### Commit 5: Tách `doanhthu.js`

- Tạo `doanhthu.core.js`, `doanhthu.forms.js`, `doanhthu.reports-export.js`.
- Cập nhật `index.html`.
- Test hợp đồng chính, thu tiền, hợp đồng thầu phụ, công nợ, lãi/lỗ, export ảnh.

### Commit 6: Cập nhật tài liệu

- Cập nhật `AI_CONTEXT.md` phần script load order.
- Ghi chú các file mới và trách nhiệm.
- Ghi lại checklist kiểm thử đã chạy.

---

## 13. Ưu tiên nếu muốn làm ít file hơn

Nếu muốn tránh tạo quá nhiều file ngay lập tức, có thể dùng phương án 2 file cho mỗi module:

| File gốc | Phương án 2 file |
|---|---|
| `core.js` | `core.storage-state.js` + `core.backup-cloud-cats.js` |
| `projects.js` | `projects.model.js` + `projects.ui.js` |
| `danhmuc.js` | `danhmuc.categories.js` + `danhmuc.ung.js` |
| `nhapxuat.js` | `nhapxuat.import.js` + `nhapxuat.export.js` |
| `doanhthu.js` | `doanhthu.forms.js` + `doanhthu.reports.js` |

Tuy nhiên tôi khuyến nghị phương án 3 file cho `nhapxuat.js`, `projects.js`, `doanhthu.js` vì các ranh giới trong 3 file này rất rõ. Với `danhmuc.js`, 2 file là đủ nếu không muốn tách `tools`.

---

## 14. Đề xuất cuối cùng

Nên thực hiện refactor theo hướng:

1. **Không đổi kiến trúc global script trong lần đầu.**
2. **Tách theo thứ tự từ nền đến nghiệp vụ:** core → projects → danhmuc → nhapxuat → doanhthu.
3. **Mỗi commit chỉ tách một file gốc.**
4. **Sau mỗi commit phải chạy smoke test ngay.**
5. **Chỉ sau khi tách ổn mới tính chuyện gom helper hoặc chuyển dần sang namespace/module.**

Đây là cách ít rủi ro nhất vì app hiện phụ thuộc nhiều vào global mutable state, IndexedDB cache `_mem`, `save()` side effects, invoice cache, và sync pending/pull guard.
