```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi tách.

Sau khi tách xong hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Tách xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 4: Tách `nhapxuat.js`

Bạn hãy dựa vào [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) để tách file [nhapxuat.js](nhapxuat.js) thành các file nhỏ hơn.

## Mục tiêu

Tách `nhapxuat.js` thành 3 file:

1. `nhapxuat.parsers.js`
2. `nhapxuat.import.js`
3. `nhapxuat.export.js`

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS đang chạy bằng classic script global scope. Vì vậy khi tách file:

- Không dùng `import/export`.
- Không bọc code trong IIFE/module wrapper nếu làm mất global scope.
- Không đổi tên hàm/biến global.
- Không đổi format file Excel import/export.
- Không đổi tên sheet Excel.
- Không đổi mapping cột.
- Không đổi duplicate detection.
- Không đổi logic apply import.
- Không đổi logic stamp `updatedAt`.
- Không đổi logic `projectId` provisional/resolve.
- Không đổi logic merge danh mục.
- Không đổi logic export CSV/Excel.
- Không đổi UI text nếu không cần.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [nhapxuat.js](nhapxuat.js)
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
- `chamcong.js`
- `thietbi.js`
- `doanhthu.js`
- `main.js`

## Ràng buộc kiến trúc

Hiện tại `nhapxuat.js` được nạp sau `danhmuc.js` và trước `datatools.js`.

Sau khi tách, hãy thay:

```html
<script src="nhapxuat.js"></script>
```

bằng:

```html
<script src="nhapxuat.parsers.js"></script>
<script src="nhapxuat.import.js"></script>
<script src="nhapxuat.export.js"></script>
```

Thứ tự này rất quan trọng:

1. `nhapxuat.parsers.js` phải nạp trước vì chứa toàn bộ helper parse và `parseSheet1` đến `parseSheet9`.
2. `nhapxuat.import.js` nạp sau parser vì dùng parser, duplicate detection và import session.
3. `nhapxuat.export.js` nạp cuối vì chứa export modal, sheet builders và CSV exports.

Không đổi thứ tự các script khác.

Nếu các bước tách trước đã hoàn thành, nhóm `nhapxuat.*.js` phải nằm sau nhóm `danhmuc.*.js`.

## Phân chia nội dung đề xuất

### 1. `nhapxuat.parsers.js`

File này chứa helper parse/normalize và parser từng sheet Excel.

Di chuyển các phần sau từ `nhapxuat.js` sang `nhapxuat.parsers.js`:

- `_normStr`
- `_parseDate`
- `_pNum`
- `_str`
- `_sheetRows`
- `_hasDiacritics`
- `_deduplicateCatNames`
- `_buildCanonMap`
- `_dayOfWeek`
- `_isEmptyRow`
- `_formatCatName`
- `_markDuplicateInBatch`
- `_makeCatLookup`
- `_makeCatLookupWithExtra`
- `_resolveProvisionalProjectIds`
- `_mkErr`
- `_fmtErr`
- parser sheet:
  - `parseSheet1`
  - `parseSheet2`
  - `_addDays`
  - `parseSheet3`
  - `parseSheet4`
  - `parseSheet5`
  - `_DANHMUC_GROUP_MAP`
  - `parseSheet6`
  - `parseSheet7`
  - `parseSheet8`
  - `parseSheet9`

Yêu cầu:

- Không đổi logic parse date.
- Không đổi logic parse tiền/số.
- Không đổi normalize tiếng Việt.
- Không đổi logic phát hiện lỗi từng dòng.
- Không đổi cấu trúc object record trả về từ từng parser.
- Không đổi tên key sheet nội bộ như `invQ`, `invD`, `cc`, `ung`, `tb`, `cats`, `hd`, `thu`, `tp`.
- Không đổi logic provisional project id.
- Không đổi logic lookup mở rộng từ danh mục import.

Lưu ý phụ thuộc:

- File này dùng `XLSX`, `cats`, `projects`, `findProjectIdByName`, `_projTypeByName`, `mkRecord` hoặc các helper có thể nằm ở file khác.
- Không gọi parser ở top-level.
- Parser chỉ chạy khi người dùng import file.

### 2. `nhapxuat.import.js`

File này chứa duplicate detection, import session, preview import và apply import.

Di chuyển các phần sau:

- duplicate detection:
  - `_isDupInvQ`
  - `_isDupInvD`
  - `_isDupUng`
  - `_isDupThu`
  - `_isDupTb`
  - `_isDupTp`
  - `_isDupCC`
- `_detectSheetType`
- biến global:
  - `_importSession`
- `_doImportParse`
- `_markDuplicates`
- `_showImportPreviewNew`
- `_toggleAllImportSheets`
- `_applyImport`
- `_generateImportLog`
- `openImportModal`
- `handleImportFile`

Yêu cầu:

- `_importSession` vẫn phải là global.
- `openImportModal`, `handleImportFile`, `_applyImport`, `_toggleAllImportSheets` vẫn phải global vì có thể được gọi từ HTML/modal.
- Không đổi logic detect sheet.
- Không đổi thứ tự apply import:
  1. DanhMuc trước.
  2. Resolve provisional project ids.
  3. Import invoices/ung/tb/thu/tp/cc/hopdong.
  4. Reload/render/update filters.
  5. Log kết quả.
- Không đổi logic tạo công trình từ sheet DanhMuc.
- Không đổi fallback auto-create projects khi không có sheet DanhMuc nếu code hiện tại đang làm vậy.
- Không đổi logic stamp `updatedAt = Date.now()` khi apply import.
- Không đổi logic `mergeUnique(load(dbKey, []), stamped)`.
- Không đổi logic pending/sync: tiếp tục dùng `save()` để import được push cloud.
- Không đổi logic block pull nếu hiện tại đang có.
- Không đổi logic tự xử lý active year sau import.
- Không đổi nội dung import log nếu không cần.

Lưu ý phụ thuộc:

- File này dùng parser từ `nhapxuat.parsers.js`, nên phải nạp sau parser.
- File này dùng nhiều global data:
  - `invoices`
  - `ungRecords`
  - `tbData`
  - `thuRecords`
  - `thauPhuContracts`
  - `hopDongData`
  - `ccData`
  - `projects`
  - `cats`
  - `cnRoles`
- File này dùng helper:
  - `load`
  - `save`
  - `mergeUnique`
  - `mkRecord`
  - `fmtISODate`
  - `toast`
  - `_reloadGlobals`
  - `afterDataChange`
  - `buildYearSelect`
  - `_refreshAllTabs`
  - `rebuildEntrySelects`
  - `rebuildUngSelects`
  - `dtPopulateSels`
- Giữ các guard `typeof ... === 'function'` hoặc `typeof ... !== 'undefined'` nếu code hiện tại có.
- Không thêm logic top-level mới truy cập biến của module nạp sau.

### 3. `nhapxuat.export.js`

File này chứa modal export, builder các sheet Excel và export CSV.

Di chuyển các phần sau:

- `openExportModal`
- `_buildSheet`
- sheet builders:
  - `buildHoaDonNhanh`
  - `buildHoaDonChiTiet`
  - `buildChamCong`
  - `buildTienUng`
  - `buildThietBi`
  - `buildDanhMuc`
  - `buildHopDongChinh`
  - `buildThuTien`
  - `buildHopDongThauPhu`
  - `buildHuongDan`
- `exportExcel`
- `_doExport`
- `exportEntryCSV`
- `exportAllCSV`
- toolbar wrappers:
  - `toolImportExcel`
  - `toolExportExcel`

Yêu cầu:

- Không đổi tên sheet Excel.
- Không đổi thứ tự sheet export.
- Không đổi header/cột export.
- Không đổi logic lọc record `deletedAt`.
- Không đổi logic phân biệt hóa đơn nhanh và hóa đơn chi tiết.
- Không đổi logic export chấm công.
- Không đổi logic export danh mục và vai trò công nhân.
- Không đổi logic export hợp đồng chính theo `projectId`/fallback tên công trình.
- Không đổi alias `_doExport()` nếu đang có chỗ gọi cũ.
- `toolImportExcel` và `toolExportExcel` vẫn phải global.

Lưu ý phụ thuộc:

- File này dùng `XLSX`.
- File này dùng data từ nhiều module, kể cả `doanhthu.js`.
- Hiện `nhapxuat.js` được nạp trước `doanhthu.js`, nhưng hàm export chỉ chạy sau khi app nạp đủ. Vì vậy không gọi export ở top-level.
- Nếu cần kiểm tra `hopDongData`, `thuRecords`, `thauPhuContracts`, hãy giữ guard hoặc giả định như code hiện tại.

## Các global bắt buộc phải còn hoạt động sau khi tách

Hãy đảm bảo các tên sau vẫn tồn tại ở global scope:

```js
_normStr
_parseDate
_pNum
_str
_sheetRows
_makeCatLookup
_makeCatLookupWithExtra
_resolveProvisionalProjectIds
_mkErr
_fmtErr
parseSheet1
parseSheet2
parseSheet3
parseSheet4
parseSheet5
parseSheet6
parseSheet7
parseSheet8
parseSheet9
_isDupInvQ
_isDupInvD
_isDupUng
_isDupThu
_isDupTb
_isDupTp
_isDupCC
_detectSheetType
_importSession
_doImportParse
_markDuplicates
_showImportPreviewNew
_toggleAllImportSheets
_applyImport
_generateImportLog
openImportModal
handleImportFile
openExportModal
_buildSheet
buildHoaDonNhanh
buildHoaDonChiTiet
buildChamCong
buildTienUng
buildThietBi
buildDanhMuc
buildHopDongChinh
buildThuTien
buildHopDongThauPhu
buildHuongDan
exportExcel
_doExport
exportEntryCSV
exportAllCSV
toolImportExcel
toolExportExcel
```

Nếu có global nào khác đang được gọi bởi `index.html`, `main.js`, `datatools.js`, hoặc các modal HTML render từ JS, vẫn phải giữ nguyên.

## Việc cần làm trong `index.html`

Thay dòng:

```html
<script src="nhapxuat.js"></script>
```

bằng:

```html
<script src="nhapxuat.parsers.js"></script>
<script src="nhapxuat.import.js"></script>
<script src="nhapxuat.export.js"></script>
```

Đặt nhóm này đúng vị trí cũ của `nhapxuat.js`: sau nhóm `danhmuc` và trước `datatools.js`.

Ví dụ nếu các bước tách trước đã hoàn thành:

```html
<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
<script src="danhmuc.tools.js"></script>

<script src="nhapxuat.parsers.js"></script>
<script src="nhapxuat.import.js"></script>
<script src="nhapxuat.export.js"></script>

<script src="datatools.js"></script>
```

## File `nhapxuat.js` cũ

Sau khi tách:

- Không để `nhapxuat.js` tiếp tục được nạp trong `index.html`.
- Có thể giữ file `nhapxuat.js` trong repo làm bản cũ nếu muốn, nhưng không được nạp song song với các file mới.
- Nếu xóa `nhapxuat.js`, hãy chắc chắn không còn script nào tham chiếu đến nó.
- Không bắt buộc xóa file cũ nếu người dùng chưa yêu cầu.

## Cập nhật `AI_CONTEXT.md`

Sau khi tách, cập nhật `AI_CONTEXT.md`:

1. Phần “Script Load Order”:
   - Thay `nhapxuat.js` bằng:
     - `nhapxuat.parsers.js`
     - `nhapxuat.import.js`
     - `nhapxuat.export.js`

2. Phần “Key Functions & Globals”:
   - Ghi rõ:
     - `nhapxuat.parsers.js`: helper parse/normalize, catalog lookup, parser sheet 1-9.
     - `nhapxuat.import.js`: import session, detect sheet, preview, apply import, import log.
     - `nhapxuat.export.js`: export modal, Excel sheet builders, CSV exports, toolbar wrappers.

3. Phần “Coding Rules” hoặc ghi chú kiến trúc:
   - Ghi rõ nhóm `nhapxuat.*.js` vẫn là classic script global scope.
   - Ghi rõ `nhapxuat.parsers.js` phải nạp trước `nhapxuat.import.js`.
   - Ghi rõ `nhapxuat.export.js` không được gọi ở top-level vì một số data doanh thu nạp sau.
   - Ghi rõ import phải tiếp tục dùng `save()` để IndexedDB, cache, pending sync và cloud sync nhất quán.

## Không cần chạy preview

Sau khi tách xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- Không còn `index.html` nạp `nhapxuat.js`.
- 3 file mới nạp đúng thứ tự.
- Không có duplicate khai báo gây lỗi.
- Không có hàm bị mất khỏi global scope.
- Không có gọi export/import ở top-level.
- Parser không bị mất helper.
- Import preview vẫn gọi đúng parser.
- Apply import vẫn gọi đúng `save()`.
- Export Excel vẫn build đủ sheet.
- Toolbar wrappers vẫn gọi đúng modal.

## Checklist người dùng sẽ test thực tế

Sau khi tách, người dùng sẽ tự test:

- Mở modal Import Excel.
- Chọn file `.xlsx`.
- Kiểm tra detect đúng các sheet:
  - Hóa Đơn Nhanh
  - Hóa Đơn Chi Tiết
  - Chấm Công
  - Tiền Ứng
  - Thiết Bị
  - Danh Mục
  - Hợp Đồng Chính
  - Thu Tiền
  - Hợp Đồng Thầu Phụ
- Kiểm tra preview lỗi/trùng.
- Tick/bỏ tick sheet import.
- Apply import.
- Kiểm tra dữ liệu sau import xuất hiện ở các tab liên quan.
- Kiểm tra công trình mới từ DanhMuc/import được tạo đúng.
- Kiểm tra `projectId` được resolve đúng.
- Mở modal Export Excel.
- Export file Excel đủ 10 sheet.
- Export CSV hóa đơn hiện tại.
- Export CSV toàn bộ.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo những file nào.
- Đã cập nhật `index.html` như thế nào.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có giữ `nhapxuat.js` cũ hay không.
- Các điểm cần người dùng test thực tế.
```
