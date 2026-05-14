```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi tách.

Sau khi tách xong hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, sơ đồ thư mục, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Tách xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 8: Tách `hoadon.js`, xóa file cũ và đưa vào thư mục phù hợp

Bạn hãy dựa vào [AI_CONTEXT.md](AI_CONTEXT.md), [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) và cấu trúc thư mục hiện tại để tách file hóa đơn.

## Mục tiêu

File hóa đơn hiện tại đang nằm ở:

```text
js/legacy/hoadon.js
```

Hãy tách file này thành 3 file mới trong thư mục module:

```text
js/modules/hoadon/
  hoadon.quick-entry.js
  hoadon.detail-entry.js
  hoadon.list-trash.js
```

Sau khi tách xong:

1. Cập nhật `index.html` để nạp 3 file mới.
2. Không nạp `js/legacy/hoadon.js` nữa.
3. Xóa file cũ `js/legacy/hoadon.js` nếu không còn tham chiếu runtime.
4. Cập nhật [AI_CONTEXT.md](AI_CONTEXT.md) theo cấu trúc mới.

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS vẫn chạy bằng classic script global scope. Vì vậy khi tách file:

- Không dùng `import/export`.
- Không bọc code trong IIFE/module wrapper nếu làm mất global scope.
- Không đổi tên hàm/biến global.
- Không đổi data model `inv_v3`.
- Không đổi data model `trash_v1`.
- Không đổi logic `load/save`.
- Không đổi logic hóa đơn nhanh.
- Không đổi logic hóa đơn chi tiết.
- Không đổi logic sửa/xóa/khôi phục hóa đơn.
- Không đổi logic thùng rác.
- Không đổi logic filter/render danh sách hóa đơn.
- Không đổi id/class DOM nếu không cần.
- Không đổi UI text nếu không cần.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [index.html](index.html)
- [js/legacy/hoadon.js](js/legacy/hoadon.js)

Nên đọc thêm nếu cần:

- `js/core/core.storage.js`
- `js/core/core.state-backup.js`
- `js/core/core.cloud-cats-ui.js`
- `js/modules/projects/projects.model.js`
- `js/modules/projects/projects.migration-selects.js`
- `js/modules/projects/projects.ui.js`
- `js/legacy/tienich.js`
- `js/modules/danhmuc/danhmuc.categories.js`
- `js/modules/danhmuc/danhmuc.ung.js`
- `js/modules/nhapxuat/nhapxuat.import.js`
- `js/modules/nhapxuat/nhapxuat.export.js`
- `js/app/main.js`

## Ràng buộc kiến trúc

Hiện tại `index.html` đang nạp:

```html
<script src="js/legacy/tienich.js"></script>
<script src="js/legacy/hoadon.js"></script>
```

Sau khi tách, hãy thay:

```html
<script src="js/legacy/hoadon.js"></script>
```

bằng:

```html
<script src="js/modules/hoadon/hoadon.quick-entry.js"></script>
<script src="js/modules/hoadon/hoadon.detail-entry.js"></script>
<script src="js/modules/hoadon/hoadon.list-trash.js"></script>
```

Thứ tự này rất quan trọng:

1. `hoadon.quick-entry.js` nạp trước vì chứa nhập hóa đơn nhanh và helper dòng cơ bản.
2. `hoadon.detail-entry.js` nạp sau vì chứa hóa đơn chi tiết, dùng một số helper/reference từ phần hóa đơn.
3. `hoadon.list-trash.js` nạp cuối vì chứa filter/render danh sách, sửa/xóa, thùng rác, hóa đơn trong ngày.

Nhóm `hoadon.*.js` vẫn phải nạp sau `js/legacy/tienich.js` và trước nhóm `danhmuc.*.js`.

Ví dụ:

```html
<script src="js/legacy/tienich.js"></script>

<script src="js/modules/hoadon/hoadon.quick-entry.js"></script>
<script src="js/modules/hoadon/hoadon.detail-entry.js"></script>
<script src="js/modules/hoadon/hoadon.list-trash.js"></script>

<script src="js/modules/danhmuc/danhmuc.categories.js"></script>
<script src="js/modules/danhmuc/danhmuc.ung.js"></script>
<script src="js/modules/danhmuc/danhmuc.tools.js"></script>
```

## Tạo thư mục nếu chưa có

Nếu chưa tồn tại, hãy tạo thư mục:

```text
js/modules/hoadon/
```

Không tạo thư mục có dấu tiếng Việt hoặc khoảng trắng.

## Phân chia nội dung đề xuất

### 1. `hoadon.quick-entry.js`

File này chứa phần nhập hóa đơn nhanh và helper lưu nhanh.

Di chuyển các phần sau từ `js/legacy/hoadon.js` sang `js/modules/hoadon/hoadon.quick-entry.js`:

- `initTable`
- `addRows`
- `refreshEntryDropdowns`
- `addRow`
- `delRow`
- `renumber`
- `calcSummary`
- `clearTable`
- `saveAllRows`
- duplicate modal/import save support:
  - `_showDupModal`
  - `closeDupModal`
  - `forceSaveAll`
- invoice reference/save helpers:
  - `_ensureInvRef`
  - `_doSaveRows`
- row money/data helpers nếu dùng cho quick entry:
  - `calcRowMoney`
  - `getRowData`

Yêu cầu:

- Các hàm trên vẫn phải ở global scope vì `index.html`, `tienich.js`, modal duplicate hoặc inline event có thể gọi trực tiếp.
- Không đổi logic thêm dòng.
- Không đổi logic dropdown công trình/loại/NCC/người thực hiện.
- Không đổi logic tính số lượng/đơn giá/chiết khấu/thành tiền.
- Không đổi logic duplicate check.
- Không đổi logic force save.
- Không đổi logic `projectId`/`congtrinh` trong `_ensureInvRef`.
- Không đổi logic lưu vào `invoices` và `save('inv_v3', invoices)`.
- Không đổi logic `mkRecord`, `updatedAt`, `deviceId` nếu đang có.
- Không đổi logic render lại sau khi lưu.

Lưu ý phụ thuộc:

- File này dùng `cats`, `projects`, `_buildProjOpts`, `_readPidFromSel`, `_checkProjectClosed`, `findProjectIdByName`, `resolveProjectName`, `load`, `save`, `mkRecord`, `toast`, `fmt`, `parseMoney`, `renumberRows`, `clearInvoiceCache`, `buildFilters`, `filterAndRender`, `renderTodayInvoices`, `updateTop`.
- Một số hàm như `buildFilters`, `filterAndRender`, `renderTodayInvoices` nằm trong file thứ ba và chỉ được gọi khi user thao tác sau khi tất cả script đã nạp. Không gọi chúng ở top-level.
- `DEVICE_ID` nếu có dùng chỉ được dùng trong function body, không dùng ở top-level.

### 2. `hoadon.detail-entry.js`

File này chứa phần hóa đơn chi tiết nhiều dòng vật tư/nội dung.

Di chuyển các phần sau:

- subtab/detail init:
  - `goInnerSub`
  - `_initDetailFormSelects`
- detail row:
  - `renderDetailRowHTML`
  - `addDetailRow`
  - `delDetailRow`
  - `calcDetailRow`
  - `calcDetailTotals`
  - `generateDetailNd`
- save/reset/edit detail:
  - `saveDetailInvoice`
  - `clearDetailForm`
  - `_setSelectFlexible`
  - `openDetailEdit`
- detail row parser:
  - `getDetailRows`

Yêu cầu:

- Các hàm detail vẫn phải global.
- Không đổi logic subtab Hôm nay / Tất cả / Đã xóa nếu `goInnerSub` đang điều khiển.
- Không đổi HTML row detail.
- Không đổi logic tính tiền từng dòng chi tiết.
- Không đổi logic tổng hóa đơn chi tiết.
- Không đổi logic tự generate nội dung.
- Không đổi logic lưu hóa đơn chi tiết vào `invoices`.
- Không đổi logic nhận biết invoice detail qua `source === 'detail'` hoặc `items`.
- Không đổi logic sửa hóa đơn chi tiết bằng `openDetailEdit`.
- Không đổi logic set select linh hoạt `_setSelectFlexible`.

Lưu ý phụ thuộc:

- File này dùng helper/data từ quick entry và list/render:
  - `_ensureInvRef`
  - `invoices`
  - `save`
  - `mkRecord`
  - `toast`
  - `parseMoney`
  - `fmt`
  - `renderTodayInvoices`
  - `buildFilters`
  - `filterAndRender`
  - `updateTop`
- File này phải nạp sau `hoadon.quick-entry.js`.

### 3. `hoadon.list-trash.js`

File này chứa filter/render danh sách hóa đơn, sửa/xóa hóa đơn, thùng rác và hóa đơn trong ngày.

Di chuyển các phần sau:

- view/filter:
  - `switchTatCaView`
  - `buildFilters`
  - `filterAndRender`
  - `renderTable`
  - `goTo`
- invoice actions:
  - `delInvoice`
  - `editCCInvoice`
  - `openEntryEdit`
  - `_resolveInvSource`
  - `editManualInvoice`
- trash state/actions:
  - `trash`
  - `trashAdd`
  - `trashRestore`
  - `trashDeletePermanent`
  - `trashClearAll`
  - `renderTrash`
- today/list helpers:
  - `renderTodayInvoices`
  - `refreshHoadonCtDropdowns`

Yêu cầu:

- `trash` vẫn phải là global `let trash = load('trash_v1', [])`, vì `core._reloadGlobals()` có thể gán lại.
- Các hàm render/action vẫn phải global vì `index.html`, `main.js`, `projects.ui.js`, `nhapxuat.import.js`, `core.cloud-cats-ui.js` có thể gọi trực tiếp.
- Không đổi logic filter theo công trình/loại/NCC/tháng/search.
- Không đổi logic phân trang `curPage`.
- Không đổi logic render table.
- Không đổi logic sửa hóa đơn manual/detail/CC.
- Không đổi logic xóa mềm hóa đơn vào thùng rác.
- Không đổi logic khôi phục từ thùng rác.
- Không đổi logic xóa vĩnh viễn.
- Không đổi logic render hóa đơn trong ngày.
- Không đổi logic refresh dropdown công trình hóa đơn.

Lưu ý phụ thuộc:

- File này dùng `invoices`, `filteredInvs`, `curPage`, `PG`, `trash`, `load`, `save`, `getInvoicesCached`, `buildInvoices`, `clearInvoiceCache`, `resolveProjectName`, `fmt`, `fmtISODate`, `toast`, `updateTop`, `activeYear`, `inActiveYear`, `_refreshAllTabs`, `openDetailEdit`.
- File này phải nạp sau `hoadon.quick-entry.js` và `hoadon.detail-entry.js`.

## Các global bắt buộc phải còn hoạt động sau khi tách

Hãy đảm bảo các tên sau vẫn tồn tại ở global scope:

```js
initTable
addRows
refreshEntryDropdowns
addRow
delRow
renumber
calcSummary
clearTable
saveAllRows
_showDupModal
closeDupModal
forceSaveAll
_ensureInvRef
_doSaveRows
goInnerSub
_initDetailFormSelects
renderDetailRowHTML
addDetailRow
delDetailRow
calcDetailRow
calcDetailTotals
generateDetailNd
saveDetailInvoice
clearDetailForm
_setSelectFlexible
openDetailEdit
switchTatCaView
buildFilters
filterAndRender
renderTable
goTo
delInvoice
editCCInvoice
openEntryEdit
_resolveInvSource
editManualInvoice
trash
trashAdd
trashRestore
trashDeletePermanent
trashClearAll
renderTrash
renderTodayInvoices
refreshHoadonCtDropdowns
calcRowMoney
getDetailRows
getRowData
```

Nếu có global nào khác đang được gọi bởi `index.html`, `js/app/main.js`, `js/legacy/tienich.js`, `js/modules/projects/projects.ui.js`, `js/modules/nhapxuat/nhapxuat.import.js`, hoặc các modal HTML render từ JS, vẫn phải giữ nguyên.

## Việc cần làm trong `index.html`

Thay dòng:

```html
<script src="js/legacy/hoadon.js"></script>
```

bằng:

```html
<script src="js/modules/hoadon/hoadon.quick-entry.js"></script>
<script src="js/modules/hoadon/hoadon.detail-entry.js"></script>
<script src="js/modules/hoadon/hoadon.list-trash.js"></script>
```

Đặt nhóm này đúng vị trí cũ của `hoadon.js`: sau `js/legacy/tienich.js`, trước nhóm `danhmuc`.

## Xóa file cũ

Sau khi tách và cập nhật `index.html`, hãy kiểm tra toàn bộ project:

- Không còn `<script src="js/legacy/hoadon.js">`.
- Không còn tham chiếu runtime nào đến đường dẫn `js/legacy/hoadon.js`.
- Các hàm global từ `hoadon.js` cũ vẫn tồn tại trong 3 file mới.

Nếu đủ điều kiện, hãy xóa:

```text
js/legacy/hoadon.js
```

Không xóa nếu còn tham chiếu runtime. Nếu không xóa được vì còn tham chiếu, hãy báo rõ cần sửa tham chiếu nào.

## Cập nhật `AI_CONTEXT.md`

Sau khi tách, cập nhật `AI_CONTEXT.md`:

### 1. Script Load Order

Thay:

```text
js/legacy/hoadon.js
```

bằng:

```text
js/modules/hoadon/hoadon.quick-entry.js
js/modules/hoadon/hoadon.detail-entry.js
js/modules/hoadon/hoadon.list-trash.js
```

Đảm bảo thứ tự vẫn là:

```text
tienich -> hoadon.quick-entry -> hoadon.detail-entry -> hoadon.list-trash -> danhmuc
```

### 2. Sơ đồ thư mục

Thêm thư mục:

```text
js/modules/hoadon/
```

và các file:

```text
hoadon.quick-entry.js
hoadon.detail-entry.js
hoadon.list-trash.js
```

### 3. Key Functions & Globals

Cập nhật bảng module/global:

- `js/modules/hoadon/hoadon.quick-entry.js`
  - Hóa đơn nhanh, dòng nhập nhanh, duplicate modal, `_ensureInvRef`, `_doSaveRows`.
  - Globals chính: `initTable`, `addRow`, `saveAllRows`, `forceSaveAll`, `refreshEntryDropdowns`.

- `js/modules/hoadon/hoadon.detail-entry.js`
  - Hóa đơn chi tiết, dòng item, tổng chi tiết, lưu/sửa hóa đơn chi tiết.
  - Globals chính: `addDetailRow`, `saveDetailInvoice`, `openDetailEdit`, `getDetailRows`.

- `js/modules/hoadon/hoadon.list-trash.js`
  - Filter/render danh sách hóa đơn, sửa/xóa hóa đơn, thùng rác, hóa đơn trong ngày.
  - Globals chính: `buildFilters`, `filterAndRender`, `renderTable`, `renderTrash`, `renderTodayInvoices`, `trash`.

### 4. Coding Rules

Ghi rõ:

- Nhóm `hoadon.*.js` vẫn là classic script global scope.
- `hoadon.quick-entry.js` nạp trước `hoadon.detail-entry.js`.
- `hoadon.list-trash.js` nạp sau cùng.
- `trash` là global shared state, được `_reloadGlobals()` gán lại.
- File cũ `js/legacy/hoadon.js` đã được xóa và không được nạp lại.

## Không cần chạy preview

Sau khi tách xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- `index.html` nạp đúng 3 file hóa đơn mới.
- `index.html` không còn nạp `js/legacy/hoadon.js`.
- File cũ `js/legacy/hoadon.js` đã xóa nếu không còn tham chiếu.
- Không có duplicate khai báo gây lỗi.
- Không có hàm bị mất khỏi global scope.
- Không gọi hàm ở top-level khi phụ thuộc file nạp sau.
- Không đổi logic hóa đơn nhanh.
- Không đổi logic hóa đơn chi tiết.
- Không đổi logic danh sách/thùng rác.
- Không đổi logic `buildInvoices()` ở `tienich.js`; module hóa đơn chỉ tiếp tục lưu `inv_v3` như cũ.

## Checklist người dùng sẽ test thực tế

Sau khi tách, người dùng sẽ tự test:

- Mở tab nhập hóa đơn.
- Thêm dòng hóa đơn nhanh.
- Lưu hóa đơn nhanh.
- Kiểm tra duplicate modal nếu nhập trùng.
- Force save nếu cần.
- Xóa dòng nhập nhanh.
- Kiểm tra tổng tiền nhập nhanh.
- Mở hóa đơn chi tiết.
- Thêm/xóa dòng chi tiết.
- Kiểm tra tổng hóa đơn chi tiết.
- Lưu hóa đơn chi tiết.
- Sửa hóa đơn nhanh.
- Sửa hóa đơn chi tiết.
- Mở tab Tất cả chi phí/hóa đơn.
- Lọc theo công trình/loại/NCC/tháng/search.
- Phân trang danh sách.
- Xóa hóa đơn.
- Mở thùng rác.
- Khôi phục hóa đơn.
- Xóa vĩnh viễn một hóa đơn.
- Xóa vĩnh viễn tất cả nếu có dữ liệu test.
- Kiểm tra bảng hóa đơn trong ngày.
- Kiểm tra import/export vẫn thấy hóa đơn.
- Kiểm tra dashboard/lãi lỗ vẫn nhận hóa đơn qua `buildInvoices()`.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo thư mục nào.
- Đã tạo những file hóa đơn mới nào.
- Đã di chuyển logic nào vào file nào.
- Đã cập nhật `index.html` như thế nào.
- Đã xóa `js/legacy/hoadon.js` hay chưa.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có điểm nào cần người dùng test thực tế.
```
