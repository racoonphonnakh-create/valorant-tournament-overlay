/* =====================================================================
   js/state.js — ข้อมูลกลาง (state) ของแถบสกอร์ + ตัวจับเวลารอบ
   ---------------------------------------------------------------------
   ใช้ร่วมกันทั้ง overlay และ control → window.ValoState
   ===================================================================== */
(function () {
  'use strict';

  var PHASES = { buy: 30000, round: 100000, spike: 45000 };   // ms
  var PHASE_LABEL = { buy: 'BUY PHASE', round: '', spike: 'SPIKE' };
  // ช่วงที่ปรับขนาดโลโก้ได้ (%)
  var LOGO_SCALE = { sbLogo: [50, 200], lobbyLogo: [50, 200], lobbyTeamLogo: [50, 200], trLogo: [50, 200] };

  function makeTeam(name, tag, side) {
    return { name: name, tag: tag, libId: '', score: 0, maps: 0, side: side };   // side: 'atk' | 'def'
  }

  // ไลน์อัพ: ทีมละ 1–7 คน (size) + โค้ช · ช่องเก็บไว้ครบ 7 เสมอ แต่โชว์แค่ size ช่องแรก
  // pid = รหัสนักแข่งในฐานข้อมูล (valo.players) · name/role/agent เป็นสำเนาไว้ให้ overlay ใช้
  var LINEUP_SIZE = 7, LINEUP_DEFAULT = 5;
  function makePlayer() { return { pid: '', name: '', role: '', agent: '' }; }
  function makeLineupTeam() {
    var players = [];
    for (var i = 0; i < LINEUP_SIZE; i++) players.push(makePlayer());
    return { size: LINEUP_DEFAULT, coach: '', players: players };
  }

  function makeDefaultState() {
    return {
      v: 1,
      scoreboard: { visible: true },
      replay: { seconds: 10, speed: 100, mute: true },
      lineup: { visible: false, title: 'STARTING LINEUP', showRole: true, showAgent: true, focus: '', A: makeLineupTeam(), B: makeLineupTeam() },   // ตั้งค่ารีเพลย์ (replay-control.js)
      result: { winner: '' },                           // '' | 'A' | 'B' — ป้ายชนะ/แพ้บนแถบสกอร์
      display: { sbLogo: 100, lobbyLogo: 100, lobbyTeamLogo: 100, trLogo: 100 },   // ขนาดโลโก้ (%) ปรับจากหน้าคอนโทรล
      teams: {
        A: makeTeam('TEAM A', 'TMA', 'atk'),
        B: makeTeam('TEAM B', 'TMB', 'def')
      },
      match: { map: '', mapNo: 1, bestOf: 3, title: 'NEXT MATCH' },
      timer: { phase: 'round', durationMs: PHASES.round, remainingMs: PHASES.round, endsAt: 0, running: false }
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // เอาค่าที่บันทึกไว้มาทับค่าเริ่มต้น · ช่องที่หายไป/ชนิดผิดใช้ค่าเริ่มต้น
  // อาร์เรย์ใช้ของที่บันทึกไว้ทั้งก้อน (ไม่ merge ทีละ index)
  function merge(def, saved) {
    if (!isObj(saved)) return def;
    Object.keys(def).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) return;
      var d = def[k], s = saved[k];
      if (isObj(d)) def[k] = merge(d, s);
      else if (Array.isArray(d)) { if (Array.isArray(s)) def[k] = s; }
      else if (typeof d === typeof s) def[k] = s;
    });
    return def;
  }

  /* ---------- ตัวจับเวลารอบ ---------- */
  function timerRemaining(t, now) {
    return t.running ? Math.max(0, t.endsAt - now) : Math.max(0, t.remainingMs);
  }
  function timerStartPhase(t, phase, now) {
    var ms = PHASES[phase] || PHASES.round;
    t.phase = phase;
    t.durationMs = ms;
    t.remainingMs = ms;
    t.endsAt = now + ms;
    t.running = true;
  }
  function timerToggle(t, now) {
    if (t.running) {
      t.remainingMs = Math.max(0, t.endsAt - now);
      t.running = false;
    } else if (t.remainingMs > 0) {
      t.endsAt = now + t.remainingMs;
      t.running = true;
    }
  }
  function timerReset(t) {
    t.phase = 'round';
    t.durationMs = PHASES.round;
    t.remainingMs = PHASES.round;
    t.endsAt = 0;
    t.running = false;
  }
  // 1:40 · 0:07 (ปัดวินาทีขึ้น)
  function formatClock(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    var r = s % 60;
    return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
  }

  // ตัวย่อสำหรับกล่องแทนโลโก้
  function initials(name, tag) {
    var t = String(tag || '').trim();
    if (t) return t.toUpperCase();
    return Array.from(String(name || '').trim()).slice(0, 2).join('').toUpperCase();
  }

  window.ValoState = {
    PHASES: PHASES, PHASE_LABEL: PHASE_LABEL, LOGO_SCALE: LOGO_SCALE,
    LINEUP_SIZE: LINEUP_SIZE, LINEUP_DEFAULT: LINEUP_DEFAULT, makePlayer: makePlayer, makeLineupTeam: makeLineupTeam,
    makeDefaultState: makeDefaultState, clone: clone, merge: merge,
    timerRemaining: timerRemaining, timerStartPhase: timerStartPhase,
    timerToggle: timerToggle, timerReset: timerReset,
    formatClock: formatClock, initials: initials
  };
})();
