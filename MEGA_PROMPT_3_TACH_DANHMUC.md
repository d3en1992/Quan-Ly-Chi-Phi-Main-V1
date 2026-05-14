```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi tách.

Sau khi tách xong hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Tách xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 3: Tách `danhmuc.js`

Bạn hãy dựa vào [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) để tách file [danhmuc.js](danhmuc.js) thành các file nhỏ hơn.

## Mục tiêu

Tách `danhmuc.js` thành 2-3 file:

1. `danhmuc.categories.js`
2. `danhmuc.ung.js`
3. `danhmuc.tools.js`

Nếu thấy `danhmuc.tools.js` quá nhỏ, có thể gộp các hàm tool vào `danhmuc.categories.js`. Tuy nhiên phương án ưu tiên là vẫn tạo đủ 3 file để trách nhiệm rõ ràng.

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS đang chạy bằng classic script global scope. Vì vậy khi tách file:

- Không dùng `import/export`.
- Không bọc code trong IIFE/module wrapper nếu làm mất global scope.
- Không đổi tên hàm/biến global.
- Không đổi data model.
- Không đổi logic `load/save`.
- Không đổi logic danh mục soft-delete/category sync.
- Không đổi logic tiền ứng.
- Không đổi logic project dropdown.
- Không đổi UI text nếu không cần.
- Không đổi id/class DOM nếu không cần.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [danhmuc.js](danhmuc.js)
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
- `tienich.js`
- `hoadon.js`
- `nhapxuat.js`
- `doanhthu.js`
- `chamcong.js`
- `thietbi.js`
- `main.js`

## Ràng buộc kiến trúc

Hiện tại `danhmuc.js` được nạp sau `hoadon.js` và trước `nhapxuat.js`.

Sau khi tách, hãy thay:

```html
<script src="danhmuc.js"></script>
```

bằng:

```html
<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
<script src="danhmuc.tools.js"></script>
```

Thứ tự này rất quan trọng:

1. `danhmuc.categories.js` phải nạp trước vì chứa helper danh mục, normalize, render settings, `rebuildEntrySelects`.
2. `danhmuc.ung.js` nạp sau vì tiền ứng dùng `cats`, project helper, formatter và nhiều helper từ module trước.
3. `danhmuc.tools.js` nạp cuối vì chỉ chứa wrapper backup/restore nhỏ.

Không đổi thứ tự các script khác.

Nếu quyết định gộp `danhmuc.tools.js` vào `danhmuc.categories.js`, thì `index.html` chỉ nạp:

```html
<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
```

Nhưng hãy cập nhật `AI_CONTEXT.md` đúng theo phương án thực tế đã làm.

## Phân chia nội dung đề xuất

### 1. `danhmuc.categories.js`

File này chứa danh mục/cấu hình và chuẩn hóa dữ liệu liên quan danh mục.

Di chuyển các phần sau từ `danhmuc.js` sang `danhmuc.categories.js`:

- `renderCtPage`
- `showCtModal`
- `closeModal`
- `normalizeName`
- `normalizeKey`
- `_isDmItemUsedInYear`
- `_isDmItemUsedAnytime`
- `scanAndFixAllDataFormats`
- `_catNamesMigrated`
- `_migrateCatNamesFormat`
- `renderSettings`
- `_dmFilterCard`
- `renderCTItem`
- `renderItem`
- `renderCNItem`
- `updateCNRole`
- `renderTbTenItem`
- `syncCNRoles`
- `startEdit`
- `cancelEdit`
- `finishEdit`
- `addItem`
- `isItemInUse`
- `delItem`
- `_dedupCatArr`
- `rebuildEntrySelects`

Yêu cầu:

- Các hàm danh mục vẫn phải nằm ở global scope vì `main.js`, HTML inline và các module khác có thể gọi.
- Không đổi logic khóa danh mục:
  - `cat_ct`
  - `cat_loai`
  - `cat_ncc`
  - `cat_nguoi`
  - `cat_tp`
  - `cat_cn`
  - `cat_tbteb`
  - `cat_cn_roles`
  - `cat_items_v1`
- Không đổi logic `saveCats(catId)`.
- Không đổi logic đồng bộ vai trò công nhân vào `ccData`.
- Không đổi logic kiểm tra danh mục đang được dùng.
- Không đổi logic chuẩn hóa tên cũ trong `scanAndFixAllDataFormats`.
- Không đổi hành vi đặc biệt: công trình không được quản lý trực tiếp từ Danh Mục mà phải qua tab Công Trình.

Lưu ý phụ thuộc:

- File này dùng `cats`, `cnRoles`, `save`, `load`, `saveCats`, `getInvoicesCached`, `inActiveYear`, `activeYear`, `toast`, `clearInvoiceCache`, `invoices`, `ungRecords`, `ccData`, `tbData`, `thauPhuContracts`, `thuRecords`, `hopDongData`.
- Một số biến như `ungRecords`, `ccData`, `tbData`, `thuRecords`, `hopDongData` có thể chưa tồn tại ở thời điểm parse tùy thứ tự script, nên phải giữ các guard `typeof ... !== 'undefined'` như code hiện tại.
- Không thêm gọi hàm top-level mới khiến các biến này bị truy cập quá sớm.

### 2. `danhmuc.ung.js`

File này chứa toàn bộ nghiệp vụ Tiền Ứng.

Di chuyển các phần sau:

- biến global tiền ứng:
  - `ungRecords`
  - `filteredUng`
  - `ungPage`
  - `UNG_TP_PG`
  - `ungTpPage`
  - `_editingUngId`
- `_normalizeUngDeletedAt`
- `_normalizeUngProjectIds`
- `initUngTable`
- `initUngTableIfEmpty`
- `addUngRows`
- `clearUngRows`
- `resetUngForm`
- `onUngLoaiChange`
- `_ungTpOptions`
- `addUngRow`
- `delUngRow`
- `renumberUng`
- `calcUngSummary`
- `clearUngTable`
- `saveAllUngRows`
- `editUngRecord`
- `buildUngFilters`
- `filterAndRenderUng`
- `_ungSectionHTML`
- `renderUngTable`
- `goUngTpTo`
- `delUngRecord`
- `rebuildUngSelects`
- `exportUngEntryCSV`
- `exportUngAllCSV`

Yêu cầu:

- `ungRecords` vẫn phải là global `let ungRecords = load('ung_v1', [])`, vì `core._reloadGlobals()`, `nhapxuat.js`, `projects.js`, `doanhthu.js`, `datatools.js` có thể đọc/gán lại.
- Không đổi logic soft delete `deletedAt`.
- Không đổi logic normalize `cancelled` cũ sang `deletedAt`.
- Không đổi logic migrate `projectId`.
- Không đổi logic chặn ghi tiền ứng vào công trình đã quyết toán.
- Không đổi logic phân loại:
  - `thauphu`
  - `nhacungcap`
  - `congnhan`
- Không đổi logic lưu bằng `mkRecord` / cập nhật record đang edit.
- Không đổi logic render hai nhóm bảng tiền ứng nếu hiện tại đang có.
- Không đổi logic export CSV tiền ứng.

Lưu ý phụ thuộc:

- File này dùng `cats`, `projects`, `_buildProjOpts`, `_readPidFromSel`, `_checkProjectClosed`, `findProjectIdByName`, `resolveProjectName`, `fmt`, `fmtISODate`, `parseMoney`, `toast`, `save`, `mkRecord`, `DEVICE_ID`, `_refreshAllTabs`, `renumberRows`, `activeYear`, `inActiveYear`.
- `DEVICE_ID` thường nằm trong `sync.js`, được nạp sau `danhmuc.js`. Nếu code hiện tại có dùng `DEVICE_ID` trong function body, giữ nguyên vì chỉ chạy sau khi app nạp đủ. Không dùng `DEVICE_ID` ở top-level.
- Không tạo logic top-level mới gọi `DEVICE_ID`.

### 3. `danhmuc.tools.js`

File này chứa wrapper tiện ích nhỏ liên quan backup/restore.

Di chuyển:

- `toolBackupNow`
- `toolRestoreBackup`

Yêu cầu:

- Hai hàm này vẫn phải global.
- Không đổi logic gọi `_snapshotNow`, `renderBackupList`, `openBinModal` hoặc modal liên quan nếu đang có.
- Nếu gộp vào `danhmuc.categories.js`, hãy ghi rõ trong báo cáo sau khi làm và cập nhật `AI_CONTEXT.md` theo thực tế.

## Các global bắt buộc phải còn hoạt động sau khi tách

Hãy đảm bảo các tên sau vẫn tồn tại ở global scope:

```js
renderCtPage
showCtModal
closeModal
normalizeName
normalizeKey
scanAndFixAllDataFormats
renderSettings
_dmFilterCard
renderCTItem
renderItem
renderCNItem
updateCNRole
renderTbTenItem
syncCNRoles
startEdit
cancelEdit
finishEdit
addItem
isItemInUse
delItem
rebuildEntrySelects
ungRecords
filteredUng
ungPage
UNG_TP_PG
ungTpPage
_editingUngId
initUngTable
initUngTableIfEmpty
addUngRows
clearUngRows
resetUngForm
onUngLoaiChange
addUngRow
delUngRow
renumberUng
calcUngSummary
clearUngTable
saveAllUngRows
editUngRecord
buildUngFilters
filterAndRenderUng
renderUngTable
goUngTpTo
delUngRecord
rebuildUngSelects
exportUngEntryCSV
exportUngAllCSV
toolBackupNow
toolRestoreBackup
```

Nếu có global nào khác đang được gọi bởi `index.html`, `main.js`, `hoadon.js`, `nhapxuat.js`, `datatools.js`, `chamcong.js`, `thietbi.js`, `doanhthu.js`, vẫn phải giữ nguyên.

## Việc cần làm trong `index.html`

Thay dòng:

```html
<script src="danhmuc.js"></script>
```

bằng:

```html
<script src="danhmuc.categories.js"></script>
<script src="danhmuc.ung.js"></script>
<script src="danhmuc.tools.js"></script>
```

Đặt nhóm này đúng vị trí cũ của `danhmuc.js`: sau `hoadon.js`, trước nhóm `nhapxuat`.

Ví dụ nếu các bước tách trước đã hoàn thành:

```html
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

<script src="nhapxuat.js"></script>
```

Nếu `nhapxuat.js` đã được tách ở thời điểm bạn làm, hãy giữ nhóm `danhmuc.*.js` trước nhóm `nhapxuat.*.js`.

## File `danhmuc.js` cũ

Sau khi tách:

- Không để `danhmuc.js` tiếp tục được nạp trong `index.html`.
- Có thể giữ file `danhmuc.js` trong repo làm bản cũ nếu muốn, nhưng không được nạp song song với các file mới.
- Nếu xóa `danhmuc.js`, hãy chắc chắn không còn script nào tham chiếu đến nó.
- Không bắt buộc xóa file cũ nếu người dùng chưa yêu cầu.

## Cập nhật `AI_CONTEXT.md`

Sau khi tách, cập nhật `AI_CONTEXT.md`:

1. Phần “Script Load Order”:
   - Thay `danhmuc.js` bằng:
     - `danhmuc.categories.js`
     - `danhmuc.ung.js`
     - `danhmuc.tools.js`
   - Nếu bạn gộp tools, chỉ ghi các file thực tế.

2. Phần “Key Functions & Globals”:
   - Ghi rõ:
     - `danhmuc.categories.js`: danh mục, chuẩn hóa tên, render settings, vai trò công nhân, rebuild dropdown.
     - `danhmuc.ung.js`: tiền ứng, form nhập, lịch sử/lọc, export CSV, `ungRecords`.
     - `danhmuc.tools.js`: wrapper backup/restore nếu có.

3. Phần “Coding Rules” hoặc ghi chú kiến trúc:
   - Ghi rõ nhóm `danhmuc.*.js` vẫn là classic script global scope.
   - Ghi rõ `danhmuc.categories.js` phải nạp trước `danhmuc.ung.js`.
   - Ghi rõ `ungRecords` là global shared state và được `_reloadGlobals()` gán lại.
   - Ghi rõ `nhapxuat.*.js` phải nạp sau `danhmuc.ung.js` vì import/export dùng `ungRecords`.

## Không cần chạy preview

Sau khi tách xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- Không còn `index.html` nạp `danhmuc.js`.
- Các file mới nạp đúng thứ tự.
- Không có duplicate khai báo gây lỗi.
- Không có hàm bị mất khỏi global scope.
- Không có truy cập top-level tới biến của module nạp sau như `DEVICE_ID`.
- Không đổi logic danh mục.
- Không đổi logic tiền ứng.
- Không đổi logic backup wrapper.
- Không đổi logic dropdown và projectId trong tiền ứng.

## Checklist người dùng sẽ test thực tế

Sau khi tách, người dùng sẽ tự test:

- Mở tab Danh Mục / Cài Đặt.
- Thêm/sửa/xóa loại chi phí.
- Thêm/sửa/xóa nhà cung cấp.
- Thêm/sửa/xóa người thực hiện.
- Thêm/sửa/xóa thầu phụ.
- Thêm/sửa/xóa công nhân và đổi vai trò C/T/P.
- Thêm/sửa/xóa tên thiết bị.
- Kiểm tra công trình vẫn quản lý qua tab Công Trình, không sửa trực tiếp ở Danh Mục.
- Kiểm tra dropdown Hóa Đơn cập nhật sau khi sửa danh mục.
- Mở tab Tiền Ứng.
- Thêm tiền ứng thầu phụ.
- Thêm tiền ứng nhà cung cấp.
- Thêm tiền ứng công nhân.
- Sửa bản ghi tiền ứng.
- Xóa bản ghi tiền ứng.
- Lọc bảng tiền ứng theo năm/công trình/loại nếu có.
- Export CSV tiền ứng nếu UI có nút.
- Dùng backup/restore wrapper nếu có nút tương ứng.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo những file nào.
- Đã cập nhật `index.html` như thế nào.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có giữ `danhmuc.js` cũ hay không.
- Nếu gộp `danhmuc.tools.js`, hãy nói rõ.
- Các điểm cần người dùng test thực tế.
```
