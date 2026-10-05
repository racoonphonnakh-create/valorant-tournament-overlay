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
