```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi tách.

Sau khi tách xong hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Tách xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 5: Tách `doanhthu.js`

Bạn hãy dựa vào [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) để tách file [doanhthu.js](doanhthu.js) thành các file nhỏ hơn.

## Mục tiêu

Tách `doanhthu.js` thành 3 file:

1. `doanhthu.core.js`
2. `doanhthu.forms.js`
3. `doanhthu.reports-export.js`

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS đang chạy bằng classic script global scope. Vì vậy khi tách file:

- Không dùng `import/export`.
- Không bọc code trong IIFE/module wrapper nếu làm mất global scope.
- Không đổi tên hàm/biến global.
- Không đổi data model.
- Không đổi key storage:
  - `hopdong_v1`
  - `thu_v1`
  - `thauphu_v1`
- Không đổi logic hợp đồng chính.
- Không đổi logic thu tiền.
- Không đổi logic hợp đồng thầu phụ.
- Không đổi logic công nợ.
- Không đổi logic lãi/lỗ.
- Không đổi logic export ảnh.
- Không đổi id/class DOM nếu không cần.
- Không đổi UI text nếu không cần.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [doanhthu.js](doanhthu.js)
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
- nhóm nhập xuất đã tách nếu có:
  - `nhapxuat.parsers.js`
  - `nhapxuat.import.js`
  - `nhapxuat.export.js`
- hoặc `nhapxuat.js` nếu nhập xuất chưa tách
- `tienich.js`
- `hoadon.js`
- `chamcong.js`
- `thietbi.js`
- `datatools.js`
- `sync.js`
- `main.js`

## Ràng buộc kiến trúc

Hiện tại `doanhthu.js` được nạp sau `thietbi.js` và trước `sync.js`.

Sau khi tách, hãy thay:

```html
<script src="doanhthu.js"></script>
```

bằng:

```html
<script src="doanhthu.core.js"></script>
<script src="doanhthu.forms.js"></script>
<script src="doanhthu.reports-export.js"></script>
```

Thứ tự này rất quan trọng:

1. `doanhthu.core.js` phải nạp trước vì chứa global data, state phân trang/filter và helper dùng chung.
2. `doanhthu.forms.js` nạp sau core vì chứa CRUD form dùng helper/core state.
3. `doanhthu.reports-export.js` nạp cuối vì chứa báo cáo, init tab và export ảnh.

Không đổi thứ tự các script khác.

Nhóm `doanhthu.*.js` vẫn phải nạp trước `sync.js` và `main.js`, vì `main.js`/sync có thể reload/render các biến doanh thu.

## Phân chia nội dung đề xuất

### 1. `doanhthu.core.js`

File này chứa global data doanh thu và helper dùng chung.

Di chuyển các phần sau từ `doanhthu.js` sang `doanhthu.core.js`:

- biến global data:
  - `hopDongData`
  - `thuRecords`
  - `thauPhuContracts`
- `_normalizeThuProjectIds`
- biến item chi tiết:
  - `_hdcItems`
  - `_hdtpItems`
- `calcHopDongValue`
- `_migrateHopDongSL`
- `_initDoanhThuAddons`
- `updateGlobalTotals`
- `bindItemsToTable`
- state phân trang:
  - `_hdcPage`
  - `_hdtpPage`
  - `_thuPage`
  - `DT_PG`
- filter công trình doanh thu:
  - `_dtCtFilter`
  - `_dtMatchProjFilter`
  - `_dtMatchHDCFilter`
  - `dtPopulateCtFilter`
  - `dtSetCtFilter`
- helper UI/tab:
  - `fmtInputMoney`
  - `_readMoneyInput`
  - `_dtInYear`
  - `_dtPaginationHtml`
  - `dtGoSub`
  - `dtEnsureCongNoSubtab`
  - `dtPopulateSels`
  - `_dtAddCT`
  - `_dtAddTP`

Yêu cầu:

- `hopDongData`, `thuRecords`, `thauPhuContracts` vẫn phải là global `let`, vì `core._reloadGlobals()`, `nhapxuat`, `projects`, `danhmuc`, `datatools`, `sync` có thể đọc/gán lại.
- Không đổi logic lookup hợp đồng chính theo `projectId` và fallback tên công trình.
- Không đổi logic item chi tiết `_hdcItems`, `_hdtpItems`.
- Không đổi logic tính tổng hợp đồng `calcHopDongValue`.
- Không đổi logic format input tiền.
- Không đổi logic subtab/filter.
- Không đổi no-op `_dtAddCT`, `_dtAddTP` nếu hiện tại tab Doanh Thu không cho tạo công trình/danh mục trực tiếp.

Lưu ý phụ thuộc:

- File này dùng `load`, `save`, `cats`, `projects`, `_buildProjOpts`, `_buildProjFilterOpts`, `_readPidFromSel`, `findProjectIdByName`, `resolveProjectName`, `fmt`, `fmtISODate`, `toast`, `activeYear`, `inActiveYear`.
- Không thêm logic top-level mới gọi helper từ module nạp sau.

### 2. `doanhthu.forms.js`

File này chứa toàn bộ phần nhập liệu/CRUD của tab Doanh Thu.

Di chuyển các phần sau:

#### Hợp đồng chính

- `hdcUpdateTotal`
- `saveHopDongChinh`
- `_hdcResetForm`
- `editHopDongChinh`
- `delHopDongChinh`
- `renderHdcTable`

#### Thu tiền

- `saveThuRecord`
- `editThuRecord`
- `_thuCancelEdit`
- `_thuResetForm`
- `delThuRecord`
- `renderThuTable`

#### Hợp đồng thầu phụ

- `hdtpUpdateTotal`
- `saveHopDongThauPhu`
- `_hdtpResetForm`
- `editHopDongThauPhu`
- `delHopDongThauPhu`
- `renderHdtpTable`

Yêu cầu:

- Các hàm save/edit/delete/render vẫn phải global vì `index.html`, inline event hoặc code render đang gọi trực tiếp.
- Không đổi logic lưu hợp đồng chính vào `hopdong_v1`.
- Không đổi logic key hợp đồng chính: ưu tiên `projectId`, fallback legacy tên công trình nếu code hiện tại còn hỗ trợ.
- Không đổi logic soft delete `deletedAt`.
- Không đổi logic `updatedAt`, `deviceId`.
- Không đổi logic lưu thu tiền vào `thu_v1`.
- Không đổi logic lưu hợp đồng thầu phụ vào `thauphu_v1`.
- Không đổi logic reset form sau khi lưu.
- Không đổi logic edit load dữ liệu lên form.
- Không đổi logic render phân trang.
- Không đổi logic render bảng theo filter công trình/năm.
- Không đổi logic gọi render lại các bảng liên quan sau khi save/delete.

Lưu ý phụ thuộc:

- File này dùng data/helper từ `doanhthu.core.js`, nên phải nạp sau core.
- File này dùng `mkRecord`, `save`, `load`, `toast`, `fmt`, `fmtISODate`, `_checkProjectClosed`, `_readPidFromSel`, `resolveProjectName`, `findProjectIdByName`, `DEVICE_ID`, `_refreshAllTabs`, `dtPopulateCtFilter`, `renderLaiLo`, `renderCongNoThauPhu`, `renderCongNoNhaCungCap`.
- `DEVICE_ID` thường nằm trong `sync.js`, được nạp sau `doanhthu.js`. Nếu code hiện tại chỉ dùng `DEVICE_ID` trong function body thì giữ nguyên. Không dùng `DEVICE_ID` ở top-level.

### 3. `doanhthu.reports-export.js`

File này chứa báo cáo công nợ/lãi lỗ, init tab doanh thu và export ảnh.

Di chuyển các phần sau:

- `renderCongNoThauPhu`
- `_renderCongNoTable`
- `renderCongNoNhaCungCap`
- `renderLaiLo`
- `initDoanhThu`
- `copyKLCT`
- `pasteKLCT`
- `exportHdcToImage`
- `exportHdtpToImage`
- `exportThuToImage`

Yêu cầu:

- `renderCongNoThauPhu`, `renderCongNoNhaCungCap`, `renderLaiLo`, `initDoanhThu` vẫn phải global.
- Không đổi logic công nợ thầu phụ.
- Không đổi logic công nợ nhà cung cấp.
- Không đổi logic lãi/lỗ dashboard.
- Không đổi logic tính:
  - hợp đồng chính
  - phát sinh
  - thu tiền
  - chi phí từ hóa đơn
  - tiền ứng
  - hợp đồng thầu phụ
  - công nợ
  - lãi/lỗ
- Không đổi logic filter theo `activeYear`/`activeYears`.
- Không đổi logic dùng `getInvoicesCached()` / `buildInvoices()`.
- Không đổi logic copy/paste khối lượng chi tiết.
- Không đổi logic `html2canvas` export ảnh.
- Không đổi tên file ảnh nếu code hiện tại có đặt.

Lưu ý phụ thuộc:

- File này dùng data/helper từ `doanhthu.core.js` và render table từ `doanhthu.forms.js`, nên nạp sau cả hai.
- File này dùng `html2canvas`, `getInvoicesCached`, `resolveProjectName`, `_hdLookup`, `_hdKeyOf`, `fmt`, `fmtISODate`, `activeYear`, `activeYears`, `inActiveYear`, `toast`.
- Không gọi export ảnh ở top-level.

## Các global bắt buộc phải còn hoạt động sau khi tách

Hãy đảm bảo các tên sau vẫn tồn tại ở global scope:

```js
hopDongData
thuRecords
thauPhuContracts
_normalizeThuProjectIds
_hdcItems
_hdtpItems
calcHopDongValue
_migrateHopDongSL
_initDoanhThuAddons
updateGlobalTotals
bindItemsToTable
_hdcPage
_hdtpPage
_thuPage
DT_PG
_dtCtFilter
_dtMatchProjFilter
_dtMatchHDCFilter
dtPopulateCtFilter
dtSetCtFilter
fmtInputMoney
_readMoneyInput
_dtInYear
_dtPaginationHtml
dtGoSub
dtEnsureCongNoSubtab
dtPopulateSels
_dtAddCT
_dtAddTP
hdcUpdateTotal
saveHopDongChinh
_hdcResetForm
editHopDongChinh
delHopDongChinh
renderHdcTable
saveThuRecord
editThuRecord
_thuCancelEdit
_thuResetForm
delThuRecord
renderThuTable
hdtpUpdateTotal
saveHopDongThauPhu
_hdtpResetForm
editHopDongThauPhu
delHopDongThauPhu
renderHdtpTable
renderCongNoThauPhu
_renderCongNoTable
renderCongNoNhaCungCap
renderLaiLo
initDoanhThu
copyKLCT
pasteKLCT
exportHdcToImage
exportHdtpToImage
exportThuToImage
```

Nếu có global nào khác đang được gọi bởi `index.html`, `main.js`, `datatools.js`, `projects.js`, `nhapxuat.js`, hoặc các modal HTML render từ JS, vẫn phải giữ nguyên.

## Việc cần làm trong `index.html`

Thay dòng:

```html
<script src="doanhthu.js"></script>
```

bằng:

```html
<script src="doanhthu.core.js"></script>
<script src="doanhthu.forms.js"></script>
<script src="doanhthu.reports-export.js"></script>
```

Đặt nhóm này đúng vị trí cũ của `doanhthu.js`: sau `thietbi.js`, trước `sync.js`.

Ví dụ:

```html
<script src="thietbi.js"></script>

<script src="doanhthu.core.js"></script>
<script src="doanhthu.forms.js"></script>
<script src="doanhthu.reports-export.js"></script>

<script src="sync.js"></script>
<script src="main.js"></script>
```

## File `doanhthu.js` cũ

Sau khi tách:

- Không để `doanhthu.js` tiếp tục được nạp trong `index.html`.
- Có thể giữ file `doanhthu.js` trong repo làm bản cũ nếu muốn, nhưng không được nạp song song với các file mới.
- Nếu xóa `doanhthu.js`, hãy chắc chắn không còn script nào tham chiếu đến nó.
- Không bắt buộc xóa file cũ nếu người dùng chưa yêu cầu.

## Cập nhật `AI_CONTEXT.md`

Sau khi tách, cập nhật `AI_CONTEXT.md`:

1. Phần “Script Load Order”:
   - Thay `doanhthu.js` bằng:
     - `doanhthu.core.js`
     - `doanhthu.forms.js`
     - `doanhthu.reports-export.js`

2. Phần “Key Functions & Globals”:
   - Ghi rõ:
     - `doanhthu.core.js`: global data doanh thu, helper tiền/form, state phân trang/filter, subtab/select helpers.
     - `doanhthu.forms.js`: CRUD hợp đồng chính, thu tiền, hợp đồng thầu phụ, render các bảng khai báo.
     - `doanhthu.reports-export.js`: công nợ, lãi/lỗ, init doanh thu, copy/paste KLCT, export ảnh.

3. Phần “Coding Rules” hoặc ghi chú kiến trúc:
   - Ghi rõ nhóm `doanhthu.*.js` vẫn là classic script global scope.
   - Ghi rõ `doanhthu.core.js` phải nạp trước `doanhthu.forms.js`, và `doanhthu.reports-export.js` nạp sau cùng.
   - Ghi rõ `hopDongData`, `thuRecords`, `thauPhuContracts` là global shared state và được `_reloadGlobals()` gán lại.
   - Ghi rõ nhóm `doanhthu.*.js` phải nạp trước `sync.js` và `main.js`.

## Không cần chạy preview

Sau khi tách xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- Không còn `index.html` nạp `doanhthu.js`.
- 3 file mới nạp đúng thứ tự.
- Không có duplicate khai báo gây lỗi.
- Không có hàm bị mất khỏi global scope.
- Không có truy cập top-level tới biến của module nạp sau như `DEVICE_ID`.
- Không gọi export ảnh ở top-level.
- Không đổi logic hợp đồng chính.
- Không đổi logic thu tiền.
- Không đổi logic hợp đồng thầu phụ.
- Không đổi logic công nợ/lãi lỗ.
- Không đổi logic `projectId`/fallback tên công trình.

## Checklist người dùng sẽ test thực tế

Sau khi tách, người dùng sẽ tự test:

- Mở tab Doanh Thu.
- Chuyển các subtab trong Doanh Thu.
- Dropdown công trình trong tab Doanh Thu hiển thị đúng.
- Lưu hợp đồng chính.
- Sửa hợp đồng chính.
- Xóa mềm hợp đồng chính.
- Lưu bản ghi thu tiền.
- Sửa bản ghi thu tiền.
- Xóa mềm bản ghi thu tiền.
- Lưu hợp đồng thầu phụ.
- Sửa hợp đồng thầu phụ.
- Xóa mềm hợp đồng thầu phụ.
- Kiểm tra bảng công nợ thầu phụ.
- Kiểm tra bảng công nợ nhà cung cấp.
- Kiểm tra bảng lãi/lỗ.
- Kiểm tra filter theo công trình/năm.
- Copy/paste khối lượng chi tiết nếu UI có.
- Export ảnh hợp đồng chính.
- Export ảnh hợp đồng thầu phụ.
- Export ảnh thu tiền.
- Kiểm tra export Excel ở module nhập/xuất vẫn đọc được data doanh thu.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo những file nào.
- Đã cập nhật `index.html` như thế nào.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có giữ `doanhthu.js` cũ hay không.
- Các điểm cần người dùng test thực tế.
```
