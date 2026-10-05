# ส่วนเสริม: หน้ารอเข้าไลฟ์ (Lobby / Starting Soon)

> **เวอร์ชัน:** 1.0 · 2 ตุลาคม 2026 · **ใช้คู่กับ `SPEC.md`** (วางไว้โฟลเดอร์เดียวกัน)
> **ไฟล์นี้คืออะไร:** สเปกละเอียดของ "หน้ารอเข้าไลฟ์" — โลโก้งานด้านซ้าย, ตารางแข่งวันนี้ด้านขวา, นับถอยหลังตัวใหญ่ด้านล่าง, หมดเวลาแล้วเล่นแอนิเมชันปิดตาราง → โลโก้วิ่งมากลางจอ → ม่านเปิดเข้าไลฟ์
> **อ่าน `SPEC.md` ก่อนเสมอ** — กฎทางเทคนิคในหัวข้อ 3 ของ SPEC ใช้กับไฟล์นี้ทุกข้อ (ห้าม module, ห้าม fetch, ห้าม crypto.subtle, รองรับ Chromium 103 ฯลฯ)
> **โค้ดในหัวข้อ 4.1** (`js/lobby-state.js`) ทดสอบรันแล้ว — ก๊อปไปใช้ตรงตัว

---

## สารบัญ

0. [สรุปสั้นที่สุด](#0-สรุปสั้นที่สุด)
1. [สิ่งที่จะได้](#1-สิ่งที่จะได้)
2. [ทำไมเป็นเลเยอร์ใน overlay ไม่ใช่ Scene แยก](#2-ทำไมเป็นเลเยอร์ใน-overlay-ไม่ใช่-scene-แยก)
3. [ไฟล์ที่เพิ่มและไฟล์ที่ต้องแก้](#3-ไฟล์ที่เพิ่มและไฟล์ที่ต้องแก้)
4. [ข้อมูล (State) ของหน้ารอ](#4-ข้อมูล-state-ของหน้ารอ)
5. [ข้อความและการซิงก์](#5-ข้อความและการซิงก์)
6. [หน้าจอ overlay: หน้ารอ](#6-หน้าจอ-overlay-หน้ารอ)
7. [แอนิเมชันเข้าไลฟ์ (Go Live)](#7-แอนิเมชันเข้าไลฟ์-go-live)
8. [หน้าคอนโทรล: แท็บหน้ารอเข้าไลฟ์](#8-หน้าคอนโทรล-แท็บหน้ารอเข้าไลฟ์)
9. [ใช้งานจริงวันแข่ง](#9-ใช้งานจริงวันแข่ง)
10. [เช็คลิสต์ทดสอบ](#10-เช็คลิสต์ทดสอบ)
11. [แก้ปัญหา](#11-แก้ปัญหา)
12. [Prompt สำหรับ AI](#12-prompt-สำหรับ-ai)
13. [ต่อยอดในอนาคต](#13-ต่อยอดในอนาคต)

---

## 0. สรุปสั้นที่สุด

- หน้ารอเป็น **เลเยอร์เต็มจอทึบ** อยู่ในหน้า `overlay.html` เดิม (ไม่ต้องเพิ่ม Browser Source ไม่ต้องเพิ่ม Scene)
- เปิดหน้ารอ → บังภาพเกมทั้งหมด คนดูเห็นแค่หน้ารอ
- หน้าตา: **โลโก้งานด้านซ้าย** · **ตารางแข่งวันนี้ด้านขวา** (เริ่มต้น 2 คู่ เพิ่มได้ถึง 6 คู่: เวลา, ทีม VS ทีม, หมายเหตุ, สถานะ) · **นับถอยหลังตัวใหญ่ตรงกลางล่าง** (เริ่มต้น 30 นาที)
- **หมดเวลา → เข้าไลฟ์อัตโนมัติ:** ตารางเลื่อนปิด → โลโก้วิ่งมากลางจอ ค้างครู่หนึ่ง → จอแยกออกซ้ายขวาเหมือนม่านเปิด → เห็นภาพเกม + แถบสกอร์
- คุมทั้งหมดจากหน้าคอนโทรลเดิม ในแท็บใหม่ **"🕒 หน้ารอเข้าไลฟ์"** · ปุ่มลัด `L` เปิด/ปิดหน้ารอ, `G` เข้าไลฟ์เลย
- นับถอยหลังได้ 2 แบบ: **นับ X นาที** หรือ **นับถึงเวลา** (เช่น ถึง 19:00 น.)
- ใช้ซ้ำได้ช่วงพักระหว่างแมตช์ (เช่น พัก 10 นาที แล้วเข้าไลฟ์อัตโนมัติอีกรอบ)

---

## 1. สิ่งที่จะได้

| # | ฟีเจอร์ | รายละเอียด |
|---|---|---|
| L-F1 | เลเยอร์หน้ารอเต็มจอ | พื้นหลังทึบ (สีหรือรูปจากทีมดีไซน์) + ลายเส้นเฉียงเคลื่อนไหวช้า ๆ |
| L-F2 | โลโก้งานด้านซ้าย | ใช้โลโก้งานตัวเดียวกับแอนิเมชันเปลี่ยนแมตช์ (`logos.event`) + ชื่องาน + บรรทัดรอง |
| L-F3 | ตารางแข่งด้านขวา | 1–6 คู่ · แต่ละคู่: เวลา, โลโก้+ชื่อทีม A, VS, ชื่อ+โลโก้ทีม B, หมายเหตุ (เช่น BO3), ป้ายสถานะ |
| L-F4 | สถานะแต่ละคู่ | กำลังจะแข่ง / **คู่ถัดไป** (ไฮไลต์) / **กำลังแข่ง** (ป้าย LIVE กะพริบ) / **จบแล้ว** (โชว์ผล 2 : 1 แทน VS) |
| L-F5 | นับถอยหลังตัวใหญ่ | `30:00` · เกิน 1 ชม. เป็น `1:05:00` · หมดแล้วโชว์ข้อความ เช่น "กำลังจะเริ่ม…" |
| L-F6 | นับ 2 โหมด | นับ X นาที (กดเริ่มเอง) / นับถึงเวลา HH:MM (เริ่มเดินทันที) · ปรับ ±1 / ±5 นาทีได้ตลอดเวลา |
| L-F7 | เข้าไลฟ์อัตโนมัติ | ถึง 0 แล้วเล่นแอนิเมชันเข้าไลฟ์เอง (ปิดได้) · ปุ่ม "เข้าไลฟ์เลย" ข้ามไม่ต้องรอ |
| L-F8 | ข้อความวิ่ง (ไม่บังคับ) | แถบล่างสุดสำหรับเพจ/สปอนเซอร์ ปล่อยว่าง = ไม่โชว์ |
| L-F9 | ตั้งค่าเร็ว | เลือกทีมจากคลังทีม (ชื่อ+โลโก้มาเอง) หรือพิมพ์เอง+อัปโหลดโลโก้ · ปุ่ม "ใช้ทีม A/B ปัจจุบันเป็นคู่แรก" |

---

## 2. ทำไมเป็นเลเยอร์ใน overlay ไม่ใช่ Scene แยก

| | เลเยอร์ใน overlay (ที่เลือก) | Scene แยกใน OBS |
|---|---|---|
| การคุม | ปุ่มเดียวในหน้าคอนโทรลเดิม | ต้องสลับ Scene ใน OBS เอง |
| แอนิเมชันเข้าไลฟ์ | ต่อเนื่องในหน้าเดียว ม่านเปิดแล้วเห็นเกมทันที | ต้องใช้ Stinger transition ของ OBS (ต้องมีไฟล์วิดีโอ) |
| ข้อมูลทีม/โลโก้ | ใช้ร่วมกับระบบเดิมเลย | ต้องทำหน้าแยกอีกหน้า |
| ข้อเสีย | เพลงรอ (Media Source ใน OBS) ต้องปิดเอง | — |

> เรื่องเพลงรอ: ถ้าอยากให้เพลงหยุดเองตอนเข้าไลฟ์ ดูหัวข้อ 13

---

## 3. ไฟล์ที่เพิ่มและไฟล์ที่ต้องแก้

### 3.1 ไฟล์ใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `js/lobby-state.js` | ข้อมูลหน้ารอ + ตัวนับถอยหลัง + กติกาเข้าไลฟ์อัตโนมัติ (**ทดสอบแล้ว ก๊อปตรงตัว**) |
| `js/lobby-overlay.js` | วาดหน้ารอ + เล่นแอนิเมชันใน overlay → `window.ValoLobbyOverlay` |
| `js/lobby-control.js` | แท็บหน้ารอในหน้าคอนโทรล → `window.ValoLobbyControl` |
| `css/lobby.css` | layout + แอนิเมชันหน้ารอ (ใช้ตัวแปรจาก theme.css) |

### 3.2 ไฟล์เดิมที่ต้องแก้

| ไฟล์ | แก้อะไร |
|---|---|
| `css/theme.css` | **ต่อท้าย** ตัวแปรหน้ารอ (หัวข้อ 6.6) — ไม่ลบของเดิม |
| `overlay.html` | เพิ่ม `<link href="css/lobby.css">` ต่อจาก overlay.css · เพิ่ม `<script>` 2 ตัว (3.3) |
| `control.html` | เพิ่มแท็บ + `<script>` 2 ตัว (3.3) |
| `js/overlay.js` | เรียก `ValoLobbyOverlay` 5 จุด (หัวข้อ 6.7) |
| `js/control.js` | เรียก `ValoLobbyControl` + ปุ่มลัด `L`/`G` + โลโก้ตาราง + รีเซ็ตต้องไม่ลบหน้ารอ (หัวข้อ 8.8) |
| `js/state.js`, `js/link.js`, `js/config.js` | **ไม่ต้องแก้** |

### 3.3 ลำดับ `<script>` ใหม่

```html
<!-- overlay.html -->
<script src="js/config.js"></script>
<script src="data/game-data.js"></script>
<script src="js/state.js"></script>
<script src="js/lobby-state.js"></script>   <!-- ใหม่: ต้องอยู่ต่อจาก state.js -->
<script src="js/link.js"></script>
<script src="js/lobby-overlay.js"></script> <!-- ใหม่: ต้องอยู่ก่อน overlay.js -->
<script src="js/overlay.js"></script>

<!-- control.html -->
<script src="js/config.js"></script>
<script src="data/game-data.js"></script>
<script src="js/state.js"></script>
<script src="js/lobby-state.js"></script>   <!-- ใหม่ -->
<script src="js/link.js"></script>
<script src="js/lobby-control.js"></script> <!-- ใหม่: ต้องอยู่ก่อน control.js -->
<script src="js/control.js"></script>
```

> `lobby-state.js` "ห่อ" ฟังก์ชัน `ValoState.makeDefaultState()` ให้คืน state ที่มี `state.lobby` มาด้วย → ไม่ต้องแก้ `state.js` เลย แต่ **ต้องโหลดต่อจาก state.js และก่อนโค้ดที่เรียก makeDefaultState**

---

## 4. ข้อมูล (State) ของหน้ารอ

### 4.1 โค้ดเต็ม `js/lobby-state.js` (ทดสอบแล้ว — ก๊อปตรงตัว)

ทดสอบแล้ว: นับถอยหลัง/หยุด/เดินต่อ, บวกลบนาทีทั้งตอนเดินและหยุด (ไม่ติดลบ), โหมดนับถึงเวลา (ทั้งเวลาไทยและเขตเวลาอื่น), ปฏิเสธเวลาที่ผ่านไปแล้วหรือพิมพ์ผิด, รูปแบบ `30:00` / `1:30:00`, เงื่อนไขเข้าไลฟ์อัตโนมัติ, สลับลำดับคู่ และ state เดิมจาก SPEC ยังครบ

```js
/* =====================================================================
   js/lobby-state.js — ข้อมูล + ตัวนับถอยหลังของ "หน้ารอเข้าไลฟ์"
   ---------------------------------------------------------------------
   โหลดต่อจาก state.js เสมอ · ไม่แก้ state.js แต่ "ห่อ" makeDefaultState
   ให้มีช่อง state.lobby เพิ่มเข้าไป
   ===================================================================== */
(function () {
  'use strict';
  var S = window.ValoState;

  var MAX_MATCHES = 6;
  var GOLIVE = { closeMs: 600, logoMs: 800, openMs: 700 }; // ช่วงเวลาแอนิเมชันเข้าไลฟ์ (ไม่รวมช่วงค้าง)

  function newId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function makeMatch(time, nameA, tagA, nameB, tagB, note, status) {
    return {
      id: newId(),
      time: time || '',                                 // 'HH:MM' 24 ชม.
      teamA: { name: nameA || 'TEAM A', tag: tagA || '', libId: '' },
      teamB: { name: nameB || 'TEAM B', tag: tagB || '', libId: '' },
      note: note || '',                                 // เช่น 'BO3 · รอบรองชนะเลิศ'
      status: status || 'upcoming',                     // 'upcoming' | 'next' | 'live' | 'done'
      scoreA: 0,                                        // ใช้ตอน status = 'done'
      scoreB: 0
    };
  }

  function makeDefaultLobby() {
    return {
      visible: false,
      eventName: 'VALORANT CUP 2026',
      tagline: 'DAY 1',
      scheduleTitle: 'ตารางการแข่งขันวันนี้',
      countdownLabel: 'เริ่มไลฟ์ใน',
      zeroText: 'กำลังจะเริ่ม…',
      ticker: '',                                       // ข้อความวิ่งล่างจอ ('' = ไม่โชว์)
      autoGoLive: true,                                 // หมดเวลาแล้วเข้าไลฟ์เอง
      goLiveHoldMs: 1000,                               // โลโก้ค้างกลางจอกี่ ms
      countdown: {
        mode: 'duration',                               // 'duration' = นับ X นาที | 'target' = นับถึงเวลา HH:MM
        durationMs: 30 * 60000,
        targetTime: '19:00',
        remainingMs: 30 * 60000,
        endsAt: 0,
        running: false
      },
      matches: [
        makeMatch('13:00', 'TEAM ALPHA', 'ALP', 'TEAM BRAVO', 'BRV', 'BO3', 'next'),
        makeMatch('15:00', 'TEAM CHARLIE', 'CHA', 'TEAM DELTA', 'DLT', 'BO3', 'upcoming')
      ]
    };
  }

  // ห่อ makeDefaultState เดิมให้มี lobby (state.js ไม่ต้องแก้)
  var baseMakeDefault = S.makeDefaultState;
  S.makeDefaultState = function () {
    var st = baseMakeDefault();
    st.lobby = makeDefaultLobby();
    return st;
  };

  /* ---------- ตัวนับถอยหลังหน้ารอ ---------- */
  function lobbyRemaining(c, now) {
    return c.running ? Math.max(0, c.endsAt - now) : Math.max(0, c.remainingMs);
  }
  // แปลง 'HH:MM' เป็นเวลา (ms) ของวันนี้ · ถ้าเวลานั้นผ่านไปแล้วคืน null
  function targetToEndsAt(hhmm, now) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    var h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    var d = new Date(now);
    d.setHours(h, min, 0, 0);
    var t = d.getTime();
    return t > now ? t : null;
  }
  function lobbySetDuration(c, minutes) {
    var ms = Math.max(1, Math.round(Number(minutes) || 0)) * 60000;
    c.mode = 'duration';
    c.durationMs = ms;
    c.remainingMs = ms;
    c.running = false;
    c.endsAt = 0;
  }
  // คืน true ถ้าตั้งได้ · false ถ้าเวลาผิดหรือผ่านไปแล้ว
  function lobbySetTarget(c, hhmm, now) {
    var t = targetToEndsAt(hhmm, now);
    if (t === null) return false;
    c.mode = 'target';
    c.targetTime = hhmm;
    c.durationMs = t - now;
    c.remainingMs = t - now;
    c.endsAt = t;
    c.running = true;                                   // โหมดถึงเวลา เดินทันทีเสมอ
    return true;
  }
  function lobbyStart(c, now) {
    if (c.running || c.remainingMs <= 0) return;
    c.endsAt = now + c.remainingMs;
    c.running = true;
  }
  function lobbyStop(c, now) {
    if (!c.running) return;
    c.remainingMs = Math.max(0, c.endsAt - now);
    c.running = false;
  }
  // บวก/ลบเวลา (นาที) ได้ทั้งตอนเดินและตอนหยุด · ไม่ต่ำกว่า 0
  function lobbyAdjust(c, minutes, now) {
    var delta = Math.round(Number(minutes) || 0) * 60000;
    if (c.running) c.endsAt = Math.max(now, c.endsAt + delta);
    else c.remainingMs = Math.max(0, c.remainingMs + delta);
  }
  function lobbyReset(c) {
    c.remainingMs = c.durationMs;
    c.running = false;
    c.endsAt = 0;
  }
  // 30:00 · 05:00 · 1:05:00 (ปัดวินาทีขึ้น)
  function formatLong(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return h > 0 ? h + ':' + two(m) + ':' + two(r) : two(m) + ':' + two(r);
  }
  // หมดเวลาแล้วควรเข้าไลฟ์อัตโนมัติไหม (control เรียกทุก 250 ms)
  function shouldAutoGoLive(lobby, now) {
    var c = lobby.countdown;
    return !!(lobby.visible && lobby.autoGoLive && c.running && lobbyRemaining(c, now) === 0);
  }
  function goLiveTotalMs(holdMs) {
    return GOLIVE.closeMs + GOLIVE.logoMs + Math.max(0, holdMs || 0) + GOLIVE.openMs;
  }
  function moveMatch(list, index, dir) {
    var j = index + dir;
    if (index < 0 || index >= list.length || j < 0 || j >= list.length) return false;
    var tmp = list[index]; list[index] = list[j]; list[j] = tmp;
    return true;
  }

  window.ValoLobby = {
    MAX_MATCHES: MAX_MATCHES, GOLIVE: GOLIVE,
    makeDefaultLobby: makeDefaultLobby, makeMatch: makeMatch,
    lobbyRemaining: lobbyRemaining, targetToEndsAt: targetToEndsAt,
    lobbySetDuration: lobbySetDuration, lobbySetTarget: lobbySetTarget,
    lobbyStart: lobbyStart, lobbyStop: lobbyStop, lobbyAdjust: lobbyAdjust, lobbyReset: lobbyReset,
    formatLong: formatLong, shouldAutoGoLive: shouldAutoGoLive, goLiveTotalMs: goLiveTotalMs,
    moveMatch: moveMatch
  };
})();
```

### 4.2 ความหมายของแต่ละช่องใน `state.lobby`

| ช่อง | ชนิด | ความหมาย |
|---|---|---|
| `visible` | boolean | โชว์หน้ารอบน overlay ไหม |
| `eventName` | string ≤ 40 | ชื่องาน ใต้โลโก้ (ตัวใหญ่) |
| `tagline` | string ≤ 40 | บรรทัดรองใต้ชื่องาน เช่น `DAY 2 · PLAYOFFS` |
| `scheduleTitle` | string ≤ 40 | หัวตาราง |
| `countdownLabel` | string ≤ 30 | ป้ายเหนือตัวเลขนับถอยหลัง |
| `zeroText` | string ≤ 30 | ข้อความแทนตัวเลขเมื่อนับถึง 0 (ใช้ตอนปิดเข้าไลฟ์อัตโนมัติ) |
| `ticker` | string ≤ 200 | ข้อความวิ่งล่างจอ (`''` = ไม่โชว์แถบ) |
| `autoGoLive` | boolean | ถึง 0 แล้วเข้าไลฟ์เอง (ค่าเริ่มต้น `true`) |
| `goLiveHoldMs` | 0–5000 | โลโก้ค้างกลางจอกี่ ms ในแอนิเมชันเข้าไลฟ์ (ค่าเริ่มต้น 1000) |
| `countdown.mode` | `'duration'` / `'target'` | นับ X นาที / นับถึงเวลา |
| `countdown.durationMs` | ms | ความยาวที่ตั้งไว้ (ใช้ตอนกด "ตั้งใหม่") |
| `countdown.targetTime` | `'HH:MM'` | เวลาเป้าหมาย (โหมด target) |
| `countdown.remainingMs` / `endsAt` / `running` | — | หลักการเดียวกับเวลารอบใน SPEC หัวข้อ 10 |
| `matches[]` | array 1–6 | รายการคู่แข่ง (ลำดับในอาร์เรย์ = ลำดับบนจอ) |
| `matches[].id` | string | รหัสประจำคู่ ใช้ผูกกับโลโก้ (ห้ามใช้ index) |
| `matches[].time` | `'HH:MM'` | เวลาแข่ง (24 ชม.) |
| `matches[].teamA/teamB` | `{ name, tag, libId }` | ชื่อเต็ม ≤ 32, ชื่อย่อ ≤ 5, รหัสทีมในคลัง (`''` = พิมพ์เอง) |
| `matches[].note` | string ≤ 30 | หมายเหตุ เช่น `BO3 · Upper Final` |
| `matches[].status` | `'upcoming'` / `'next'` / `'live'` / `'done'` | สถานะ |
| `matches[].scoreA/scoreB` | 0–9 | ผลแมพ (ใช้ตอน `done`) |

### 4.3 โลโก้ทีมในตาราง

- เก็บใน **`logos.schedule`** (ไม่ใช่ใน state เพราะรูปใหญ่) รูปแบบ: `logos.schedule = { [matchId]: { A: dataURL|null, B: dataURL|null } }`
- ย่อรูปเหลือไม่เกิน **128×128** (เล็กกว่าโลโก้บนแถบสกอร์ เพราะโชว์แค่ 64px)
- ตอนโหลด logos จาก localStorage: ถ้าไม่มี `schedule` ให้ใส่ `{}`
- ลบคู่ → ลบ `logos.schedule[id]` ด้วย แล้ว `sendLogos()` · สลับลำดับคู่ → ไม่ต้องทำอะไรกับโลโก้ (ผูกด้วย id อยู่แล้ว)
- ส่งไปกับข้อความ `logos` เดิมของ SPEC (ไม่มีข้อความใหม่)

### 4.4 กฎที่ control ต้องบังคับ

1. **"คู่ถัดไป" มีได้คู่เดียว** — ตั้งคู่ไหนเป็น `next` คู่อื่นที่เป็น `next` กลับเป็น `upcoming` อัตโนมัติ · **"กำลังแข่ง" ก็มีได้คู่เดียว** เช่นกัน
2. `matches` มีอย่างน้อย 1 คู่ สูงสุด `ValoLobby.MAX_MATCHES` (6)
3. **merge กับค่าเริ่มต้น (SPEC 9.9):** ถ้า state ที่บันทึกไว้ไม่มี `lobby` ให้ใช้ `makeDefaultLobby()` · ถ้ามี `lobby.matches` เป็นอาร์เรย์ ให้ใช้ของที่บันทึกไว้ทั้งก้อน (**ห้าม** merge ทีละ index กับ 2 คู่ตัวอย่าง)
4. **ปุ่ม "แมพใหม่" / "แมตช์ใหม่" ของ SPEC ห้ามแตะ `state.lobby`** — ถ้าเขียนรีเซ็ตด้วยการเรียก `makeDefaultState()` ต้องก๊อป `lobby` เดิมกลับเข้าไป
5. ทุกการแก้หน้ารอผ่าน `commit()` เดิม → Undo ได้, บันทึกอัตโนมัติ, ส่งให้ overlay อัตโนมัติ · การเดินของตัวนับไม่นับเป็น Undo

---

## 5. ข้อความและการซิงก์

ไม่มี type ใหม่ ใช้ `play` เดิมของ SPEC เพิ่ม `anim` ชนิดใหม่:

| `type` | `payload` | ส่งเมื่อ |
|---|---|---|
| `play` | `{ anim: 'golive', holdMs, endsAt }` | กด "เข้าไลฟ์เลย" หรือ control ตรวจเจอว่าหมดเวลา (`endsAt` = `countdown.endsAt` ขณะนั้น หรือ 0) |

### 5.1 ลำดับการส่งตอนเข้าไลฟ์ (ฟังก์ชัน `goLive(source)` ใน lobby-control.js)

```js
function goLive(source) {            // source = 'manual' | 'auto'
  var st = ctx.getState();
  if (!st.lobby.visible || goingLive) return;
  goingLive = true;
  var c = st.lobby.countdown;
  // 1) ส่งคำสั่งแอนิเมชันก่อน
  ctx.link.send('play', { anim: 'golive', holdMs: st.lobby.goLiveHoldMs, endsAt: c.running ? c.endsAt : 0 });
  // 2) แล้วค่อยแก้ state — แยก 2 commit ตั้งใจ:
  //    commit แรกหยุดตัวนับโดยไม่เก็บ Undo → จุดที่ Undo ย้อนกลับไปคือ "หน้ารอโชว์ + ตัวนับหยุดแล้ว"
  //    (ถ้ารวมเป็น commit เดียว กด Ctrl+Z แล้วตัวนับจะกลับมาเดินที่ 0 → เข้าไลฟ์อัตโนมัติซ้ำทันที)
  //    ทั้งสอง commit อยู่ในฟังก์ชันเดียวกัน → scheduleSend รวบส่ง state ครั้งเดียวในเฟรมถัดไป
  ctx.commit(function (s) { ValoLobby.lobbyStop(s.lobby.countdown, Date.now()); }, { undo: false });
  ctx.commit(function (s) { s.lobby.visible = false; });
  ctx.toast(source === 'auto' ? 'หมดเวลา — เข้าไลฟ์แล้ว 🚀' : 'เข้าไลฟ์แล้ว 🚀');
  setTimeout(function () { goingLive = false; }, ValoLobby.goLiveTotalMs(st.lobby.goLiveHoldMs));
}
```

> ⚠️ ห้ามเปลี่ยน `scheduleSend` ของ SPEC ให้ส่งทันทีทุก commit — ถ้าส่งแยก 2 ครั้ง overlay อาจเห็นจังหวะ "หน้ารอโชว์ + ตัวนับหยุด" แวบหนึ่งแล้วเอาหน้ารอกลับมา

### 5.2 เข้าไลฟ์อัตโนมัติ — ทำ 2 ชั้นกันพลาด

**ชั้นที่ 1 (control):** `setInterval` ทุก 250 ms → ถ้า `ValoLobby.shouldAutoGoLive(state.lobby, Date.now())` → `goLive('auto')` (ใช้ setInterval ไม่ใช้ requestAnimationFrame เพราะ rAF หยุดเมื่อหน้าต่างถูกบัง/ย่อ)

**ชั้นที่ 2 (overlay สำรอง):** Chrome หน่วงตัวจับเวลาของแท็บที่ถูกย่อนานเกิน 5 นาที (ช้าได้ถึง 1 นาที) ดังนั้น overlay ต้องเข้าไลฟ์เองได้ด้วย:

- ใน `tick()` ของ overlay: ถ้า หน้ารอกำลังโชว์ และ `autoGoLive` และ `countdown.running` และ **รอบก่อนเหลือ > 0 แต่รอบนี้ = 0** → เล่นแอนิเมชันเข้าไลฟ์เองทันที และจำ `localLiveEndsAt = countdown.endsAt`
- `prevRemaining` เริ่มเป็น `null` ตอนโหลดหน้า → **รีเฟรช overlay หลังหมดเวลาแล้วจะไม่เล่นซ้ำ**
- กฎการโชว์หน้ารอใน overlay:
  ```js
  var shouldShow = lobby.visible && !(lobby.countdown.running && lobby.countdown.endsAt === localLiveEndsAt);
  ```
  (ถ้า control ช้า state ยังบอก visible อยู่ overlay ก็ไม่เอาหน้ารอกลับมา)

### 5.3 กฎฝั่ง overlay (กันเล่นซ้ำ/กันตัดแอนิเมชัน)

1. กำลังเล่นแอนิเมชันเข้าไลฟ์อยู่ (`goliveBusy`) → **ไม่สนใจ** `play golive` ที่มาซ้ำ และ **ไม่ซ่อนหน้ารอตาม state** (แอนิเมชันจะซ่อนเองตอนจบ)
2. ได้ `play golive` แต่หน้ารอไม่ได้โชว์อยู่ → ไม่ทำอะไร
3. ได้ `play golive` ที่ `payload.endsAt !== 0 && payload.endsAt === localLiveEndsAt` → ไม่ทำอะไร (overlay เข้าไลฟ์เองไปแล้ว)
4. state เปลี่ยน `visible: true → false` ขณะไม่มีแอนิเมชัน → **รอ 150 ms ก่อน** ค่อย fade-out (ถ้าระหว่างนั้น `play golive` มาถึง ให้เล่นแอนิเมชันแทน) — กันกรณีข้อความมาสลับลำดับ
5. state เปลี่ยน `visible: false → true` → แอนิเมชันโชว์หน้ารอ (6.4) · ใช้ Undo หลังเข้าไลฟ์ = หน้ารอกลับมา

---

## 6. หน้าจอ overlay: หน้ารอ

### 6.1 ผังจอ 1920×1080 (ค่าเริ่มต้น — ปรับใน theme.css)

```
x=0         x=160                    x=760  x=860                                         x=1840 x=1920
┌──────────────────────────────────────────────────────────────────────────────────────────────┐ y=0
│                                            ตารางการแข่งขันวันนี้                              │ y=140
│        ┌──────────────────────┐            ─────────────                                     │
│        │                      │            ┌───────────────────────────────────────────┐NEXT │ y=220
│        │                      │            │ 13:00 │ TEAM ALPHA [🛡] │ VS │ [🛡] TEAM BRAVO │     │ 110px
│        │      โลโก้งาน         │            │ BO3   │                 │    │                 │     │
│        │      520×520         │            └───────────────────────────────────────────┘     │
│        │   (กึ่งกลาง 420,430)  │            ┌───────────────────────────────────────────┐     │ +18px
│        │                      │            │ 15:00 │ TEAM CHARLIE[🛡]│ VS │[🛡] TEAM DELTA  │     │
│        └──────────────────────┘            └───────────────────────────────────────────┘     │
│         VALORANT CUP 2026  (56px)          (4 คู่ขึ้นไป การ์ดเตี้ยลงเหลือ 84px ห่าง 12px)      │ y≈730
│              DAY 1  (28px)                                                                   │ y≈800
│                                       เริ่มไลฟ์ใน  (26px)                                      │ y=845
│                                         29:41    (130px)                                     │ y=875
│                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤ y=1036
│ ◀◀ ติดตามเพจ ... ข้อความวิ่ง (ถ้ามี) ...                                                       │ 44px
└──────────────────────────────────────────────────────────────────────────────────────────────┘ y=1080
```

- 6 คู่แบบเตี้ย: 6×84 + 5×12 = 564px → การ์ดสิ้นสุดที่ y ≈ 784 ไม่ชนตัวนับถอยหลัง
- z-index: แถบสกอร์/ผู้เล่น = 10 · **หน้ารอ = 50** · แอนิเมชันเปลี่ยนแมตช์ (SPEC) = 100 · ป้ายดีบัก = 200

### 6.2 โครงสร้าง HTML (สร้างด้วย JS ใน `ValoLobbyOverlay.init`)

```html
<div id="lobby" class="lobby" aria-hidden="true">          <!-- ซ่อนด้วย display:none เมื่อไม่ใช้ -->
  <div class="lb-half lb-half--l"></div>                    <!-- พื้นหลังครึ่งซ้าย (แยกออกตอนเข้าไลฟ์) -->
  <div class="lb-half lb-half--r"></div>                    <!-- พื้นหลังครึ่งขวา -->
  <div class="lb-content">
    <div class="lb-brand">
      <div class="lb-logo"><img alt=""><span class="lb-logo-fallback"></span></div>
      <div class="lb-event">VALORANT CUP 2026</div>
      <div class="lb-tagline">DAY 1</div>
    </div>
    <div class="lb-schedule">
      <div class="lb-title">ตารางการแข่งขันวันนี้</div>
      <div class="lb-cards"></div>
    </div>
    <div class="lb-countdown">
      <div class="lb-cd-label">เริ่มไลฟ์ใน</div>
      <div class="lb-cd-time">30:00</div>
      <div class="lb-cd-zero" hidden>กำลังจะเริ่ม…</div>
    </div>
    <div class="lb-ticker" hidden><div class="lb-ticker-track"><span></span></div></div>
  </div>
</div>
```

**การ์ด 1 คู่:**

```html
<div class="lb-card" data-id="m1abc" data-status="next">
  <div class="lb-when"><span class="lb-time">13:00</span><span class="lb-note">BO3</span></div>
  <div class="lb-team lb-team--A">
    <span class="lb-team-name">TEAM ALPHA</span>
    <span class="lb-team-logo"><img alt=""><i class="lb-team-fallback">AL</i></span>
  </div>
  <div class="lb-mid"><span class="lb-vs">VS</span><span class="lb-score">2 : 1</span></div>
  <div class="lb-team lb-team--B">
    <span class="lb-team-logo"><img alt=""><i class="lb-team-fallback">BR</i></span>
    <span class="lb-team-name">TEAM BRAVO</span>
  </div>
  <span class="lb-badge"></span>
</div>
```

- พื้นหลังสองครึ่ง: ทั้งคู่ใช้ `background: var(--lobby-bg) var(--lobby-bg-image) no-repeat; background-size: 1920px 1080px;` ครึ่งซ้าย `background-position: 0 0` ครึ่งขวา `background-position: -960px 0` → ต่อกันเนียนเป็นรูปเดียว
- ลายเส้นเฉียง: `repeating-linear-gradient(-45deg, var(--lobby-stripes) 0 2px, transparent 2px 24px)` เลื่อนช้า ๆ วนไปเรื่อย ๆ (30 วิ/รอบ) ใส่ในทั้งสองครึ่ง
- **สร้างการ์ดใหม่เฉพาะตอนรายการ id เปลี่ยน** (จำนวน/ลำดับ — เทียบด้วย `matches.map(m => m.id).join()`) · นอกนั้นอัปเดตข้อความ/คลาสในที่เดิม

### 6.3 กติกาการแสดงผล

| ส่วน | กติกา |
|---|---|
| โลโก้งาน | `logos.event` · ไม่มี → ตัวอักษรย่อของ `eventName` ตัวใหญ่ในกรอบ · ขนาดไม่เกิน `--lobby-logo-size` รักษาสัดส่วน |
| ชื่องาน/บรรทัดรอง | ว่าง → ซ่อนบรรทัดนั้น |
| การ์ด: เวลา | `time` ตามที่พิมพ์ (`13:00`) · ว่าง → `--:--` |
| การ์ด: ทีม | ชื่อเต็มยาวเกิน → `…` · โลโก้จาก `logos.schedule[id].A/B` · ไม่มี → กล่องตัวย่อ (`tag` หรือ 2 ตัวแรกของชื่อ) |
| การ์ด: กลาง | `upcoming/next/live` → `VS` · `done` → `scoreA : scoreB` และชื่อทีมที่ชนะสว่าง ทีมแพ้จาง |
| ป้ายสถานะ | `next` → `NEXT` + ขอบซ้าย 6px สี `--lobby-card-next` + พื้นสว่างขึ้นเล็กน้อย · `live` → `● LIVE` จุดกะพริบ สี `--lobby-card-live` · `done` → `FINAL` + การ์ดจาง (opacity .55) · `upcoming` → ไม่มีป้าย |
| ข้อความป้าย | ค่าคงที่ใน lobby-overlay.js: `var BADGE = { next: 'NEXT', live: 'LIVE', done: 'FINAL' }` (แก้เป็นไทยได้ที่นี่) |
| การ์ดเตี้ย | `matches.length >= 4` → ใส่คลาส `.is-compact` ที่ `.lb-cards` ใช้ `--lobby-card-height-compact` และฟอนต์เล็กลง 15% |
| นับถอยหลัง | `formatLong(lobbyRemaining(c, Date.now()+skew))` อัปเดตใน `tick()` เขียน DOM เฉพาะตอนข้อความเปลี่ยน · ตัวเลขใช้ `tabular-nums` |
| เหลือ ≤ 60 วิ | ตัวเลขเต้นเบา ๆ (scale 1 → 1.04 ทุกวินาที) |
| เหลือ ≤ 10 วิ | ตัวเลขสี `--c-stripe` |
| ถึง 0 | ซ่อน `.lb-cd-time` โชว์ `.lb-cd-zero` (`zeroText`) — ถ้า `autoGoLive` เปิดอยู่จะเห็นแค่แวบเดียวก่อนแอนิเมชันเริ่ม |
| ยังไม่กดเริ่ม | โชว์ `remainingMs` ค้างไว้ (เช่น `30:00`) |
| ข้อความวิ่ง | `ticker` ไม่ว่าง → โชว์แถบ ข้อความเลื่อนขวาไปซ้ายวนไม่หยุด ความเร็วคงที่ ~120 px/วิ (ระยะเวลา = (1920 + ความกว้างข้อความ) / 120 วิ คำนวณด้วย JS แล้วตั้ง `animation-duration`) |

### 6.4 แอนิเมชันเปิด/ปิดหน้ารอ (ไม่ใช่เข้าไลฟ์)

| เหตุการณ์ | แอนิเมชัน |
|---|---|
| เปิดหน้ารอ | เลเยอร์ fade-in 500ms → โลโก้ scale 0.9→1 + fade (600ms, ดีเลย์ 100ms) → หัวตาราง + การ์ดเลื่อนเข้าจากขวาทีละใบ ห่าง 90ms (เริ่มที่ 250ms) → ตัวนับเลื่อนขึ้น+fade (400ms, ดีเลย์ 400ms) → ข้อความวิ่ง fade-in |
| ปิดหน้ารอแบบธรรมดา (กด `L` ซ้ำ) | ทั้งเลเยอร์ fade-out 400ms แล้ว `display:none` |
| เพิ่ม/ลบ/สลับคู่ ขณะโชว์อยู่ | การ์ดใหม่ fade-in 300ms (ไม่ต้องเล่นแอนิเมชันเข้าทั้งชุดใหม่) |
| สถานะคู่เปลี่ยน | ป้ายเด้ง scale 0.6→1 (250ms) |

### 6.5 `css/lobby.css`

- ใช้ตัวแปรจาก theme.css อย่างเดียว ห้าม hardcode สี/ขนาด
- `#lobby` : `position:absolute; inset:0; z-index:50; display:none;` · `.is-shown` → `display:block` · `.is-entering` / `.is-leaving` / `.is-golive` → คลาสแอนิเมชัน
- เวลาในแอนิเมชันเข้าไลฟ์ใช้ตัวแปรที่ JS ตั้ง: `--golive-close`, `--golive-logo`, `--golive-hold`, `--golive-open` และ `animation-delay: calc(var(--golive-close) + var(--golive-logo))` ฯลฯ → ทีมดีไซน์แก้จังหวะใน CSS ได้

### 6.6 ต่อท้าย `css/theme.css`

```css
/* ===================== หน้ารอเข้าไลฟ์ (LOBBY.md) ===================== */
:root {
  --lobby-bg: #0f1923;
  --lobby-bg-image: none;                    /* เช่น url("../assets/ui/lobby-bg.jpg") ขนาด 1920x1080 */
  --lobby-stripes: rgba(255, 255, 255, 0.025);

  /* โลโก้ + ชื่องาน (ฝั่งซ้าย) */
  --lobby-logo-size: 520px;
  --lobby-logo-cx: 420px;                    /* จุดกึ่งกลางโลโก้ แนวนอน */
  --lobby-logo-cy: 430px;                    /* จุดกึ่งกลางโลโก้ แนวตั้ง */
  --lobby-event-size: 56px;
  --lobby-tagline-size: 28px;

  /* ตาราง (ฝั่งขวา) */
  --lobby-schedule-left: 860px;
  --lobby-schedule-top: 140px;
  --lobby-schedule-width: 980px;
  --lobby-title-size: 40px;
  --lobby-card-height: 110px;
  --lobby-card-height-compact: 84px;         /* ใช้เมื่อ 4 คู่ขึ้นไป */
  --lobby-card-gap: 18px;
  --lobby-card-gap-compact: 12px;
  --lobby-card-bg: rgba(27, 39, 51, 0.92);
  --lobby-card-next: #ff4655;
  --lobby-card-live: #ff4655;
  --lobby-time-size: 40px;
  --lobby-team-size: 30px;
  --lobby-team-logo: 64px;

  /* นับถอยหลัง (กลางล่าง) */
  --lobby-countdown-top: 845px;
  --lobby-countdown-size: 130px;
  --lobby-countdown-label-size: 26px;

  /* ข้อความวิ่ง */
  --lobby-ticker-height: 44px;
  --lobby-ticker-bg: #ff4655;
  --lobby-ticker-color: #0f1923;
  --lobby-ticker-size: 22px;
}
```

### 6.7 จุดที่ `js/overlay.js` ต้องเรียก `ValoLobbyOverlay`

```js
// js/lobby-overlay.js ต้องเปิดให้ใช้แบบนี้
window.ValoLobbyOverlay = {
  init: function (stageEl) {},              // สร้าง DOM หน้ารอใส่ใน #stage
  render: function (state) {},              // อัปเดตข้อความ/การ์ด/การโชว์-ซ่อน (กฎ 5.2–5.3)
  applyLogos: function (logos) {},          // โลโก้งาน + โลโก้ในตาราง
  tick: function (now) {},                  // ตัวนับถอยหลัง + เข้าไลฟ์อัตโนมัติชั้นที่ 2
  playGoLive: function (payload) {},        // จาก play { anim: 'golive' }
  isBusy: function () { return false; }     // true ระหว่างเล่นแอนิเมชันเข้าไลฟ์
};
```

| จุดใน overlay.js (SPEC 8.8) | เพิ่ม |
|---|---|
| `init()` หลังสร้าง DOM แถบผู้เล่น | `ValoLobbyOverlay.init(document.getElementById('stage'))` |
| ท้าย `applyState(s)` | `ValoLobbyOverlay.render(s)` |
| ท้าย `applyLogos(l)` | `ValoLobbyOverlay.applyLogos(l)` |
| `handleMessage` กรณี `play` | `if (p.anim === 'golive') ValoLobbyOverlay.playGoLive(p); else playTransition(p);` |
| `tick()` | `ValoLobbyOverlay.tick(Date.now() + skew)` |

---

## 7. แอนิเมชันเข้าไลฟ์ (Go Live)

### 7.1 ไทม์ไลน์

ใช้ค่าจาก `ValoLobby.GOLIVE` (`closeMs` 600, `logoMs` 800, `openMs` 700) + `holdMs` (ค่าเริ่มต้น 1000) → รวม **3.1 วินาที** (`goLiveTotalMs(1000) === 3100`)

| เวลา (ms) | ช่วง | สิ่งที่เกิด |
|---|---|---|
| 0 → 600 | **ปิดตาราง** | การ์ดเลื่อนออกไปทางขวา (`translateX(140px)` + fade) ไล่จากใบล่างขึ้นใบบน ห่างใบละ 70ms · หัวตาราง, ตัวนับ, ข้อความวิ่ง, ชื่องาน, บรรทัดรอง fade-out ลงล่าง 20px |
| 600 → 1400 | **โลโก้วิ่งมากลางจอ** | โลโก้เลื่อนจากตำแหน่งเดิมไปกึ่งกลางจอ (960, 540) และขยาย 1 → 1.2 (ease-in-out) · ลายเส้นพื้นหลังเร่งความเร็วขึ้น |
| 1400 → 1400+hold | **ค้าง** | โลโก้ค้างกลางจอ + วงแสงสีแดงขยายออกจากโลโก้ 1 ครั้ง + เรืองหายใจเบา ๆ |
| +0 → +700 | **ม่านเปิด** | พื้นหลังครึ่งซ้ายเลื่อนออกซ้าย ครึ่งขวาเลื่อนออกขวา (`--ease-in`) เห็นภาพเกม+แถบสกอร์ข้างหลัง · โลโก้ขยาย 1.2 → 2.2 และจางหายภายใน 500ms แรก |
| จบ | **รีเซ็ต** | `#lobby` → `display:none` · ลบคลาสแอนิเมชันทั้งหมด · ล้างตัวแปร transform → ครั้งหน้าเปิดหน้ารอใหม่จะสะอาด |

### 7.2 วิธีทำ: โลโก้วิ่งมากลางจอ

คำนวณระยะตอนเริ่มแอนิเมชัน (เทคนิค FLIP):

```js
var stage = document.getElementById('stage').getBoundingClientRect();
var r = logoEl.getBoundingClientRect();
var dx = (stage.left + stage.width / 2) - (r.left + r.width / 2);
var dy = (stage.top + stage.height / 2) - (r.top + r.height / 2);
lobbyEl.style.setProperty('--lb-logo-dx', dx + 'px');
lobbyEl.style.setProperty('--lb-logo-dy', dy + 'px');
```

แล้วใน CSS ช่วง `.is-golive` ให้ `.lb-logo` ทำ keyframes ไปที่ `transform: translate(var(--lb-logo-dx), var(--lb-logo-dy)) scale(1.2)` · ใช้ `animation-fill-mode: forwards` ทุกช่วงให้ค้างท่าสุดท้าย

### 7.3 ลำดับ JS ใน `playGoLive(payload)`

```text
1. ถ้า busy หรือหน้ารอไม่ได้โชว์ หรือ (payload.endsAt !== 0 && payload.endsAt === localLiveEndsAt) → return
2. busy = true · ยกเลิก timer ซ่อนหน้ารอที่ค้างอยู่ (กฎ 5.3 ข้อ 4)
3. ตั้งตัวแปร --golive-close/--golive-logo/--golive-hold/--golive-open จาก ValoLobby.GOLIVE + payload.holdMs
4. คำนวณ --lb-logo-dx/dy (7.2)
5. ลบคลาส .is-entering/.is-leaving → void el.offsetWidth → ใส่ .is-golive
6. setTimeout(goLiveTotalMs(holdMs)) → ซ่อน #lobby, ลบคลาส, ล้างตัวแปร, busy = false
```

### 7.4 กรณีพิเศษ

- **กด `T` (แอนิเมชันเปลี่ยนแมตช์) ระหว่างหน้ารอโชว์:** เล่นได้ปกติ อยู่ชั้นบนหน้ารอ จบแล้วหน้ารอยังอยู่
- **รีเฟรช overlay ระหว่างเล่นแอนิเมชันเข้าไลฟ์:** แอนิเมชันหายไป → ได้ state `visible:false` → หน้ารอไม่โชว์ (ถูกต้อง)
- **ไม่มีโลโก้งาน:** ใช้กล่องตัวอักษรย่อแทน แอนิเมชันเหมือนเดิม
- **`holdMs = 0`:** ข้ามช่วงค้าง โลโก้ถึงกลางแล้วม่านเปิดทันที

---

## 8. หน้าคอนโทรล: แท็บหน้ารอเข้าไลฟ์

### 8.1 แท็บ + แถบสถานะ

- ใต้แถบบนสุดของ control เพิ่มแท็บ 2 อัน: **[🎮 ควบคุมการแข่ง]** (ของเดิมทั้งหมดใน SPEC) และ **[🕒 หน้ารอเข้าไลฟ์]**
- **ปุ่มลัดทุกตัวทำงานไม่ว่าอยู่แท็บไหน**
- จำแท็บล่าสุดไว้ใน `localStorage` key `valo.ui.tab`
- แถบบนสุดเพิ่มป้ายสถานะหน้ารอ (เห็นทุกแท็บ): `หน้ารอ: ● แสดงอยู่ · 12:34` (เขียวเมื่อแสดง เทาเมื่อปิด) + ปุ่มเล็ก **[🚀 เข้าไลฟ์]** (โชว์เฉพาะตอนหน้ารอแสดงอยู่)

### 8.2 ผังแท็บหน้ารอ

```
┌─ 🕒 หน้ารอเข้าไลฟ์ ─────────────────────────────────────────────────────────────────────────┐
│ [👁 เปิดหน้ารอ (L)]   สถานะ: ● กำลังแสดงบนไลฟ์                  [🚀 เข้าไลฟ์เลย (G)]          │
├────────────────────────────────────┬─────────────────────────────────────────────────────────┤
│ ข้อความบนจอ                          │ นับถอยหลัง                                                │
│ ชื่องาน        [VALORANT CUP 2026  ] │                  29:41                                    │
│ บรรทัดรอง      [DAY 1               ] │ ◉ นับ [ 30 ] นาที    ○ นับถึงเวลา [19:00]   [✓ ตั้งค่า]     │
│ หัวตาราง       [ตารางการแข่งขันวันนี้] │ [▶ เริ่มนับ]  [⏸ หยุด]  [↺ ตั้งใหม่]                        │
│ ป้ายเหนือเวลา   [เริ่มไลฟ์ใน          ] │ ปรับเวลา  [−5] [−1] [+1] [+5] นาที                          │
│ ข้อความตอนหมด  [กำลังจะเริ่ม…        ] │ ☑ หมดเวลาแล้วเข้าไลฟ์อัตโนมัติ                               │
│ ข้อความวิ่ง     [ติดตามเพจ ...       ] │ โลโก้ค้างกลางจอ [1.0] วินาที                                 │
│ โลโก้งาน [🖼 เปลี่ยน] (ใช้ร่วมกับแอนิเมชันเปลี่ยนแมตช์)                                             │
├────────────────────────────────────┴─────────────────────────────────────────────────────────┤
│ ตารางการแข่งขัน (สูงสุด 6 คู่)                                                                   │
│ #  เวลา     ทีม A                          ทีม B                          หมายเหตุ   สถานะ        │
│ 1 [13:00] [🖼][คลัง ▼][TEAM ALPHA  ]  VS  [🖼][คลัง ▼][TEAM BRAVO  ]  [BO3    ] [คู่ถัดไป ▼] ↑ ↓ ✕ │
│ 2 [15:00] [🖼][คลัง ▼][TEAM CHARLIE]  VS  [🖼][คลัง ▼][TEAM DELTA  ]  [BO3    ] [กำลังจะแข่ง▼] ↑ ↓ ✕ │
│ [+ เพิ่มคู่]   [⇢ ใช้ทีม A/B ปัจจุบันเป็นคู่แรก]                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 ปุ่มและช่องทั้งหมด

| ปุ่ม/ช่อง | การทำงาน |
|---|---|
| 👁 เปิด/ปิดหน้ารอ (`L`) | สลับ `lobby.visible` · ป้ายบนปุ่มเปลี่ยนเป็น "ปิดหน้ารอ" เมื่อเปิดอยู่ |
| 🚀 เข้าไลฟ์เลย (`G`) | `goLive('manual')` (5.1) · ใช้ได้เฉพาะตอนหน้ารอแสดงอยู่ (ไม่งั้นปุ่มจาง) · **ไม่ถามยืนยัน** (ต้องเร็ว) — กดพลาดใช้ Ctrl+Z ได้ |
| ช่องข้อความทั้ง 6 ช่อง | พิมพ์แล้วขึ้นบน overlay ทันที (debounce 120ms) · Undo เก็บครั้งเดียวตอนเริ่มพิมพ์ |
| โหมดนับ: นับ X นาที | ช่องตัวเลข 1–600 (ค่าเริ่มต้น 30) → กด "ตั้งค่า" → `lobbySetDuration(c, minutes)` (หยุดรอ ต้องกดเริ่มเอง) |
| โหมดนับ: นับถึงเวลา | `<input type="time">` → กด "ตั้งค่า" → `lobbySetTarget(c, 'HH:MM', Date.now())` → ถ้าได้ `false` toast แดง *"เวลานี้ผ่านไปแล้ว หรือรูปแบบไม่ถูก (ถ้าข้ามเที่ยงคืนให้ใช้โหมดนับนาที)"* และไม่เปลี่ยนอะไร · ถ้าได้ `true` เดินทันที |
| ▶ เริ่มนับ / ⏸ หยุด | `lobbyStart` / `lobbyStop` |
| ↺ ตั้งใหม่ | `lobbyReset` (กลับไปค่าที่ตั้งไว้ หยุดรอ) |
| −5 / −1 / +1 / +5 | `lobbyAdjust(c, ±n, Date.now())` ใช้ได้ทั้งตอนเดินและหยุด (ไว้เลื่อนเวลาเมื่อทีมมาช้า) |
| ☑ เข้าไลฟ์อัตโนมัติ | `autoGoLive` |
| โลโก้ค้างกลางจอ | 0–5 วินาที ทีละ 0.5 → เก็บเป็น ms ใน `goLiveHoldMs` |
| โลโก้งาน | ตัวเดียวกับ `logos.event` ของ SPEC (เปลี่ยนที่ไหนก็เปลี่ยนทั้งสองที่) |
| ตัวเลขนับถอยหลังใหญ่ในหน้าคอนโทรล | เดินจริงพร้อม overlay (อัปเดตด้วย rAF) |

### 8.4 ตัวแก้ตาราง

| ช่อง | การทำงาน |
|---|---|
| เวลา | `<input type="time">` (24 ชม.) |
| 🖼 โลโก้ทีม | คลิก/ลากไฟล์มาวาง → ย่อ 128×128 → `logos.schedule[id].A` (หรือ `.B`) → `sendLogos()` · มี ✕ ลบโลโก้ |
| คลัง ▼ | dropdown ทีมจากคลังทีม (SPEC 9.9) → เลือกแล้วใส่ `name`, `tag`, `libId` + ก๊อปโลโก้จากคลังย่อเหลือ 128 มาใส่ `logos.schedule` |
| ชื่อทีม | พิมพ์เองได้ ≤ 32 ตัว |
| หมายเหตุ | ≤ 30 ตัว |
| สถานะ ▼ | กำลังจะแข่ง / คู่ถัดไป / กำลังแข่ง / จบแล้ว — บังคับกฎ 4.4 ข้อ 1 · เลือก "จบแล้ว" → โชว์ช่องคะแนน `[2] : [1]` ข้างหลัง dropdown |
| ↑ ↓ | `ValoLobby.moveMatch(list, i, -1 / +1)` (ปุ่มจางเมื่อขยับไม่ได้) |
| ✕ | ลบคู่ (ถามยืนยัน) · เหลือคู่สุดท้ายลบไม่ได้ · ลบโลโก้ใน `logos.schedule[id]` ด้วย |
| + เพิ่มคู่ | `ValoLobby.makeMatch()` ต่อท้าย · เวลาเริ่มต้น = เวลาของคู่สุดท้าย + 2 ชม. (ถ้าคำนวณได้) · จางเมื่อครบ 6 |
| ⇢ ใช้ทีม A/B ปัจจุบันเป็นคู่แรก | ก๊อปชื่อ/ชื่อย่อ/โลโก้ของ `teams.A`, `teams.B` ไปใส่คู่ที่ 1 และตั้งเป็น "คู่ถัดไป" |

### 8.5 ปุ่มลัดที่เพิ่ม

| ปุ่ม | ผล |
|---|---|
| `L` | เปิด/ปิดหน้ารอ |
| `G` | เข้าไลฟ์เลย (เฉพาะตอนหน้ารอแสดงอยู่) |

ไม่ชนกับปุ่มลัดเดิมของ SPEC (Space, B, R, P, 1, 2, T, S, H, ?, Ctrl+Z) · เงื่อนไขเดิม: ไม่ทำงานตอนพิมพ์อยู่ในช่องข้อความหรือหน้าต่างเลือกเปิดอยู่ · เพิ่มทั้งสองตัวในหน้าช่วยเหลือ `?`

### 8.6 `js/lobby-control.js` — โครง

```js
window.ValoLobbyControl = {
  // ctx มาจาก control.js:
  // { getState, commit, getLogos, saveLogos, sendLogos, link, toast, resizeImage(file, max) -> Promise<dataURL>,
  //   getLibrary, containerEl }
  init: function (ctx) {},       // สร้าง DOM แท็บหน้ารอ + ผูก event + setInterval(250) ตรวจเข้าไลฟ์อัตโนมัติ
  render: function (state) {},   // อัปเดตช่องต่าง ๆ ตาม state (อย่าทับช่องที่กำลังพิมพ์อยู่)
  tick: function (now) {},       // ตัวเลขนับถอยหลังในหน้าคอนโทรล + ป้ายสถานะบนแถบบน
  goLive: function (source) {},  // หัวข้อ 5.1
  toggleVisible: function () {}  // ปุ่ม L
};
```

### 8.7 ข้อความแจ้งเตือนที่เพิ่ม

| เมื่อไหร่ | toast |
|---|---|
| เข้าไลฟ์อัตโนมัติ | "หมดเวลา — เข้าไลฟ์แล้ว 🚀" |
| กดเข้าไลฟ์ | "เข้าไลฟ์แล้ว 🚀" |
| เหลือ 5 นาที (ครั้งเดียว) | "อีก 5 นาทีเข้าไลฟ์ — เตรียมภาพเกมและแถบสกอร์ให้พร้อม" |
| เหลือ 1 นาที (ครั้งเดียว) | "อีก 1 นาทีเข้าไลฟ์" |
| ตั้งเวลาเป้าหมายไม่ได้ | ข้อความในตาราง 8.3 |
| กด `G` ตอนหน้ารอปิดอยู่ | "หน้ารอไม่ได้เปิดอยู่" |

### 8.8 จุดที่ `js/control.js` ต้องแก้

1. `buildUI()` → สร้างแท็บ 2 อัน แล้ว `ValoLobbyControl.init({...ctx})` ใส่ใน container ของแท็บหน้ารอ
2. `renderAll()` → เรียก `ValoLobbyControl.render(state)` ด้วย
3. `tick()` → เรียก `ValoLobbyControl.tick(Date.now())`
4. ปุ่มลัด → `L` = `toggleVisible()`, `G` = `goLive('manual')`
5. `loadLogos()` → ค่าเริ่มต้น `{ A: null, B: null, event: null, schedule: {} }`
6. `loadState()` → merge ตามกฎ 4.4 ข้อ 3
7. ปุ่ม "แมพใหม่"/"แมตช์ใหม่" → ไม่แตะ `state.lobby` (กฎ 4.4 ข้อ 4)
8. สำรอง/นำเข้า (SPEC 9.9) → `lobby` อยู่ใน state และ `logos.schedule` อยู่ใน logos อยู่แล้ว ไม่ต้องทำอะไรเพิ่ม แต่ต้องทดสอบ (L24)
9. `scheduleSend()` → ถ้า `document.hidden` (หน้าต่าง control ถูกย่อ/อยู่หลังแท็บอื่น) ให้ใช้ `setTimeout(send, 16)` แทน `requestAnimationFrame` เพราะ rAF ไม่ทำงานในหน้าที่มองไม่เห็น → ไม่งั้น state จะไม่ถูกส่งจนกว่าจะเปิดหน้าต่างกลับมา

---

## 9. ใช้งานจริงวันแข่ง

### 9.1 ก่อนเริ่มไลฟ์ (ประมาณ 35–40 นาทีก่อน)

1. เปิด OBS → เปิด `control.html` → เช็คไฟ 🟢
2. แท็บ **🕒 หน้ารอเข้าไลฟ์** → ใส่ชื่องาน/บรรทัดรอง → ทำตารางวันนี้ (เลือกทีมจากคลัง) → ตั้งคู่แรกเป็น "คู่ถัดไป"
3. กด `L` เปิดหน้ารอ → ดูใน OBS ว่าถูกต้อง
4. ตั้งเวลา: **นับ 30 นาที** แล้วรอกด ▶ ตอนเริ่มสตรีม หรือ **นับถึงเวลา 19:00** (เดินเองทันที)
5. OBS → **Start Streaming** (คนดูเข้ามาจะเห็นหน้ารอ)
6. ถ้าใช้โหมดนับนาที → กด ▶ เริ่มนับ
7. ระหว่างรอ: ไปแท็บ 🎮 เตรียมทีม/ผู้เล่น/เอเจนต์ไว้ได้เลย (หน้ารอบังอยู่ คนดูไม่เห็น) · ทีมมาช้า → กด +5
8. ถึง 0 → **เข้าไลฟ์อัตโนมัติ** → คนดูเห็นภาพเกม + แถบสกอร์ (ถ้าเปิดไว้)

### 9.2 พักระหว่างแมตช์ (ใช้หน้ารอซ้ำ)

1. แมตช์จบ → ในตาราง ตั้งคู่ที่จบเป็น "จบแล้ว" ใส่ผล · คู่ต่อไปเป็น "คู่ถัดไป"
2. กด `L` (หน้ารอกลับมา) → นับ 10 นาที → ▶
3. ถึง 0 เข้าไลฟ์เอง หรือพร้อมก่อนกด `G`
4. (ถ้าอยากได้ลูกเล่น) หลังเข้าไลฟ์กด `T` เล่นแอนิเมชัน NEXT MATCH ต่อเลย

---

## 10. เช็คลิสต์ทดสอบ

ทดสอบต่อจาก T1–T35 ของ SPEC (ทุกข้อเดิมต้องยังผ่าน)

**การโชว์ / ข้อความ**
- [ ] L1 กด `L` → หน้ารอค่อย ๆ โผล่ทับภาพเกมทั้งจอใน OBS ตามลำดับ 6.4 · แถบสกอร์อยู่ข้างหลังมองไม่เห็น · กด `L` อีกครั้ง → fade-out หาย
- [ ] L2 แก้ชื่องาน/บรรทัดรอง/หัวตาราง/ป้ายเหนือเวลา → overlay เปลี่ยนตามทันที · เว้นว่างบรรทัดรอง → บรรทัดนั้นหาย
- [ ] L3 ข้อความวิ่ง: ใส่ข้อความ → วิ่งลื่นไม่กระตุก วนไม่หยุด · ลบข้อความ → แถบหาย

**ตาราง**
- [ ] L4 เพิ่มคู่จนครบ 6 → ปุ่มเพิ่มจาง · 4 คู่ขึ้นไปการ์ดเตี้ยลงและไม่ทับตัวนับถอยหลัง
- [ ] L5 เลือกทีมจากคลัง → ชื่อและโลโก้ขึ้นบนการ์ด · อัปโหลดโลโก้เองได้ · ไม่มีโลโก้ → กล่องตัวย่อ
- [ ] L6 ตั้งคู่ 2 เป็น "คู่ถัดไป" → คู่ 1 ที่เคยเป็นคู่ถัดไปกลายเป็น "กำลังจะแข่ง" เอง · "กำลังแข่ง" → ป้าย LIVE กะพริบ · "จบแล้ว" + ผล 2:1 → การ์ดจาง โชว์ `2 : 1` ทีมชนะสว่าง
- [ ] L7 กด ↑ ↓ → ลำดับบน overlay เปลี่ยน และโลโก้ยังอยู่กับคู่ที่ถูกต้อง
- [ ] L8 ลบคู่ → หายจาก overlay · เปิด control ใหม่ โลโก้ของคู่ที่ลบไม่ค้างใน localStorage · คู่สุดท้ายลบไม่ได้
- [ ] L9 ชื่อทีมภาษาไทยยาวมาก → ตัดด้วย `…` ไม่ล้นการ์ด

**นับถอยหลัง**
- [ ] L10 นับ 30 นาที → `30:00` → กดเริ่ม → `29:59` หลัง 1 วิ ทั้งสองจอตรงกัน
- [ ] L11 หยุด → เวลาค้าง · เริ่มต่อ → เดินต่อ · −1/+1/−5/+5 ใช้ได้ทั้งตอนเดินและหยุด ไม่ติดลบ
- [ ] L12 นับถึงเวลา: ตั้งเวลาอีก 2 นาทีข้างหน้า → เดินทันทีและเวลาถูก · ตั้งเวลาที่ผ่านไปแล้ว → toast แดง ไม่มีอะไรเปลี่ยน
- [ ] L13 ตั้ง 90 นาที → โชว์ `1:30:00`
- [ ] L14 ปิด OBS แล้วเปิดใหม่ตอนนับอยู่ → หน้ารอกลับมาพร้อมเวลาที่ถูกต้อง

**เข้าไลฟ์**
- [ ] L15 ตั้ง 1 นาที → เริ่ม → ถึง 0 แอนิเมชันเข้าไลฟ์เล่นเอง **ครั้งเดียว** ตามไทม์ไลน์ 7.1 → เห็นภาพเกม · control ขึ้น toast และป้ายสถานะเป็น "ปิด"
- [ ] L16 ทดสอบชั้นสำรอง: เปิด control → ตั้ง 1 นาที → เริ่ม → **ย่อหน้าต่าง control** (หรือปิดแท็บ control ไปเลย) → overlay ยังเข้าไลฟ์เองตรงเวลา และไม่เอาหน้ารอกลับมาเอง
- [ ] L17 ปิด "เข้าไลฟ์อัตโนมัติ" → ถึง 0 โชว์ "กำลังจะเริ่ม…" ค้างไว้จนกด `G`
- [ ] L18 กด `G` ระหว่างนับ → เข้าไลฟ์ทันที ตัวนับหยุด · กด `G` ตอนหน้ารอปิด → ไม่เกิดอะไร (มีแค่ toast)
- [ ] L19 `Ctrl+Z` หลังเข้าไลฟ์ → หน้ารอกลับมา (fade-in) ตัวนับหยุดที่ค่าตอนเข้าไลฟ์
- [ ] L20 เปลี่ยนโลโก้ค้างกลางจอเป็น 0 / 3 วินาที → แอนิเมชันสั้น/ยาวตาม · ไม่มีโลโก้งาน → ใช้กล่องตัวย่อ แอนิเมชันไม่พัง
- [ ] L21 กด `T` ตอนหน้ารอโชว์ → แอนิเมชัน NEXT MATCH เล่นทับด้านบน จบแล้วหน้ารอยังอยู่
- [ ] L22 กด `G` รัว ๆ 5 ครั้ง → แอนิเมชันเล่นครั้งเดียว

**ความทนทาน**
- [ ] L23 กด "แมพใหม่" และ "แมตช์ใหม่" → ข้อมูลหน้ารอและตารางไม่หาย
- [ ] L24 สำรองข้อมูล → แก้ตารางมั่ว ๆ → นำเข้า → ตาราง+โลโก้ในตารางกลับมาครบ
- [ ] L25 เปิด `overlay.html?demo=1&lobby=1&loop=golive` → หน้ารอโชว์ แล้วเล่นเข้าไลฟ์วนทุก 7 วิ ไม่มี error ใน Console

### 10.1 พารามิเตอร์ URL สำหรับทีมดีไซน์ (เพิ่มจาก SPEC 8.9)

| URL | ผล |
|---|---|
| `overlay.html?demo=1&lobby=1` | โชว์หน้ารอพร้อมข้อมูลตัวอย่าง 4 คู่ (มีครบทุกสถานะ), ข้อความวิ่ง, นับ 30 นาทีเดินอยู่ |
| `overlay.html?demo=1&lobby=1&loop=golive` | โชว์หน้ารอ 4 วิ → เข้าไลฟ์ → รอ 3 วิ → วนใหม่ |
| `overlay.html?demo=1&lobby=1&matches=6` | ทดสอบ 6 คู่ (การ์ดเตี้ย) |

---

## 11. แก้ปัญหา

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| กด `L` แล้วไม่มีอะไรเกิด | ยังไม่ได้เพิ่ม `lobby-state.js` / ลำดับ script ผิด | เช็คหัวข้อ 3.3 · F12 ดู Console |
| `state.lobby is undefined` | `lobby-state.js` โหลดหลัง control.js หรือก่อน state.js | ต้องอยู่ "ต่อจาก state.js และก่อน link.js" |
| หมดเวลาแล้วไม่เข้าไลฟ์ | ปิด "เข้าไลฟ์อัตโนมัติ" ไว้ / overlay ไม่ได้ต่อ | เช็คติ๊ก · เช็คไฟ OBS · กด `G` เอง |
| เข้าไลฟ์ช้าไปหลายวิ | หน้าต่าง control ถูกย่อ (Chrome หน่วงเวลา) และ overlay ชั้นสำรองไม่ทำงาน | ตรวจ L16 · ไม่ควรย่อหน้าต่าง control ระหว่างนับ |
| ม่านเปิดแล้วเห็นรอยต่อกลางจอ | รูปพื้นหลังไม่ใช่ 1920×1080 | ใช้รูป 1920×1080 พอดี และตรวจ `background-size` / `background-position` (6.2) |
| โลโก้ไม่ไปกลางจอพอดี | คำนวณ dx/dy ก่อนรูปโหลดเสร็จ / ขณะมี transform ค้าง | คำนวณใน `playGoLive` หลังลบคลาสเก่าแล้ว (7.3 ข้อ 4–5) |
| นับถึงเวลาแล้วเวลาเพี้ยน | นาฬิกาเครื่องไม่ตรง | ตั้งเวลา Windows ให้ซิงก์อัตโนมัติ (Settings → Time & language → Sync now) |
| ต้องการข้ามเที่ยงคืน | โหมดนับถึงเวลานับได้แค่วันนี้ | ใช้โหมดนับ X นาทีแทน |

---

## 12. Prompt สำหรับ AI

ทำหลังจากสร้างตาม SPEC.md ครบและผ่าน T1–T35 แล้ว

### ขั้น A — ข้อมูล

```text
อ่าน SPEC.md และ LOBBY.md ทั้งสองไฟล์ให้จบก่อน แล้ว:
1) สร้าง js/lobby-state.js โดยก๊อปโค้ดจาก LOBBY.md หัวข้อ 4.1 ตรงตัวทุกตัวอักษร ห้ามแก้
2) ต่อท้าย css/theme.css ด้วยบล็อกในหัวข้อ 6.6 (ห้ามลบของเดิม)
3) แก้ลำดับ <script> และ <link> ใน overlay.html และ control.html ตามหัวข้อ 3.3 และ 3.2
ยังไม่ต้องทำอย่างอื่น
```

### ขั้น B — หน้ารอใน overlay

```text
สร้าง js/lobby-overlay.js และ css/lobby.css ตาม LOBBY.md หัวข้อ 5, 6, 7 และ 10.1
แล้วแก้ js/overlay.js เฉพาะ 5 จุดในหัวข้อ 6.7
- ทำตามกฎหัวข้อ 3 ของ SPEC.md ทุกข้อ
- ใช้ฟังก์ชันใน window.ValoLobby (lobby-state.js) ห้ามเขียนตรรกะนับเวลาซ้ำ
- ทำเข้าไลฟ์อัตโนมัติชั้นที่ 2 และกฎกันเล่นซ้ำในหัวข้อ 5.2–5.3 ให้ครบ
- แอนิเมชันใช้ CSS keyframes + ตัวแปรเวลา --golive-* ตามหัวข้อ 6.5 และ 7
เสร็จแล้วบอกวิธีเปิด overlay.html?demo=1&lobby=1&loop=golive เพื่อดูผล
```

### ขั้น C — แท็บหน้ารอใน control

```text
สร้าง js/lobby-control.js ตาม LOBBY.md หัวข้อ 4.4, 5.1, 5.2 และ 8
แล้วแก้ js/control.js ตาม 8 ข้อในหัวข้อ 8.8 และเพิ่มสไตล์ของแท็บใน css/control.css
- ข้อความบนหน้าจอเป็นภาษาไทยตามสเปก
- ปุ่มลัด L และ G ทำงานทุกแท็บ
เสร็จแล้วบอกวิธีทดสอบคู่กับ overlay.html?debug=1 ใน Chrome
```

### ขั้น D — ตรวจงาน

```text
ตรวจโค้ดเทียบกับ LOBBY.md หัวข้อ 10 (L1–L25) และ SPEC.md หัวข้อ 13 (T1–T35) ทีละข้อ
บอกข้อที่ยังไม่ผ่านหรือไม่แน่ใจ แล้วแก้ให้ผ่าน
ห้ามแก้ js/state.js, js/link.js, js/lobby-state.js, tools/download-assets.ps1 โดยไม่บอกเหตุผลก่อน
```

---

## 13. ต่อยอดในอนาคต

| ไอเดีย | ทำยังไง |
|---|---|
| เพลงรอหยุดเองตอนเข้าไลฟ์ | ใส่เพลงเป็น Media Source ใน OBS แล้วให้ control ส่งคำสั่ง OBS WebSocket `SetInputMute` (หรือ `SetInputVolume` ค่อย ๆ ลด) ตอน `goLive()` — ต้องเพิ่มฟังก์ชันส่ง request ทั่วไปใน link.js (ตอนนี้ส่งได้แค่ BroadcastCustomEvent) |
| สลับ Scene ตอนเข้าไลฟ์ | แบบเดียวกัน ใช้ `SetCurrentProgramScene` ตอนจบแอนิเมชัน (ถ้าอยากใช้ Scene "Starting Soon" แยกที่มีกล้อง/ภาพอื่น) |
| ภาพพื้นหลังเคลื่อนไหว | ใส่ `<video autoplay muted loop>` ไฟล์ .webm ในเครื่องเป็นพื้นหลังครึ่งซ้าย/ขวา (ต้องตัดวิดีโอเป็นสองครึ่ง หรือใช้ `clip-path` แทนการแยก element) |
| ตารางทั้งทัวร์ | แท็บ "ตารางทั้งหมด" เก็บหลายวัน แล้วเลือกวันมาโชว์ |
| หน้าจอพักครึ่ง/จบงาน | ใช้เลเยอร์เดียวกัน เปลี่ยนแค่ข้อความ เช่น "พักครึ่ง 10 นาที", "ขอบคุณที่รับชม" |
