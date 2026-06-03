#!/usr/bin/env node
// migrate-2026-firebase.js — Làm sạch dữ liệu năm 2026 trên Firebase (Cấu trúc B)
//
// CHỨC NĂNG:
//   1. Convert ID dạng timestamp (số 13 chữ số) và tiền tố imp_ → UUIDv4
//   2. Map lại projectId bị null / "UNASSIGNED" theo bảng meta_cong_trinh
//   3. Bổ sung trường createdAt còn thiếu (dùng updatedAt làm fallback)
//
// CÁCH CHẠY:
//   node migrate-2026-firebase.js --project YOUR_PROJECT_ID --key YOUR_API_KEY
//     → Mặc định: chỉ xem (DRY RUN), không ghi gì lên Firebase.
//
//   node migrate-2026-firebase.js --project YOUR_PROJECT_ID --key YOUR_API_KEY --write
//     → Thực sự ghi lên Firebase sau khi xem preview thành công.
//
// YÊU CẦU: Node.js 18+ (dùng native fetch và crypto.randomUUID)

'use strict';

// ══════════════════════════════════════════════════════════════
// [1] ĐỌC THAM SỐ DÒNG LỆNH
// ══════════════════════════════════════════════════════════════
const args    = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const PROJECT_ID = getArg('--project');
const API_KEY    = getArg('--key');
const DRY_RUN    = !args.includes('--write'); // Mặc định chỉ preview

if (!PROJECT_ID || !API_KEY) {
  console.error('❌ Thiếu tham số bắt buộc.\n');
  console.error('   Cách chạy:');
  console.error('   node migrate-2026-firebase.js --project YOUR_PROJECT_ID --key YOUR_API_KEY');
  console.error('   Thêm flag --write để ghi thật lên Firebase.\n');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════
// [2] FIRESTORE REST HELPERS (giống sync.js trong app)
// ══════════════════════════════════════════════════════════════
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/cpct_data`;

// Đóng gói payload thành Firestore document format (1 field "data" chứa JSON)
function fsWrap(obj) {
  return { fields: { data: { stringValue: JSON.stringify(obj) } } };
}
// Giải nén Firestore document về plain object
function fsUnwrap(doc) {
  if (!doc || !doc.fields || !doc.fields.data) return null;
  try { return JSON.parse(doc.fields.data.stringValue); } catch { return null; }
}
// Đọc 1 document
async function fsGet(docId) {
  const res = await fetch(`${FS_BASE}/${docId}?key=${API_KEY}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} khi đọc ${docId}`);
  return res.json();
}
// Ghi 1 document (PATCH = upsert)
async function fsPatch(docId, payload) {
  const res = await fetch(`${FS_BASE}/${docId}?key=${API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fsWrap(payload))
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi ghi ${docId}`);
  return res.json();
}

// ══════════════════════════════════════════════════════════════
// [3] HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

// Chuẩn hóa tên công trình để so sánh (bỏ dấu, lowercase, trim khoảng trắng thừa)
// Cùng logic với _catNormKey() trong app
function normKey(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // xóa combining diacritical marks
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Kiểm tra ID có phải là UUID v4 hợp lệ không
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(id) {
  return UUID_RE.test(String(id || ''));
}

// Kiểm tra ID cũ cần convert:
//   - Dạng timestamp thuần số (≥10 chữ số): ví dụ 1772875078415
//   - Tiền tố imp_: ví dụ imp_1398b126
function isOldId(id) {
  const s = String(id || '');
  return /^\d{10,}$/.test(s) || s.startsWith('imp_');
}

// Kiểm tra projectId cần sửa (null, undefined, rỗng, 'UNASSIGNED')
function needsProjectIdFix(projectId) {
  const s = String(projectId || '').trim();
  return !s || s === 'UNASSIGNED' || s === 'null' || s === 'undefined';
}

// Tìm projectId từ tên công trình trong map đã build từ meta_cong_trinh
function findProjectId(ctName, projectMap) {
  if (!ctName) return null;
  const key = normKey(ctName);
  if (projectMap.has(key)) return projectMap.get(key);

  // Fallback: partial match — tìm key nào trong map chứa tên CT hoặc ngược lại
  // (hữu ích khi tên trong record bị viết tắt hoặc thêm tiền tố "CT", "SC"...)
  for (const [mapKey, pid] of projectMap) {
    if (mapKey.includes(key) || key.includes(mapKey)) return pid;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// [4] HÀM XỬ LÝ 1 DOCUMENT
// ══════════════════════════════════════════════════════════════
/**
 * Xử lý records trong 1 Firebase document năm 2026.
 * @param {object} payload   - Payload đã unwrap: { v, yr, cat, records }
 * @param {string} ctField   - Tên field chứa tên công trình ('congtrinh' hoặc 'ct')
 * @param {string} label     - Nhãn hiển thị cho log
 * @param {Map}    projectMap - Map: normKey(tên CT) → projectId
 * @returns {{ fixedPayload, stats }}
 */
function processDoc(payload, ctField, label, projectMap) {
  const now     = Date.now();
  const records = payload.records || [];

  // Thống kê số lượng từng loại lỗi được sửa
  const stats = { idFixed: 0, pidFixed: 0, pidNotFound: 0, createdAtFixed: 0, total: records.length };

  const fixedRecords = records.map(rec => {
    let r       = { ...rec };
    let changed = false;

    // ── Lỗi 1: ID dạng timestamp hoặc imp_ ──────────────────
    if (isOldId(r.id)) {
      const oldId = r.id;
      r.id = crypto.randomUUID();
      console.log(`   [ID]  ${oldId}  →  ${r.id}   (CT: ${r[ctField] || r.congtrinh || r.ct || '—'})`);
      stats.idFixed++;
      changed = true;
    }

    // ── Lỗi 2: projectId null / UNASSIGNED ──────────────────
    if (needsProjectIdFix(r.projectId)) {
      // Thử lấy tên CT từ nhiều field khác nhau (hoa_don dùng congtrinh, cham_cong dùng ct)
      const ctName = r[ctField] || r.congtrinh || r.ct || '';
      const pid    = findProjectId(ctName, projectMap);

      if (pid) {
        console.log(`   [PID] "${String(r.projectId)}"  →  ${pid}   (CT: ${ctName || '—'})`);
        r.projectId = pid;
        stats.pidFixed++;
        changed = true;
      } else {
        console.log(`   [PID] ⚠️  Không tìm thấy project cho CT: "${ctName}"  (ID: ${r.id}) — bỏ qua`);
        stats.pidNotFound++;
      }
    }

    // ── Lỗi 3: Thiếu createdAt ───────────────────────────────
    // Dùng updatedAt làm fallback để đảm bảo trường này luôn tồn tại
    if (!r.createdAt && r.updatedAt) {
      r.createdAt = r.updatedAt;
      console.log(`   [CAT] Bổ sung createdAt = ${r.updatedAt}   (ID: ${r.id})`);
      stats.createdAtFixed++;
      changed = true;
    }

    // ── Cập nhật updatedAt nếu có bất kỳ thay đổi nào ───────
    if (changed) r.updatedAt = now;

    return r;
  });

  return {
    fixedPayload: { ...payload, records: fixedRecords },
    stats
  };
}

// ══════════════════════════════════════════════════════════════
// [5] MAIN
// ══════════════════════════════════════════════════════════════

// Danh sách 3 document cần xử lý, kèm field chứa tên công trình
const DOCS = [
  { docId: 'y2026_hoa_don',   ctField: 'congtrinh', label: 'Hóa Đơn   (y2026_hoa_don)'   },
  { docId: 'y2026_tien_ung',  ctField: 'congtrinh', label: 'Tiền Ứng  (y2026_tien_ung)'  },
  { docId: 'y2026_cham_cong', ctField: 'ct',        label: 'Chấm Công (y2026_cham_cong)' },
];

async function main() {
  const LINE = '═'.repeat(64);

  console.log(`\n${LINE}`);
  console.log(` 🔧 MIGRATION — Làm sạch dữ liệu năm 2026`);
  console.log(`    Project : ${PROJECT_ID}`);
  console.log(`    Chế độ  : ${DRY_RUN ? '🔍 DRY RUN (xem trước, không ghi)' : '✍️  WRITE (sẽ ghi lên Firebase)'}`);
  console.log(`${LINE}\n`);

  // ── Bước 1: Đọc meta_cong_trinh — build bảng tên → projectId ─
  console.log('📖 Đọc meta_cong_trinh...');
  let metaDoc;
  try { metaDoc = await fsGet('meta_cong_trinh'); }
  catch (err) { console.error(`❌ Không đọc được meta_cong_trinh: ${err.message}`); process.exit(1); }

  const metaPayload = fsUnwrap(metaDoc);
  if (!metaPayload || !Array.isArray(metaPayload.projects)) {
    console.error('❌ Cấu trúc meta_cong_trinh không hợp lệ (thiếu mảng projects).');
    process.exit(1);
  }

  // Build map: normKey(tên) → id  (dùng để tra cứu khi fix projectId)
  const projectMap = new Map();
  metaPayload.projects.forEach(p => {
    if (p.id && p.name) projectMap.set(normKey(p.name), p.id);
  });
  console.log(`   ✅ ${metaPayload.projects.length} công trình trong meta_cong_trinh.\n`);

  // In danh sách CT để dễ đối chiếu khi debug
  if (metaPayload.projects.length > 0) {
    console.log('   Danh sách công trình (ID ngắn → tên):');
    metaPayload.projects.slice(0, 20).forEach(p => {
      console.log(`   • ${p.id.slice(0, 8)}...  ${p.name}`);
    });
    if (metaPayload.projects.length > 20) console.log(`   ... và ${metaPayload.projects.length - 20} công trình nữa`);
    console.log();
  }

  // ── Bước 2: Xử lý từng document năm 2026 ────────────────────
  const allStats = [];

  for (const { docId, ctField, label } of DOCS) {
    console.log(`${'─'.repeat(64)}`);
    console.log(` 📋 ${label}`);
    console.log(`${'─'.repeat(64)}`);

    // Đọc document
    let raw;
    try { raw = await fsGet(docId); }
    catch (err) { console.log(`   ⚠️  Không đọc được ${docId}: ${err.message}. Bỏ qua.\n`); continue; }

    const payload = fsUnwrap(raw);
    if (!payload || !Array.isArray(payload.records)) {
      console.log(`   ⚠️  Document không có records hoặc cấu trúc không hợp lệ. Bỏ qua.\n`);
      continue;
    }

    console.log(`   📊 Tổng records: ${payload.records.length}`);

    // Xử lý
    const { fixedPayload, stats } = processDoc(payload, ctField, label, projectMap);
    allStats.push({ label, stats });

    // Tóm tắt thay đổi của document này
    const totalFixed = stats.idFixed + stats.pidFixed + stats.createdAtFixed;
    console.log(`\n   📝 Tóm tắt ${label.split('(')[0].trim()}:`);
    if (stats.idFixed       > 0) console.log(`      • ID cũ → UUID mới  : ${stats.idFixed}`);
    if (stats.pidFixed      > 0) console.log(`      • projectId sửa xong : ${stats.pidFixed}`);
    if (stats.pidNotFound   > 0) console.log(`      • projectId bỏ qua   : ${stats.pidNotFound} (không tìm thấy CT)`);
    if (stats.createdAtFixed > 0) console.log(`      • createdAt bổ sung  : ${stats.createdAtFixed}`);
    if (totalFixed         === 0) { console.log(`      ✅ Không cần sửa gì.`); }

    // Ghi nếu có thay đổi và không phải DRY RUN
    if (totalFixed > 0) {
      if (DRY_RUN) {
        console.log(`\n   ℹ️  [DRY RUN] Chưa ghi. Thêm --write vào lệnh để ghi lên Firebase.`);
      } else {
        console.log(`\n   ⬆️  Đang ghi ${docId}...`);
        try {
          await fsPatch(docId, fixedPayload);
          console.log(`   ✅ Ghi thành công!`);
        } catch (err) {
          console.error(`   ❌ Lỗi khi ghi: ${err.message}`);
        }
      }
    }
    console.log();
  }

  // ── Tóm tắt tổng hợp ─────────────────────────────────────────
  console.log(`${LINE}`);
  console.log(` 📊 KẾT QUẢ TỔNG HỢP`);
  console.log(`${LINE}`);
  allStats.forEach(({ label, stats }) => {
    const total = stats.idFixed + stats.pidFixed + stats.createdAtFixed;
    const shortLabel = label.split('(')[0].trim();
    console.log(` ${shortLabel.padEnd(14)}: ${total} bản ghi được sửa / ${stats.total} tổng`);
  });
  console.log();

  if (DRY_RUN) {
    console.log(` ✅ DRY RUN hoàn thành. Kiểm tra log ở trên.`);
    console.log(`    Để thực sự ghi, chạy lại với flag --write:`);
    console.log(`    node migrate-2026-firebase.js --project ${PROJECT_ID} --key YOUR_API_KEY --write`);
  } else {
    console.log(` ✅ Migration hoàn thành!`);
    console.log(`    Mở app → bấm 🔄 Sync để pull dữ liệu mới từ Firebase về.`);
  }
  console.log(`${LINE}\n`);
}

main().catch(err => {
  console.error(`\n❌ Lỗi không xử lý được: ${err.message}`);
  process.exit(1);
});
