```markdown
Hãy đọc file [AI_CONTEXT.md](AI_CONTEXT.md) trước khi làm.

Sau khi dọn dẹp/tổ chức lại cấu trúc thư mục xong, hãy cập nhật lại vào trong file [AI_CONTEXT.md](AI_CONTEXT.md), đặc biệt là phần thứ tự nạp script, sơ đồ thư mục, mô tả module, global quan trọng và ghi chú kiến trúc mới.

Dọn xong để người dùng tự test thực tế, không yêu cầu chạy preview để test.

---

# Mega Prompt 7: Xóa file cũ đã tách và tổ chức lại cấu trúc thư mục

Bạn hãy dựa vào [AI_CONTEXT.md](AI_CONTEXT.md) và [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md) để dọn dẹp project sau khi đã tách module.

## Mục tiêu

6 file cũ đã được tách gồm:

1. `core.js`
2. `projects.js`
3. `danhmuc.js`
4. `nhapxuat.js`
5. `doanhthu.js`
6. `chamcong.js`

Hãy:

1. Kiểm tra chắc chắn `index.html` không còn nạp 6 file cũ này.
2. Kiểm tra chắc chắn toàn bộ code không còn tham chiếu trực tiếp đến đường dẫn 6 file cũ này.
3. Xóa 6 file cũ đã tách nếu chúng không còn được sử dụng.
4. Tạo cấu trúc thư mục phù hợp giống một dự án nhỏ.
5. Di chuyển các file JS mới đã tách vào các thư mục hợp lý.
6. Cập nhật lại toàn bộ đường dẫn `<script src="...">` trong `index.html`.
7. Cập nhật [AI_CONTEXT.md](AI_CONTEXT.md) theo cấu trúc mới.

Yêu cầu quan trọng nhất: **không làm thay đổi hành vi runtime hiện tại**.

Project này là SPA tĩnh Vanilla JS, không bundler, không ES module import/export. Toàn bộ JS vẫn chạy bằng classic script global scope. Vì vậy khi tổ chức lại thư mục:

- Không dùng `import/export`.
- Không đổi tên hàm/biến global.
- Không đổi thứ tự nạp script về mặt logic.
- Không đổi data model.
- Không đổi logic IndexedDB/sync.
- Không đổi UI text nếu không cần.
- Không đổi nội dung code nếu chỉ cần di chuyển file.
- Không tự ý đổi sang bundler/Vite/Webpack.
- Không tự ý đổi sang ES module.

## File cần đọc trước khi sửa

Hãy đọc kỹ các file sau:

- [AI_CONTEXT.md](AI_CONTEXT.md)
- [BAO_CAO_TACH_MODULE.md](BAO_CAO_TACH_MODULE.md)
- [index.html](index.html)
- Các file JS mới đã tách hiện có trong project.

Đặc biệt kiểm tra các file mới tương ứng nếu tồn tại:

### Core

- `core.storage.js`
- `core.state-backup.js`
- `core.cloud-cats-ui.js`

### Projects

- `projects.model.js`
- `projects.migration-selects.js`
- `projects.ui.js`

### Danh mục

- `danhmuc.categories.js`
- `danhmuc.ung.js`
- `danhmuc.tools.js`

### Nhập xuất

- `nhapxuat.parsers.js`
- `nhapxuat.import.js`
- `nhapxuat.export.js`

### Doanh thu

- `doanhthu.core.js`
- `doanhthu.forms.js`
- `doanhthu.reports-export.js`

### Chấm công

- `chamcong.core.js`
- `chamcong.week-form.js`
- `chamcong.history-reports.js`

Ngoài ra, các file JS cũ/chưa tách vẫn đang dùng:

- `tienich.js`
- `hoadon.js`
- `datatools.js`
- `thietbi.js`
- `sync.js`
- `main.js`

## Cấu trúc thư mục đề xuất

Hãy tạo cấu trúc thư mục như sau:

```text
assets/
  css/
    style.css

js/
  core/
    core.storage.js
    core.state-backup.js
    core.cloud-cats-ui.js

  modules/
    projects/
      projects.model.js
      projects.migration-selects.js
      projects.ui.js

    danhmuc/
      danhmuc.categories.js
      danhmuc.ung.js
      danhmuc.tools.js

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

  legacy/
    tienich.js
    hoadon.js
    datatools.js
    thietbi.js

  sync/
    sync.js

  app/
    main.js
```

Lưu ý:

- Tên thư mục/file nên dùng ASCII không dấu.
- Không cần đổi tên file mới, chỉ di chuyển vào thư mục.
- Có thể đặt `style.css` vào `assets/css/style.css` nếu `index.html` đang link trực tiếp `style.css`. Nếu di chuyển CSS, nhớ cập nhật `<link>`.
- Nếu muốn giảm thay đổi, có thể để `style.css` ở root. Nhưng phương án ưu tiên là đưa vào `assets/css/`.

## Thứ tự script bắt buộc sau khi di chuyển

Cập nhật `index.html` để nạp theo thứ tự sau.

Giữ nguyên CDN trước:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://unpkg.com/dexie@4/dist/dexie.min.js"></script>
```

Sau đó nạp JS local:

```html
<script src="js/core/core.storage.js"></script>
<script src="js/core/core.state-backup.js"></script>
<script src="js/core/core.cloud-cats-ui.js"></script>

<script src="js/modules/projects/projects.model.js"></script>
<script src="js/modules/projects/projects.migration-selects.js"></script>
<script src="js/modules/projects/projects.ui.js"></script>

<script src="js/legacy/tienich.js"></script>
<script src="js/legacy/hoadon.js"></script>

<script src="js/modules/danhmuc/danhmuc.categories.js"></script>
<script src="js/modules/danhmuc/danhmuc.ung.js"></script>
<script src="js/modules/danhmuc/danhmuc.tools.js"></script>

<script src="js/modules/nhapxuat/nhapxuat.parsers.js"></script>
<script src="js/modules/nhapxuat/nhapxuat.import.js"></script>
<script src="js/modules/nhapxuat/nhapxuat.export.js"></script>

<script src="js/legacy/datatools.js"></script>

<script src="js/modules/chamcong/chamcong.core.js"></script>
<script src="js/modules/chamcong/chamcong.week-form.js"></script>
<script src="js/modules/chamcong/chamcong.history-reports.js"></script>

<script src="js/legacy/thietbi.js"></script>

<script src="js/modules/doanhthu/doanhthu.core.js"></script>
<script src="js/modules/doanhthu/doanhthu.forms.js"></script>
<script src="js/modules/doanhthu/doanhthu.reports-export.js"></script>

<script src="js/sync/sync.js"></script>
<script src="js/app/main.js"></script>
```

Nếu một file trong danh sách chưa tồn tại do bước tách trước chọn phương án ít file hơn, hãy cập nhật theo thực tế. Không tạo file rỗng chỉ để đủ danh sách.

## CSS

Nếu di chuyển:

```text
style.css
```

sang:

```text
assets/css/style.css
```

thì cập nhật trong `index.html`:

```html
<link rel="stylesheet" href="assets/css/style.css">
```

Nếu `index.html` đang dùng đường dẫn khác, hãy cập nhật đúng theo thực tế.

## Xóa 6 file cũ

Chỉ xóa 6 file cũ sau khi đã kiểm tra:

```text
core.js
projects.js
danhmuc.js
nhapxuat.js
doanhthu.js
chamcong.js
```

Điều kiện bắt buộc trước khi xóa:

1. `index.html` không còn `<script src="core.js">`.
2. `index.html` không còn `<script src="projects.js">`.
3. `index.html` không còn `<script src="danhmuc.js">`.
4. `index.html` không còn `<script src="nhapxuat.js">`.
5. `index.html` không còn `<script src="doanhthu.js">`.
6. `index.html` không còn `<script src="chamcong.js">`.
7. Không có file `.html`, `.js`, `.md` nào còn hướng dẫn/nạp trực tiếp 6 file cũ, trừ nội dung lịch sử trong báo cáo nếu muốn giữ.

Nếu phát hiện file cũ vẫn đang được tham chiếu runtime, không xóa ngay. Hãy cập nhật tham chiếu trước rồi mới xóa.

## Di chuyển file an toàn

Khi di chuyển file:

- Không đổi nội dung code nếu không cần.
- Không đổi thứ tự code bên trong file.
- Không đổi khai báo `let/const/function`.
- Không đổi global contract.
- Không tự động format toàn bộ file nếu không cần.
- Không xóa comment quan trọng về load order.

Sau khi di chuyển, hãy rà lại:

- Có file nào bị nạp 2 lần không.
- Có file nào không được nạp không.
- Có đường dẫn sai chữ hoa/thường không.
- Có đường dẫn chứa dấu cách/tiếng Việt không.
- Có script local nào vẫn trỏ về root cũ không.

## Cập nhật `AI_CONTEXT.md`

Sau khi tổ chức lại thư mục, cập nhật [AI_CONTEXT.md](AI_CONTEXT.md):

### 1. Project Overview

Ghi rõ project vẫn là:

- SPA tĩnh.
- Vanilla JS.
- Classic script global scope.
- Không bundler.
- Không ES module import/export.

### 2. Script Load Order

Cập nhật bảng script load order theo đường dẫn mới, ví dụ:

| # | Script | Vai trò |
|---:|---|---|
| 1 | CDN XLSX | Excel |
| 2 | CDN html2canvas | Export ảnh |
| 3 | CDN Dexie | IndexedDB |
| 4 | `js/core/core.storage.js` | Storage, Dexie, load/save |
| 5 | `js/core/core.state-backup.js` | Global state, migration, backup JSON |
| 6 | `js/core/core.cloud-cats-ui.js` | Cloud legacy UI, cats sync, sync badge |
| ... | ... | ... |

Hãy cập nhật đầy đủ theo thực tế.

### 3. Sơ đồ thư mục

Thêm hoặc cập nhật mục sơ đồ thư mục:

```text
assets/
js/
  core/
  modules/
    projects/
    danhmuc/
    nhapxuat/
    chamcong/
    doanhthu/
  legacy/
  sync/
  app/
index.html
AI_CONTEXT.md
```

### 4. Key Functions & Globals

Cập nhật bảng module/global theo file mới:

- `js/core/core.storage.js`
- `js/core/core.state-backup.js`
- `js/core/core.cloud-cats-ui.js`
- `js/modules/projects/projects.model.js`
- `js/modules/projects/projects.migration-selects.js`
- `js/modules/projects/projects.ui.js`
- `js/modules/danhmuc/danhmuc.categories.js`
- `js/modules/danhmuc/danhmuc.ung.js`
- `js/modules/danhmuc/danhmuc.tools.js`
- `js/modules/nhapxuat/nhapxuat.parsers.js`
- `js/modules/nhapxuat/nhapxuat.import.js`
- `js/modules/nhapxuat/nhapxuat.export.js`
- `js/modules/chamcong/chamcong.core.js`
- `js/modules/chamcong/chamcong.week-form.js`
- `js/modules/chamcong/chamcong.history-reports.js`
- `js/modules/doanhthu/doanhthu.core.js`
- `js/modules/doanhthu/doanhthu.forms.js`
- `js/modules/doanhthu/doanhthu.reports-export.js`
- `js/legacy/tienich.js`
- `js/legacy/hoadon.js`
- `js/legacy/datatools.js`
- `js/legacy/thietbi.js`
- `js/sync/sync.js`
- `js/app/main.js`

Nếu một file không tồn tại theo thực tế, không ghi sai. Hãy ghi theo cấu trúc thực tế cuối cùng.

### 5. Coding Rules

Ghi rõ:

- Không đổi script order tùy tiện.
- Các thư mục chỉ là tổ chức vật lý, không phải module system.
- Các file vẫn dùng global scope.
- Hàm inline HTML vẫn cần global.
- Khi thêm file mới phải cập nhật `index.html` và `AI_CONTEXT.md`.

## Không cần chạy preview

Sau khi dọn xong, không yêu cầu chạy preview/browser để test. Người dùng sẽ tự test thực tế.

Tuy nhiên hãy tự rà soát bằng đọc code để đảm bảo:

- `index.html` nạp đúng toàn bộ file mới.
- Không còn nạp 6 file cũ đã tách.
- 6 file cũ đã được xóa nếu không còn tham chiếu.
- `style.css` nếu di chuyển thì `index.html` trỏ đúng `assets/css/style.css`.
- Không có file JS mới nào bị bỏ sót khỏi `index.html`.
- Không có duplicate script.
- `AI_CONTEXT.md` phản ánh đúng cấu trúc thực tế.

## Checklist người dùng sẽ test thực tế

Sau khi bạn hoàn tất, người dùng sẽ tự test:

- Mở app từ `index.html`.
- Kiểm tra app load không lỗi.
- Đăng nhập nếu có.
- Mở các tab chính:
  - Hóa Đơn
  - Công Trình
  - Danh Mục
  - Tiền Ứng
  - Nhập/Xuất
  - Chấm Công
  - Thiết Bị
  - Doanh Thu
  - Sync/Data tools nếu có
- Kiểm tra các chức năng chính vẫn chạy:
  - Lưu hóa đơn.
  - Lưu công trình.
  - Lưu tiền ứng.
  - Import/export Excel.
  - Lưu chấm công.
  - Lưu doanh thu.
  - Sync thủ công.

## Kết quả mong muốn

Sau khi hoàn tất, hãy báo cáo ngắn gọn:

- Đã tạo các thư mục nào.
- Đã di chuyển file nào vào đâu.
- Đã xóa 6 file cũ nào.
- Đã cập nhật `index.html` như thế nào.
- Đã cập nhật `AI_CONTEXT.md` phần nào.
- Có file nào không thể xóa vì còn tham chiếu không.
- Các điểm cần người dùng test thực tế.
```
