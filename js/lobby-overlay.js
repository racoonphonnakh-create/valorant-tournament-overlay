/* =====================================================================
   js/lobby-overlay.js — วาดหน้ารอ + แอนิเมชันเข้าไลฟ์ ใน overlay
   ---------------------------------------------------------------------
   โหลดก่อน overlay.js · ตรรกะนับเวลาใช้ของ window.ValoLobby ทั้งหมด
   ===================================================================== */
(function () {
  'use strict';
  var L = window.ValoLobby;
  var S = window.ValoState;

  var BADGE = { next: 'NEXT', live: 'LIVE', done: 'FINAL' };   // แก้เป็นไทยได้ที่นี่
  var TICKER_SPEED = 120;      // px/วิ
  var ENTER_MS = 1600;         // ความยาวแอนิเมชันเปิดหน้ารอทั้งชุด
  var LEAVE_MS = 400;
  var HIDE_WAIT_MS = 150;      // รอ play golive ก่อนค่อย fade-out (กฎ 5.3 ข้อ 4)
  var GOLIVE_VARS = ['--golive-close', '--golive-logo', '--golive-hold', '--golive-open', '--lb-logo-dx', '--lb-logo-dy'];

  var stage = null, el = null, r = {};
  var lastState = null, lobby = null, logos = {};
  var shown = false, busy = false;
  var hideTimer = 0, leaveTimer = 0, enterTimer = 0;
  var prevRemaining = null, localLiveEndsAt = null;
  var cards = {}, cardsKey = null;
  var lastTime = null, zeroShown = null, lastTicker = null, lastFinal = 0;
  var FINAL_SECONDS = 10;      // นับถอยหลังตัวใหญ่เต็มจอช่วงกี่วินาทีสุดท้าย (0 = ปิด)

  function q(sel, root) { return (root || el).querySelector(sel); }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setImg(img, fallback, src) {
    if (src) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.hidden = false;
      fallback.hidden = true;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      fallback.hidden = false;
    }
  }
  // ตัวย่อชื่องาน: ตัวแรกของแต่ละคำ สูงสุด 3 ตัว
  function eventInitials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 3).map(function (w) { return Array.from(w)[0]; }).join('').toUpperCase();
  }

  /* ---------- สร้าง DOM ---------- */
  function init(stageEl) {
    stage = stageEl;
    el = document.createElement('div');
    el.id = 'lobby';
    el.className = 'lobby';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="lb-half lb-half--l"></div>' +
      '<div class="lb-half lb-half--r"></div>' +
      '<div class="lb-content">' +
        '<div class="lb-brand">' +
          '<div class="lb-logo"><img alt="" hidden><span class="lb-logo-fallback"></span></div>' +
          '<div class="lb-names"><div class="lb-event"></div><div class="lb-tagline"></div></div>' +
        '</div>' +
        '<div class="lb-schedule">' +
          '<div class="lb-title"></div>' +
          '<div class="lb-cards"></div>' +
        '</div>' +
        '<div class="lb-countdown">' +
          '<div class="lb-cd-label"></div>' +
          '<div class="lb-cd-time"></div>' +
          '<div class="lb-cd-zero" hidden></div>' +
        '</div>' +
        '<div class="lb-ticker" hidden><div class="lb-ticker-track"><span></span></div></div>' +
        '<div class="lb-final"><span></span></div>' +
        '<div class="lb-flash"></div>' +
      '</div>';
    stage.appendChild(el);
    r.logo = q('.lb-logo');
    r.logoImg = q('.lb-logo img');
    r.logoFb = q('.lb-logo-fallback');
    r.event = q('.lb-event');
    r.tagline = q('.lb-tagline');
    r.title = q('.lb-title');
    r.cards = q('.lb-cards');
    r.cdLabel = q('.lb-cd-label');
    r.cdTime = q('.lb-cd-time');
    r.cdZero = q('.lb-cd-zero');
    r.ticker = q('.lb-ticker');
    r.tickerTrack = q('.lb-ticker-track');
    r.finalNum = q('.lb-final span');
    r.flash = q('.lb-flash');
    r.tickerText = q('.lb-ticker-track span');
    // ฟอนต์โหลดเสร็จแล้วความกว้างข้อความเปลี่ยน → วัดใหม่
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fitEventName(); updateTickerSpeed(); });
    }
  }

  function buildCard(m) {
    var c = document.createElement('div');
    c.className = 'lb-card';
    c.setAttribute('data-id', m.id);
    c.innerHTML =
      '<div class="lb-when"><span class="lb-time"></span><span class="lb-note"></span></div>' +
      '<div class="lb-team lb-team--A">' +
        '<span class="lb-team-name"></span>' +
        '<span class="lb-team-logo"><img alt="" hidden><i class="lb-team-fallback"></i></span>' +
      '</div>' +
      '<div class="lb-mid"><span class="lb-vs">VS</span><span class="lb-score"></span></div>' +
      '<div class="lb-team lb-team--B">' +
        '<span class="lb-team-logo"><img alt="" hidden><i class="lb-team-fallback"></i></span>' +
        '<span class="lb-team-name"></span>' +
      '</div>' +
      '<span class="lb-badge"></span>';
    return {
      el: c,
      status: null,
      time: q('.lb-time', c), note: q('.lb-note', c),
      teamA: q('.lb-team--A', c), teamB: q('.lb-team--B', c),
      nameA: q('.lb-team--A .lb-team-name', c), nameB: q('.lb-team--B .lb-team-name', c),
      imgA: q('.lb-team--A img', c), imgB: q('.lb-team--B img', c),
      fbA: q('.lb-team--A .lb-team-fallback', c), fbB: q('.lb-team--B .lb-team-fallback', c),
      score: q('.lb-score', c), badge: q('.lb-badge', c)
    };
  }

  function updateCard(c, m) {
    setText(c.time, m.time || '--:--');
    setText(c.note, m.note || '');
    setText(c.nameA, m.teamA.name || '');
    setText(c.nameB, m.teamB.name || '');
    setText(c.fbA, S.initials(m.teamA.name, m.teamA.tag));
    setText(c.fbB, S.initials(m.teamB.name, m.teamB.tag));
    setText(c.score, m.scoreA + ' : ' + m.scoreB);
    var done = m.status === 'done';
    c.teamA.classList.toggle('is-win', done && m.scoreA > m.scoreB);
    c.teamA.classList.toggle('is-lose', done && m.scoreA < m.scoreB);
    c.teamB.classList.toggle('is-win', done && m.scoreB > m.scoreA);
    c.teamB.classList.toggle('is-lose', done && m.scoreB < m.scoreA);
    if (c.status !== m.status) {
      var first = c.status === null;
      c.status = m.status;
      c.el.setAttribute('data-status', m.status);
      setText(c.badge, BADGE[m.status] || '');
      if (!first) {                                   // ป้ายเด้งตอนสถานะเปลี่ยน
        c.badge.classList.remove('is-pop');
        void c.badge.offsetWidth;
        c.badge.classList.add('is-pop');
      }
    }
  }

  function applyCardLogos() {
    var sch = (logos && logos.schedule) || {};
    Object.keys(cards).forEach(function (id) {
      var c = cards[id], lg = sch[id] || {};
      setImg(c.imgA, c.fbA, lg.A);
      setImg(c.imgB, c.fbB, lg.B);
    });
  }

  // สร้าง/จัดเรียงการ์ดใหม่เฉพาะตอนรายการ id เปลี่ยน นอกนั้นอัปเดตในที่เดิม
  function syncCards(list) {
    var key = list.map(function (m) { return m.id; }).join();
    if (key !== cardsKey) {
      var old = cards, first = cardsKey === null;
      cards = {};
      while (r.cards.firstChild) r.cards.removeChild(r.cards.firstChild);
      list.forEach(function (m, i) {
        var c = old[m.id];
        if (c) c.el.classList.remove('lb-card--new');
        else {
          c = buildCard(m);
          if (shown && !first) c.el.classList.add('lb-card--new');
        }
        c.el.style.setProperty('--i', i);
        c.el.style.setProperty('--r', list.length - 1 - i);
        r.cards.appendChild(c.el);
        cards[m.id] = c;
      });
      cardsKey = key;
      applyCardLogos();
    }
    list.forEach(function (m) { updateCard(cards[m.id], m); });
    r.cards.classList.toggle('is-compact', list.length >= 4);
  }

  // ชื่องานยาวเกินบรรทัดเดียว → ลดขนาดตัวอักษรแล้วให้ขึ้น 2 บรรทัด (วัดได้เฉพาะตอนหน้ารอโชว์อยู่)
  function fitEventName() {
    if (!shown) return;
    r.event.classList.remove('is-long');
    var oneLine = parseFloat(getComputedStyle(r.event).lineHeight) || 0;
    if (oneLine && r.event.scrollHeight > oneLine * 1.5) r.event.classList.add('is-long');
  }

  function updateTickerSpeed() {
    if (!shown || r.ticker.hidden) return;
    var w = r.tickerText.offsetWidth || 1920;
    r.tickerTrack.style.animationDuration = ((1920 + w) / TICKER_SPEED).toFixed(2) + 's';
  }

  /* ---------- โชว์ / ซ่อน ---------- */
  function clearTimers() {
    clearTimeout(hideTimer); hideTimer = 0;
    clearTimeout(leaveTimer); leaveTimer = 0;
    clearTimeout(enterTimer); enterTimer = 0;
  }
  function show() {
    clearTimers();
    el.classList.remove('is-leaving', 'is-golive', 'is-entering');
    el.classList.add('is-shown');
    void el.offsetWidth;
    el.classList.add('is-entering');
    el.setAttribute('aria-hidden', 'false');
    shown = true;
    updateTickerSpeed();
    fitEventName();
    enterTimer = setTimeout(function () { enterTimer = 0; el.classList.remove('is-entering'); }, ENTER_MS);
  }
  function hideNow() {
    clearTimers();
    el.classList.remove('is-shown', 'is-entering', 'is-leaving', 'is-golive');
    GOLIVE_VARS.forEach(function (v) { el.style.removeProperty(v); });
    el.setAttribute('aria-hidden', 'true');
    shown = false;
  }
  function fadeOut() {
    clearTimers();
    el.classList.remove('is-entering');
    el.classList.add('is-leaving');
    leaveTimer = setTimeout(hideNow, LEAVE_MS);
  }

  function shouldShow() {
    var c = lobby.countdown;
    return lobby.visible && !(c.running && c.endsAt === localLiveEndsAt);
  }
  function syncVisibility() {
    var want = shouldShow();
    if (want) {
      if (!shown || leaveTimer) show();
      else if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
    } else if (shown && !hideTimer && !leaveTimer) {
      hideTimer = setTimeout(function () { hideTimer = 0; fadeOut(); }, HIDE_WAIT_MS);
    }
  }

  /* ---------- render ---------- */
  function render(state) {
    if (!el || !state || !state.lobby) return;
    lastState = state;
    lobby = state.lobby;
    if (busy) return;                                // แอนิเมชันเข้าไลฟ์จะ render ใหม่เองตอนจบ

    setText(r.event, lobby.eventName || '');
    r.event.hidden = !lobby.eventName;
    fitEventName();
    setText(r.tagline, lobby.tagline || '');
    r.tagline.hidden = !lobby.tagline;
    setText(r.logoFb, eventInitials(lobby.eventName) || '★');
    setText(r.title, lobby.scheduleTitle || '');
    setText(r.cdLabel, lobby.countdownLabel || '');
    setText(r.cdZero, lobby.zeroText || '');
    syncCards(lobby.matches || []);

    var ticker = lobby.ticker || '';
    if (ticker !== lastTicker) {
      lastTicker = ticker;
      setText(r.tickerText, ticker);
      r.ticker.hidden = !ticker;
      updateTickerSpeed();
    }
    syncVisibility();
  }

  function applyLogos(l) {
    if (!el) return;
    logos = l || {};
    setImg(r.logoImg, r.logoFb, logos.event);
    applyCardLogos();
  }

  // ตัวเลขนับถอยหลังแบบนาฬิกาพลิก: แต่ละหลักเป็นแผ่น พลิกเฉพาะหลักที่เปลี่ยน
  function renderDigits(text) {
    var spans = r.cdTime.children, i;
    if (spans.length !== text.length) {
      r.cdTime.innerHTML = '';
      for (i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = text[i] === ':' ? 'lb-colon' : 'lb-digit';
        s.textContent = text[i];
        r.cdTime.appendChild(s);
      }
      return;
    }
    for (i = 0; i < text.length; i++) {
      if (spans[i].textContent === text[i]) continue;
      spans[i].textContent = text[i];
      spans[i].classList.remove('is-flip');
      void spans[i].offsetWidth;
      spans[i].classList.add('is-flip');
    }
  }

  /* ---------- tick: ตัวนับถอยหลัง + เข้าไลฟ์อัตโนมัติชั้นที่ 2 ---------- */
  function tick(now) {
    if (!el || !lobby) return;
    var c = lobby.countdown;
    var rem = L.lobbyRemaining(c, now);
    var isZero = rem === 0;
    if (isZero !== zeroShown) {
      zeroShown = isZero;
      r.cdTime.hidden = isZero;
      r.cdZero.hidden = !isZero;
    }
    if (!isZero) {
      var text = L.formatLong(rem);
      if (text !== lastTime) { lastTime = text; renderDigits(text); }
    }
    // 10 วิสุดท้าย: ตัวเลขใหญ่เต็มจอ + แฟลชแดงทุกวินาที (เนื้อหาอื่นจางลง)
    var finalSec = (FINAL_SECONDS && shown && !busy && c.running && rem > 0 && rem <= FINAL_SECONDS * 1000) ? Math.ceil(rem / 1000) : 0;
    if (finalSec !== lastFinal) {
      lastFinal = finalSec;
      el.classList.toggle('is-final10', finalSec > 0);
      if (finalSec) {
        r.finalNum.textContent = String(finalSec);
        r.finalNum.classList.remove('is-tick');
        r.flash.classList.remove('is-tick');
        void r.finalNum.offsetWidth;
        r.finalNum.classList.add('is-tick');
        r.flash.classList.add('is-tick');
      }
    }
    r.cdTime.classList.toggle('is-urgent', c.running && rem > 0 && rem <= 60000);
    r.cdTime.classList.toggle('is-final', c.running && rem > 0 && rem <= 10000);

    // รอบก่อนเหลือ > 0 แต่รอบนี้ = 0 → เข้าไลฟ์เอง ไม่ต้องรอ control
    // (prevRemaining เริ่มเป็น null → รีเฟรช overlay หลังหมดเวลาแล้วจะไม่เล่นซ้ำ)
    if (shown && !busy && lobby.visible && lobby.autoGoLive && c.running &&
        prevRemaining !== null && prevRemaining > 0 && rem === 0) {
      playGoLive({ holdMs: lobby.goLiveHoldMs, endsAt: 0 });
      localLiveEndsAt = c.endsAt;
    }
    prevRemaining = rem;
  }

  /* ---------- แอนิเมชันเข้าไลฟ์ (7.3) ---------- */
  function playGoLive(payload) {
    payload = payload || {};
    if (!el || busy || !shown) return;
    if (payload.endsAt && payload.endsAt === localLiveEndsAt) return;   // overlay เข้าไลฟ์เองไปแล้ว
    busy = true;
    clearTimers();

    var hold = Number(payload.holdMs);
    if (!isFinite(hold)) hold = lobby ? lobby.goLiveHoldMs : 1000;
    hold = Math.max(0, Math.min(5000, hold));
    el.style.setProperty('--golive-close', L.GOLIVE.closeMs + 'ms');
    el.style.setProperty('--golive-logo', L.GOLIVE.logoMs + 'ms');
    el.style.setProperty('--golive-hold', hold + 'ms');
    el.style.setProperty('--golive-open', L.GOLIVE.openMs + 'ms');

    // ลบคลาสเก่าก่อน แล้วค่อยวัดตำแหน่งโลโก้ (ไม่งั้นได้ค่าที่มี transform ค้าง)
    el.classList.remove('is-entering', 'is-leaving', 'is-final10');
    lastFinal = 0;
    void el.offsetWidth;
    var st = stage.getBoundingClientRect();
    var lg = r.logo.getBoundingClientRect();
    var k = st.width / stage.offsetWidth || 1;        // stage ถูกย่อ/ขยายตอนเปิดใน Chrome
    var dx = ((st.left + st.width / 2) - (lg.left + lg.width / 2)) / k;
    var dy = ((st.top + st.height / 2) - (lg.top + lg.height / 2)) / k;
    el.style.setProperty('--lb-logo-dx', dx + 'px');
    el.style.setProperty('--lb-logo-dy', dy + 'px');

    void el.offsetWidth;
    el.classList.add('is-golive');
    setTimeout(function () {
      hideNow();
      busy = false;
      if (lastState) render(lastState);               // เผื่อมี Undo/เปิดหน้ารอใหม่ระหว่างแอนิเมชัน
    }, L.goLiveTotalMs(hold));
  }

  /* ---------- โหมดตัวอย่างสำหรับทีมดีไซน์ (10.1) ---------- */
  function setupDemo(state, params) {
    var lb = state.lobby, now = Date.now();
    var n = Math.max(1, Math.min(L.MAX_MATCHES, parseInt(params.matches, 10) || 4));
    var sample = [
      ['11:00', 'TEAM ALPHA', 'ALP', 'TEAM BRAVO', 'BRV', 'BO3 · รอบ 8 ทีม', 'done'],
      ['13:00', 'TEAM CHARLIE', 'CHA', 'TEAM DELTA', 'DLT', 'BO3 · รอบ 8 ทีม', 'live'],
      ['15:00', 'TEAM ECHO', 'ECH', 'ทีมชื่อภาษาไทยที่ยาวมากเป็นพิเศษ', 'TH', 'BO3 · รอบรองฯ', 'next'],
      ['17:00', 'TEAM GOLF', 'GLF', 'TEAM HOTEL', 'HTL', 'BO3 · รอบรองฯ', 'upcoming'],
      ['19:00', 'TEAM INDIA', 'IND', 'TEAM JULIET', 'JLT', 'BO5 · ชิงชนะเลิศ', 'upcoming'],
      ['21:00', 'TEAM KILO', 'KIL', 'TEAM LIMA', 'LIM', 'SHOWMATCH', 'upcoming']
    ];
    lb.matches = sample.slice(0, n).map(function (a) { return L.makeMatch.apply(null, a); });
    lb.matches[0].scoreA = 2;
    lb.matches[0].scoreB = 1;
    lb.tagline = 'DAY 2 · PLAYOFFS';
    if (params.event) lb.eventName = params.event;    // ลองชื่องานยาว ๆ: &event=...
    lb.ticker = 'ติดตามเพจ VALORANT CUP 2026 เพื่อไม่พลาดทุกแมตช์ · ขอบคุณผู้สนับสนุนทุกท่าน · #ValoCup2026';
    L.lobbySetDuration(lb.countdown, 30);
    L.lobbyStart(lb.countdown, now);
    lb.visible = true;
  }
  // โชว์หน้ารอ 4 วิ → เข้าไลฟ์ → รอ 3 วิ → วนใหม่
  function runDemoLoop(state, apply) {
    function cycle() {
      state.lobby.visible = true;
      apply(state);
      setTimeout(function () {
        playGoLive({ holdMs: state.lobby.goLiveHoldMs, endsAt: 0 });
        state.lobby.visible = false;
        apply(state);
        setTimeout(cycle, L.goLiveTotalMs(state.lobby.goLiveHoldMs) + 3000);
      }, 4000);
    }
    cycle();
  }

  window.ValoLobbyOverlay = {
    init: init,
    render: render,
    applyLogos: applyLogos,
    tick: tick,
    playGoLive: playGoLive,
    isBusy: function () { return busy; },
    setupDemo: setupDemo,
    runDemoLoop: runDemoLoop
  };
})();
