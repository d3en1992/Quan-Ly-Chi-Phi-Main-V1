```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi tách.

Sau khi tách xong hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Tách xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 6: Tách `chamcong.js`

Bạn hãy dựa vào [AI_CONTEXT.md](AI_CONTEXT.md) và [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) để tách file [chamcong.js](chamcong.js) thành các file nhỏ hơn.

## Mục tiêu

Tách `chamcong.js` thành 3 file:

1. `chamcong.core.js`
2. `chamcong.week-form.js`
3. `chamcong.history-reports.js`

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS đang chạy bằng classic script global scope. Vì vậy khi tách file:

- Không dùng `import/export`.
- Không bọc code trong IIFE/module wrapper nếu làm mất global scope.
- Không đổi tên hàm/biến global.
- Không đổi data model `cc_v2`.
- Không đổi logic dedup chấm công.
- Không đổi logic tuần bắt đầu Chủ Nhật.
- Không đổi logic `projectId`/fallback tên công trình.
- Không đổi logic tạo/lưu tuần chấm công.
- Không đổi logic tổng lương tuần.
- Không đổi logic công nợ công nhân.
- Không đổi logic export CSV.
- Không đổi logic xuất phiếu lương / export ảnh.
- Không đổi id/class DOM nếu không cần.
- Không đổi UI text nếu không cần.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [chamcong.js](chamcong.js)
- [index.html](index.html)

Nên đọc thêm nếu cần:

- nhóm core đã tách nếu có:
  - `core.storage.js`
  - `core.state-backup.js`
  - `core.cloud-cats-ui.js`
- hoặc `core.js` nếu core chưa tách
- nhóm project đã tách nếu có:
  - `projects.model.js`
  - `projects.migration-selects.js`
  - `projects.ui.js`
- hoặc `projects.js` nếu project chưa tách
- nhóm danh mục đã tách nếu có:
  - `danhmuc.categories.js`
  - `danhmuc.ung.js`
  - `danhmuc.tools.js`
- hoặc `danhmuc.js` nếu danh mục chưa tách
- `tienich.js`
- `hoadon.js`
- `nhapxuat.js` hoặc nhóm `nhapxuat.*.js` nếu đã tách
- `datatools.js`
- `thietbi.js`
- `doanhthu.js` hoặc nhóm `doanhthu.*.js` nếu đã tách
- `sync.js`
- `main.js`

## Ràng buộc kiến trúc

Hiện tại `chamcong.js` được nạp sau `datatools.js` và trước `thietbi.js`.

Sau khi tách, hãy thay:

```html
<script src="chamcong.js"></script>
```

bằng:

```html
<script src="chamcong.core.js"></script>
<script src="chamcong.week-form.js"></script>
<script src="chamcong.history-reports.js"></script>
```

Thứ tự này rất quan trọng:

1. `chamcong.core.js` phải nạp trước vì chứa `ccData`, constants, date helpers, dedup và helper dùng chung.
2. `chamcong.week-form.js` nạp sau core vì chứa form nhập tuần, row handlers, lưu tuần.
3. `chamcong.history-reports.js` nạp cuối vì chứa lịch sử, tổng lương tuần, export CSV, phiếu lương/export ảnh.

Không đổi thứ tự các script khác.

Nhóm `chamcong.*.js` vẫn phải nạp sau `datatools.js` và trước `thietbi.js`, trừ khi `index.html` hiện tại đã được tách module khác thì giữ đúng vị trí cũ của `chamcong.js`.

## Phân chia nội dung đề xuất

### 1. `chamcong.core.js`

File này chứa dữ liệu nền, constants, helper ngày/tuần, helper công nhân và các hàm normalize dùng chung.

Di chuyển các phần sau từ `chamcong.js` sang `chamcong.core.js`:

- `_dedupCC`
- biến global chấm công:
  - `ccData`
  - `ccOffset`
  - `ccHistPage`
  - `ccTltPage`
  - `CC_PG_HIST`
  - `CC_PG_TLT`
  - `CC_DAY_LABELS`
  - `CC_DATE_OFFSETS`
- `round1`
- debt column state/helper:
  - `_ccDebtColsHidden`
  - `toggleCCDebtCols`
  - `_applyCCDebtColsVisibility`
  - `_calcDebtBefore`
- date/week helpers:
  - `isoFromParts`
  - `ccSundayISO`
  - `ccSaturdayISO`
  - `snapToSunday`
  - `viShort`
  - `weekLabel`
  - `iso`
- worker name helpers:
  - `ccAllNames`
  - `rebuildCCNameList`
- normalize/category helpers:
  - `normalizeAllChamCong`
  - `rebuildCCCategories`
  - `updateTopFromCC`
- project selector helper chung:
  - `populateCCCtSel`
  - `updateCCSaveBtn`
  - `onCCCtSelChange`
- helper format nhỏ cuối file nếu dùng chung:
  - `_fmtDate`

Yêu cầu:

- `ccData` vẫn phải là global `let`, vì `core._reloadGlobals()`, `projects`, `danhmuc`, `nhapxuat`, `datatools`, `sync`, `tienich/buildInvoices()` có thể đọc/gán lại.
- Không đổi logic `_dedupCC`.
- Không đổi logic lọc record `deletedAt`.
- Không đổi logic week Sunday-Saturday.
- Không đổi `CC_DAY_LABELS` và `CC_DATE_OFFSETS`.
- Không đổi logic nợ cũ/vay mới/trừ nợ.
- Không đổi logic cập nhật danh mục công nhân từ `ccData`.
- Không đổi logic `cat_cn_roles`.
- Không đổi logic `save('cc_v2', ccData)`.

Lưu ý phụ thuộc:

- File này dùng `load`, `save`, `cats`, `cnRoles`, `activeYear`, `inActiveYear`, `fmtISODate`, `toast`, `clearInvoiceCache`, `normalizeKey`, `findProjectIdByName`, `resolveProjectName`.
- Một số hàm phụ thuộc module khác nhưng chỉ chạy sau khi app đã nạp đủ. Không gọi chúng ở top-level nếu có nguy cơ module chưa sẵn sàng.

### 2. `chamcong.week-form.js`

File này chứa toàn bộ UI/form nhập chấm công tuần và thao tác lưu/copy/paste tuần.

Di chuyển các phần sau:

- init/navigation:
  - `initCC`
  - `ccGoToWeek`
  - `ccPrevWeek`
  - `ccNextWeek`
  - `onCCFromChange`
  - `loadCCWeekForm`
- build form/table:
  - `buildCCTable`
  - `addCCWorker`
  - `addCCRow`
  - `buildCCRow`
- row input handlers:
  - `onCCNameInput`
  - `onCCDayKey`
  - `onCCWageKey`
  - `onCCMoneyKey`
  - `calcCCRow`
  - `delCCRow`
  - `renumberCC`
  - `updateCCSumRow`
- save/form actions:
  - `saveCCWeek`
  - `clearCCWeek`
- clipboard:
  - `ccClipboard`
  - `copyCCWeek`
  - `pasteCCWeek`

Yêu cầu:

- Các hàm form vẫn phải global vì `index.html` và inline handlers có thể gọi trực tiếp.
- `ccClipboard` vẫn phải global.
- Không đổi logic build row.
- Không đổi input name/class/data attributes.
- Không đổi logic autocomplete công nhân.
- Không đổi logic tính tổng từng dòng.
- Không đổi logic tổng cuối bảng.
- Không đổi logic lưu tuần hiện tại:
  - tìm tuần theo `fromDate`/`toDate`/`projectId` hoặc logic hiện có.
  - preserve `createdAt` khi update.
  - cập nhật `updatedAt`.
  - dùng `mkRecord`/metadata hiện có.
  - dùng `save('cc_v2', ccData)`.
- Không đổi logic tạo hóa đơn lẻ từ công nhân nếu code hiện tại đang làm trong `saveCCWeek`.
- Không đổi logic clear invoice cache nếu có.
- Không đổi logic chặn công trình đã quyết toán.
- Không đổi logic copy/paste tuần.

Lưu ý phụ thuộc:

- File này dùng helper từ `chamcong.core.js`, nên phải nạp sau core.
- File này dùng `mkRecord`, `save`, `toast`, `parseMoney`, `fmt`, `renumberRows`, `_buildProjOpts`, `_readPidFromSel`, `_checkProjectClosed`, `resolveProjectName`, `findProjectIdByName`, `DEVICE_ID`, `_refreshAllTabs`.
- `DEVICE_ID` thường nằm trong `sync.js`, được nạp sau `chamcong.js`. Nếu code hiện tại chỉ dùng `DEVICE_ID` trong function body thì giữ nguyên. Không dùng `DEVICE_ID` ở top-level.

### 3. `chamcong.history-reports.js`

File này chứa lịch sử chấm công, tổng lương tuần, export CSV, thao tác load/xóa lịch sử, phiếu lương và export ảnh.

Di chuyển các phần sau:

- history filters/render:
  - `buildCCHistFilters`
  - `renderCCHistory`
  - `ccHistGoTo`
- tổng lương tuần:
  - `renderCCTLT`
  - `fmtK`
  - `updateTLTSelectedSum`
  - `exportCCTLTCSV`
  - `ccTltGoTo`
- actions on history:
  - `loadCCWeekById`
  - `delCCWeekById`
  - `delCCWorker`
- export CSV:
  - `exportCCWeekCSV`
  - `exportCCHistCSV`
- phiếu lương/export ảnh:
  - `removeVietnameseTones`
  - `xuatPhieuLuong`
  - `exportUngToImage`

Yêu cầu:

- Các hàm render/export/action vẫn phải global.
- Không đổi logic filter lịch sử.
- Không đổi logic phân trang lịch sử.
- Không đổi logic tổng lương tuần grouped by worker/week.
- Không đổi logic selected sum ở tổng lương tuần.
- Không đổi logic xóa tuần/xóa công nhân.
- Không đổi logic load tuần từ lịch sử lên form nhập.
- Không đổi logic export CSV.
- Không đổi logic xuất phiếu lương.
- Không đổi logic `html2canvas` export ảnh.
- Không đổi tên file export nếu code hiện tại đang đặt tên.

Lưu ý phụ thuộc:

- File này dùng helper/core state từ `chamcong.core.js` và form functions từ `chamcong.week-form.js`, nên phải nạp sau cả hai.
- File này dùng `html2canvas`, `fmt`, `fmtISODate`, `parseMoney`, `toast`, `save`, `activeYear`, `activeYears`, `inActiveYear`, `resolveProjectName`, `getProjectById`, `_buildProjFilterOpts`, `renderUngTable`, `buildUngFilters`, `filterAndRenderUng`.
- Không gọi export ảnh ở top-level.

## Các global bắt buộc phải còn hoạt động sau khi tách

Hãy đảm bảo các tên sau vẫn tồn tại ở global scope:

```js
_dedupCC
ccData
ccOffset
ccHistPage
ccTltPage
CC_PG_HIST
CC_PG_TLT
CC_DAY_LABELS
CC_DATE_OFFSETS
round1
_ccDebtColsHidden
toggleCCDebtCols
_applyCCDebtColsVisibility
_calcDebtBefore
isoFromParts
ccSundayISO
ccSaturdayISO
snapToSunday
viShort
weekLabel
iso
ccAllNames
rebuildCCNameList
normalizeAllChamCong
rebuildCCCategories
updateTopFromCC
populateCCCtSel
updateCCSaveBtn
onCCCtSelChange
initCC
ccGoToWeek
ccPrevWeek
ccNextWeek
onCCFromChange
loadCCWeekForm
buildCCTable
addCCWorker
addCCRow
buildCCRow
onCCNameInput
onCCDayKey
onCCWageKey
onCCMoneyKey
calcCCRow
delCCRow
renumberCC
updateCCSumRow
saveCCWeek
clearCCWeek
ccClipboard
copyCCWeek
pasteCCWeek
buildCCHistFilters
renderCCHistory
ccHistGoTo
renderCCTLT
fmtK
updateTLTSelectedSum
exportCCTLTCSV
ccTltGoTo
loadCCWeekById
delCCWeekById
delCCWorker
exportCCWeekCSV
exportCCHistCSV
removeVietnameseTones
xuatPhieuLuong
exportUngToImage
_fmtDate
```

Nếu có global nào khác đang được gọi bởi `index.html`, `main.js`, `tienich.js`, `hoadon.js`, `danhmuc.js`, `nhapxuat.js`, `datatools.js`, `sync.js`, hoặc các modal HTML render từ JS, vẫn phải giữ nguyên.

## Việc cần làm trong `index.html`

Thay dòng:

```html
<script src="chamcong.js"></script>
```

bằng:

```html
<script src="chamcong.core.js"></script>
<script src="chamcong.week-form.js"></script>
<script src="chamcong.history-reports.js"></script>
```

Đặt nhóm này đúng vị trí cũ của `chamcong.js`: sau `datatools.js`, trước `thietbi.js`.

Ví dụ:

```html
<script src="datatools.js"></script>

<script src="chamcong.core.js"></script>
<script src="chamcong.week-form.js"></script>
<script src="chamcong.history-reports.js"></script>

<script src="thietbi.js"></script>
```

Nếu các module khác đã được tách trước đó, giữ nguyên vị trí tương đối: nhóm `chamcong.*.js` vẫn nằm sau nhóm `nhapxuat.*.js`/`datatools.js` và trước `thietbi.js`.

## File `chamcong.js` cũ

Sau khi tách:

- Không để `chamcong.js` tiếp tục được nạp trong `index.html`.
- Có thể giữ file `chamcong.js` trong repo làm bản cũ nếu muốn, nhưng không được nạp song song với các file mới.
- Nếu xóa `chamcong.js`, hãy chắc chắn không còn script nào tham chiếu đến nó.
- Không bắt buộc xóa file cũ nếu người dùng chưa yêu cầu.

## Cập nhật `AI_CONTEXT.md`

Sau khi tách, cập nhật `AI_CONTEXT.md`:

1. Phần “Script Load Order”:
   - Thay `chamcong.js` bằng:
     - `chamcong.core.js`
     - `chamcong.week-form.js`
     - `chamcong.history-reports.js`

2. Phần “Key Functions & Globals”:
   - Ghi rõ:
     - `chamcong.core.js`: `ccData`, dedup/normalize, date/week helpers, worker/category helpers, project selector helpers.
     - `chamcong.week-form.js`: init form tuần, build table, row handlers, save/clear/copy/paste tuần.
     - `chamcong.history-reports.js`: lịch sử chấm công, tổng lương tuần, load/delete history, CSV exports, phiếu lương/export ảnh.

3. Phần “Coding Rules” hoặc ghi chú kiến trúc:
   - Ghi rõ nhóm `chamcong.*.js` vẫn là classic script global scope.
   - Ghi rõ `chamcong.core.js` phải nạp trước `chamcong.week-form.js`, và `chamcong.history-reports.js` nạp sau cùng.
   - Ghi rõ `ccData` là global shared state và được `_reloadGlobals()` gán lại.
   - Ghi rõ `cc_v2` dedup theo logical key tuần/công trình như logic hiện tại.

## Không cần chạy preview

Sau khi tách xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- Không còn `index.html` nạp `chamcong.js`.
- 3 file mới nạp đúng thứ tự.
- Không có duplicate khai báo gây lỗi.
- Không có hàm bị mất khỏi global scope.
- Không có truy cập top-level tới biến của module nạp sau như `DEVICE_ID`.
- Không gọi export ảnh ở top-level.
- Không đổi logic dedup/normalize chấm công.
- Không đổi logic lưu tuần.
- Không đổi logic lịch sử/tổng lương tuần.
- Không đổi logic export CSV/ảnh.

## Checklist người dùng sẽ test thực tế

Sau khi tách, người dùng sẽ tự test:

- Mở tab Chấm Công.
- Chọn tuần trước/sau.
- Chọn công trình.
- Thêm dòng công nhân.
- Autocomplete tên công nhân.
- Nhập ngày công, lương, phụ cấp, hóa đơn mua lẻ, nợ/vay/trừ nợ.
- Kiểm tra tổng dòng và tổng bảng.
- Lưu tuần chấm công.
- Load lại tuần đã lưu.
- Copy tuần.
- Paste tuần.
- Clear form tuần.
- Mở lịch sử chấm công.
- Lọc lịch sử theo công trình/tuần/tên công nhân.
- Load tuần từ lịch sử lên form.
- Xóa tuần chấm công.
- Xóa một công nhân trong tuần nếu UI có.
- Mở Tổng Lương Tuần.
- Lọc tổng lương tuần.
- Chọn dòng để tính tổng đã chọn.
- Export CSV tuần hiện tại.
- Export CSV lịch sử.
- Export CSV tổng lương tuần.
- Xuất phiếu lương.
- Export ảnh tiền ứng/phiếu liên quan nếu UI có nút.
- Kiểm tra hóa đơn/lãi lỗ vẫn nhận chi phí từ chấm công qua `buildInvoices()`.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo những file nào.
- Đã cập nhật `index.html` như thế nào.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có giữ `chamcong.js` cũ hay không.
- Các điểm cần người dùng test thực tế.
```
