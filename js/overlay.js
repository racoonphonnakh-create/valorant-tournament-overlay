/* =====================================================================
   js/overlay.js — หน้า overlay (Browser Source ใน OBS 1920x1080)
   ---------------------------------------------------------------------
   แถบสกอร์ + ป้ายผู้ชนะ + แอนิเมชันเปลี่ยนแมตช์ + รีเพลย์ · เรียกหน้ารอ (ValoLobbyOverlay) และไลน์อัพ (ValoLineupOverlay)
   URL: ?debug=1 ป้ายสถานะ · ?demo=1 ข้อมูลตัวอย่าง (ไม่ต่อ control)
        ?demo=1&lobby=1[&loop=golive][&matches=6] · &win=A · &lineup=1[&size=3] · ?ws=ws://..&pw=รหัสผ่าน
   ===================================================================== */
(function () {
  'use strict';
  var S = window.ValoState, C = window.ValoConfig, LO = window.ValoLobbyOverlay, LU = window.ValoLineupOverlay;
  var TRANSITION_MS = 3800;                           // ตรงกับ keyframes tr-* ใน overlay.css
  // ป้ายบอกฝั่งใต้ชื่อทีม (แก้ข้อความได้ที่นี่) · icon = path ของ SVG 24x24
  var SIDE = {
    atk: { label: 'ATTACK · ฝ่ายบุก', icon: 'M21 3h-5.2L6.6 12.2 5.2 10.8 3.8 12.2l2.5 2.5L3 18l3 3 3.3-3.3 2.5 2.5 1.4-1.4-1.4-1.4L21 8.2V3z' },
    def: { label: 'DEFENSE · ฝ่ายรับ', icon: 'M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5l-8-3z' }
  };

  // ป้ายผลแพ้ชนะ (แก้ข้อความได้ที่นี่)
  var RESULT = {
    win: { label: 'WIN · ชนะ', icon: 'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z' },
    lose: { label: 'LOSE · แพ้', icon: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z' }
  };
  var WIN_TITLE = 'WINNER · ผู้ชนะ';
  var WIN_SHOW_MS = 5000;                             // ป้ายผู้ชนะใหญ่ค้างกี่ ms แล้วหดเข้าแถบสกอร์ (0 = ค้างจนล้างผล)
  var CONFETTI = 46;                                  // จำนวนกระดาษโปรยตอนประกาศผู้ชนะ (0 = ไม่โปรย)
  var REPLAY_WIPE_MS = 1500, REPLAY_COVER_MS = 420;   // ตรงกับ rp-wipe ใน overlay.css
  var rp = { timer: 0, swap: 0 };

  var params = {}, stage, sb = {}, tr = {}, win = { shown: '', timer: 0, hideTimer: 0 }, fx = null, dbg = null;
  var state = null, logos = {}, link = null, skew = 0;   // skew = ส่วนต่างนาฬิกา control−overlay (เครื่องเดียวกัน = 0)
  var lastClock = '', trTimer = 0, sbVisible = null, sbEnterTimer = 0;

  location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf('=');
    var k = i < 0 ? kv : kv.slice(0, i);
    try { params[decodeURIComponent(k)] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* ข้าม */ }
  });

  function lsGet(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* เต็ม/ถูกปิด — ไม่เป็นไร */ }
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setImg(img, fallback, src) {
    if (src) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.hidden = false;
      if (fallback) fallback.hidden = true;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      if (fallback) fallback.hidden = false;
    }
  }
  // เล่นแอนิเมชันของคลาสซ้ำได้ (ลบ → reflow → ใส่ใหม่)
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------- สร้าง DOM ---------- */
  function teamHtml(k) {
    return '<div class="sb-team sb-team--' + k + '">' +
      '<span class="sb-logo"><img alt="" hidden><i></i></span>' +
      '<div class="sb-info"><div class="sb-name"></div><div class="sb-maps"></div></div>' +
      '<span class="sb-score">0</span>' +
      '<div class="sb-side"><svg viewBox="0 0 24 24" aria-hidden="true"><path></path></svg><span></span></div></div>';
  }
  function teamRefs(root) {
    return {
      el: root, img: root.querySelector('img'), fb: root.querySelector('.sb-logo i'),
      name: root.querySelector('.sb-name'), maps: root.querySelector('.sb-maps'),
      score: root.querySelector('.sb-score'), mapsKey: '', scoreVal: null, scoreTimer: 0,
      side: root.querySelector('.sb-side'), sideIcon: root.querySelector('.sb-side path'),
      sideText: root.querySelector('.sb-side span'), sideKey: null, sideVal: null
    };
  }
  function trTeamHtml(k) {
    return '<div class="tr-team tr-team--' + k + '"><div class="tr-team-logo"><img alt="" hidden><i></i></div>' +
      '<div class="tr-team-name"></div></div>';
  }
  function buildDom() {
    stage = document.getElementById('stage');
    var bar = document.createElement('div');
    bar.id = 'sb';
    bar.className = 'sb';
    bar.innerHTML = teamHtml('A') +
      '<div class="sb-mid"><div class="sb-timer">1:40</div><div class="sb-sub"></div></div>' +
      teamHtml('B');
    stage.appendChild(bar);
    sb.el = bar;
    sb.A = teamRefs(bar.querySelector('.sb-team--A'));
    sb.B = teamRefs(bar.querySelector('.sb-team--B'));
    sb.mid = bar.querySelector('.sb-mid');
    sb.timer = bar.querySelector('.sb-timer');
    sb.sub = bar.querySelector('.sb-sub');

    var w = document.createElement('div');
    w.id = 'win';
    w.className = 'win';
    w.innerHTML = '<span class="win-logo"><img alt="" hidden><i></i></span>' +
      '<div class="win-info"><div class="win-title"></div><div class="win-name"></div><div class="win-side"></div></div>';
    stage.appendChild(w);
    win.el = w;
    win.img = w.querySelector('img');
    win.fb = w.querySelector('.win-logo i');
    win.name = w.querySelector('.win-name');
    win.side = w.querySelector('.win-side');
    w.querySelector('.win-title').textContent = WIN_TITLE;
    fx = document.createElement('div');
    fx.className = 'fx';
    stage.appendChild(fx);

    var rw = document.createElement('div');
    rw.id = 'rp';
    rw.className = 'rp';
    rw.innerHTML = '<div class="rp-panel"><div class="rp-scan"></div>' +
      '<div class="rp-logo"><img alt="" hidden></div><div class="rp-text" data-text="◀◀ REPLAY">◀◀ REPLAY</div></div>';
    stage.appendChild(rw);
    rp.el = rw;
    rp.img = rw.querySelector('img');
    rp.logoBox = rw.querySelector('.rp-logo');
    var badge = document.createElement('div');
    badge.className = 'rp-badge';
    badge.innerHTML = '<span>REPLAY</span><i class="rp-bar"></i>';
    stage.appendChild(badge);
    rp.bar = badge.querySelector('.rp-bar');

    var t = document.createElement('div');
    t.id = 'tr';
    t.className = 'tr';
    t.innerHTML =
      '<div class="tr-slabs"><i style="--n:0"></i><i style="--n:1"></i><i style="--n:2"></i><i style="--n:3"></i><i style="--n:4"></i></div>' +
      '<div class="tr-box">' +
        '<div class="tr-head"><div class="tr-logo"><img alt="" hidden></div><div class="tr-title"></div></div>' +
        '<div class="tr-clash">' + trTeamHtml('A') + '<div class="tr-mid"><div class="tr-ring"></div><div class="tr-vs">VS</div></div>' + trTeamHtml('B') + '</div>' +
      '</div>' +
      '<div class="tr-flash"></div>';
    stage.appendChild(t);
    tr.el = t;
    tr.logoBox = t.querySelector('.tr-logo');
    tr.img = t.querySelector('.tr-logo img');
    tr.title = t.querySelector('.tr-title');
    ['A', 'B'].forEach(function (k) {
      var team = t.querySelector('.tr-team--' + k);
      tr[k] = { img: team.querySelector('img'), fb: team.querySelector('i'), name: team.querySelector('.tr-team-name') };
    });
  }

  function fit() {
    var k = Math.min(window.innerWidth / C.stage.width, window.innerHeight / C.stage.height);
    stage.style.transform = Math.abs(k - 1) < 0.001 ? '' : 'scale(' + k + ')';
  }

  /* ---------- แถบสกอร์ ---------- */
  // คะแนนเปลี่ยน → เลขเก่าเลื่อนออก เลขใหม่เลื่อนเข้า + แสงวิ่งผ่านแผงทีม (เฉพาะตอนคะแนนเพิ่ม)
  function applyScore(ref, score) {
    if (ref.scoreVal === score) return;
    var old = ref.scoreVal;
    ref.scoreVal = score;
    clearTimeout(ref.scoreTimer);
    if (old === null) { ref.score.textContent = String(score); return; }
    ref.score.classList.toggle('is-down', score < old);
    ref.score.innerHTML = '<span class="sb-num sb-num--out">' + old + '</span><span class="sb-num sb-num--in">' + score + '</span>';
    if (score > old) replay(ref.el, 'is-scored');
    ref.scoreTimer = setTimeout(function () { ref.score.textContent = String(score); }, 600);
  }
  function applyTeam(ref, k, t, bestOf, res) {
    setText(ref.name, t.name || '');
    setText(ref.fb, S.initials(t.name, t.tag));
    applyScore(ref, t.score);
    // res: '' | 'win' | 'lose' — มีผลแพ้ชนะแล้วแถบใต้ชื่อทีมเปลี่ยนจากบอกฝั่งเป็นบอกผล
    var sideKey = t.side + ':' + res;
    if (ref.sideKey !== sideKey) {
      var first = ref.sideKey === null, info = RESULT[res] || SIDE[t.side] || SIDE.atk;
      var swapped = !first && ref.sideVal !== t.side;
      ref.sideKey = sideKey;
      ref.sideVal = t.side;
      ref.el.setAttribute('data-side', t.side);
      ref.el.setAttribute('data-result', res);
      ref.sideIcon.setAttribute('d', info.icon);
      setText(ref.sideText, info.label);
      if (swapped && !res) replay(ref.side, 'is-swap');      // สลับฝั่ง → แถบสีเลื่อนสวนกันไปอีกฝั่ง
      else if (!first) replay(ref.side, 'is-flash');          // ประกาศผล/ล้างผล → แถบกะพริบ
    }
    var need = Math.floor(bestOf / 2) + 1;
    var key = need + ':' + t.maps;
    if (key !== ref.mapsKey) {
      ref.mapsKey = key;
      var html = '';
      for (var i = 0; i < need; i++) html += '<b' + (i < t.maps ? ' class="is-on"' : '') + '></b>';
      ref.maps.innerHTML = bestOf > 1 ? html : '';
    }
  }
  // โชว์แถบสกอร์ → ช่องเวลาโผล่ก่อน แล้วแผงสองทีมกางออกซ้าย–ขวา
  function applyScoreboardVisible(visible) {
    if (visible === sbVisible) return;
    sbVisible = visible;
    sb.el.classList.toggle('is-hidden', !visible);
    clearTimeout(sbEnterTimer);
    if (visible) {
      replay(sb.el, 'is-entering');
      sbEnterTimer = setTimeout(function () { sb.el.classList.remove('is-entering'); }, 1000);
    } else {
      sb.el.classList.remove('is-entering');
    }
  }

  function applyState(s) {
    state = s;
    applyScoreboardVisible(!!s.scoreboard.visible);
    var dsp = s.display || {};
    stage.style.setProperty('--sb-logo-scale', (dsp.sbLogo || 100) / 100);
    stage.style.setProperty('--tr-logo-scale', (dsp.trLogo || 100) / 100);
    stage.style.setProperty('--lobby-logo-scale', (dsp.lobbyLogo || 100) / 100);
    stage.style.setProperty('--lobby-team-logo-scale', (dsp.lobbyTeamLogo || 100) / 100);
    var winner = (s.result && s.result.winner) || '';
    applyTeam(sb.A, 'A', s.teams.A, s.match.bestOf, winner ? (winner === 'A' ? 'win' : 'lose') : '');
    applyTeam(sb.B, 'B', s.teams.B, s.match.bestOf, winner ? (winner === 'B' ? 'win' : 'lose') : '');
    applyWinner(s, winner);
    LU.render(s);
    LO.render(s);
  }

  /* ---------- ป้ายผู้ชนะ ---------- */
  function confetti(side) {
    if (!CONFETTI) return;
    var colors = ['var(--c-win)', side === 'def' ? 'var(--c-def)' : 'var(--c-atk)', '#ffffff'];
    fx.innerHTML = '';
    for (var i = 0; i < CONFETTI; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100).toFixed(1) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.round(Math.random() * 700) + 'ms';
      p.style.animationDuration = (2200 + Math.round(Math.random() * 1200)) + 'ms';
      p.style.setProperty('--dx', Math.round(Math.random() * 240 - 120) + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
      fx.appendChild(p);
    }
    replay(fx, 'is-on');
    setTimeout(function () { fx.classList.remove('is-on'); fx.innerHTML = ''; }, 4200);
  }
  // ป้ายใหญ่ใต้แถบสกอร์: โลโก้ + ชื่อทีมที่ชนะ + ฝั่งที่เล่น → ค้าง WIN_SHOW_MS แล้วหดเข้าแถบสกอร์
  function applyWinner(s, winner) {
    if (winner) {
      var t = s.teams[winner];
      setText(win.name, t.name || '');
      setText(win.fb, S.initials(t.name, t.tag));
      setText(win.side, (SIDE[t.side] || SIDE.atk).label);
      win.el.setAttribute('data-side', t.side);
      setImg(win.img, win.fb, logos[winner]);
    }
    if (winner === win.shown) return;
    win.shown = winner;
    clearTimeout(win.timer);
    clearTimeout(win.hideTimer);
    win.el.classList.remove('is-show', 'is-collapse');
    if (!winner) return;
    void win.el.offsetWidth;
    win.el.classList.add('is-show');
    confetti(s.teams[winner].side);
    if (WIN_SHOW_MS > 0) {
      win.timer = setTimeout(function () {
        win.el.classList.add('is-collapse');
        win.hideTimer = setTimeout(function () { win.el.classList.remove('is-show', 'is-collapse'); }, 600);
      }, WIN_SHOW_MS);
    }
  }

  function applyLogos(l) {
    logos = l || {};
    if (win.shown) setImg(win.img, win.fb, logos[win.shown]);
    setImg(sb.A.img, sb.A.fb, logos.A);
    setImg(sb.B.img, sb.B.fb, logos.B);
    setImg(tr.img, null, logos.event);
    setImg(rp.img, null, logos.event);
    setImg(tr.A.img, tr.A.fb, logos.A);
    setImg(tr.B.img, tr.B.fb, logos.B);
    rp.logoBox.hidden = !logos.event;
    tr.logoBox.hidden = !logos.event;
    LO.applyLogos(logos);
    LU.applyLogos(logos);
  }

  /* ---------- แอนิเมชันเปลี่ยนแมตช์ (T): แผ่นเฉียงตัดเข้า → โลโก้สองทีมพุ่งชนกัน → VS ---------- */
  function playTransition(p) {
    if (!state) return;
    clearTimeout(trTimer);
    setText(tr.title, (p && p.title) || state.match.title || 'NEXT MATCH');
    ['A', 'B'].forEach(function (k) {
      setText(tr[k].name, state.teams[k].name);
      setText(tr[k].fb, S.initials(state.teams[k].name, state.teams[k].tag));
    });
    replay(tr.el, 'is-playing');
    trTimer = setTimeout(function () { tr.el.classList.remove('is-playing'); }, TRANSITION_MS);
  }

  /* ---------- รีเพลย์ ---------- */
  // แอนิเมชันคั่นบังเต็มจอ แล้วสลับโหมด (ป้าย REPLAY + ซ่อนแถบสกอร์) ตอนจอถูกบัง
  // ตัวภาพรีเพลย์ OBS เป็นคนเล่นอยู่ใต้ overlay (ดู replay-control.js)
  function playReplay(p) {
    if (p.phase === 'timer') {                        // ความยาวคลิป → แถบเวลาใต้ป้าย REPLAY
      rp.bar.style.animationDuration = Math.max(500, Number(p.ms) || 0) + 'ms';
      replay(rp.bar, 'is-run');
      return;
    }
    var on = p.phase === 'in';
    clearTimeout(rp.timer);
    clearTimeout(rp.swap);
    replay(rp.el, 'is-playing');
    rp.swap = setTimeout(function () {
      stage.classList.toggle('is-replay', on);
      if (!on) rp.bar.classList.remove('is-run');
    }, REPLAY_COVER_MS);
    rp.timer = setTimeout(function () { rp.el.classList.remove('is-playing'); }, REPLAY_WIPE_MS);
  }

  function handleMessage(type, p) {
    if (type === 'state') {
      applyState(p);
      lsSet(C.storage.overlayState, p);
    } else if (type === 'logos') {
      applyLogos(p);
      lsSet(C.storage.overlayLogos, p);
    } else if (type === 'play') {
      if (p && p.anim === 'golive') LO.playGoLive(p);
      else if (p && p.anim === 'replay') playReplay(p);
      else playTransition(p);
    }
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!state) return;
    var now = Date.now() + skew;
    var t = state.timer, rem = S.timerRemaining(t, now);
    var clock = S.formatClock(rem);
    if (clock !== lastClock) { lastClock = clock; sb.timer.textContent = clock; }
    var spike = t.phase === 'spike';
    sb.timer.classList.toggle('is-spike', spike);
    // วางสไปก์: ช่องเวลาเต้นเป็นจังหวะหัวใจ · 10 วิสุดท้ายเต้นเร็วขึ้น
    sb.mid.classList.toggle('is-spike', spike && t.running && rem > 0);
    sb.mid.classList.toggle('is-spike-fast', spike && t.running && rem > 0 && rem <= 10000);
    var sub = S.PHASE_LABEL[t.phase] || [state.match.map, 'MAP ' + state.match.mapNo].filter(Boolean).join(' · ');
    setText(sb.sub, sub);
    LO.tick(now);
  }

  function showStatus(st) {
    if (!dbg) return;
    dbg.textContent = 'OBS WebSocket: ' + st.ws + (st.bc ? ' · BroadcastChannel: on' : '');
  }

  function setupDemoLineup(demo) {
    var sample = {
      A: [['Something', 'Duelist', 'Jett'], ['f0rsakeN', 'Flex', 'Fade'], ['Jinggg', 'Initiator', 'Sova'], ['d4v41', 'Sentinel', 'Cypher'], ['ทดสอบชื่อไทยยาวมาก', 'Controller', 'Omen']],
      B: [['Player1', 'IGL', 'Astra'], ['Player2', 'Duelist', 'Raze'], ['', '', ''], ['Player4', 'Sentinel', 'Killjoy'], ['Player5', 'Initiator', 'Breach']]
    };
    var size = Math.max(1, Math.min(S.LINEUP_SIZE, parseInt(params.size, 10) || 5));
    ['A', 'B'].forEach(function (k) {
      sample[k].forEach(function (p, i) { demo.lineup[k].players[i] = { pid: '', name: p[0], role: p[1], agent: p[2] }; });
      demo.lineup[k].size = size;
    });
    demo.lineup.A.coach = 'alecks';
    demo.lineup.focus = params.focus || '';
    demo.lineup.visible = true;
  }

  function init() {
    buildDom();
    LO.init(document.getElementById('stage'));
    LU.init(document.getElementById('stage'));
    fit();
    window.addEventListener('resize', fit);

    if (params.debug === '1') {
      document.body.classList.add('is-debug');
      dbg = document.createElement('div');
      dbg.className = 'dbg';
      stage.appendChild(dbg);
    }

    if (params.demo === '1') {
      var demo = S.makeDefaultState();
      demo.teams.A.score = 7;
      demo.teams.B.score = 5;
      demo.teams.A.maps = 1;
      demo.match.map = 'ASCENT';
      if (params.win === 'A' || params.win === 'B') demo.result.winner = params.win;   // ดูป้ายผู้ชนะ: &win=A
      if (params.lineup === '1') setupDemoLineup(demo);                                  // ดูหน้าไลน์อัพ: &lineup=1
      if (params.lobby === '1') LO.setupDemo(demo, params);
      applyLogos({});
      applyState(demo);
      if (params.lobby === '1' && params.loop === 'golive') LO.runDemoLoop(demo, applyState);
      if (params.loop === 'fx') {                     // วนโชว์ลูกเล่นแถบสกอร์ / ผู้ชนะ / เปลี่ยนแมตช์
        var step = 0;
        setInterval(function () {
          step++;
          if (step % 4 === 1) demo.teams.A.score++;
          if (step % 4 === 2) { var sd = demo.teams.A.side; demo.teams.A.side = demo.teams.B.side; demo.teams.B.side = sd; }
          if (step % 4 === 3) demo.result.winner = demo.result.winner ? '' : 'A';
          if (step % 4 === 0) playTransition({});
          applyState(demo);
        }, 3000);
      }
      if (dbg) dbg.textContent = 'DEMO';
    } else {
      // ใช้ข้อมูลล่าสุดที่เคยได้รับไปก่อน (เปิด OBS ใหม่ระหว่างนับ → หน้ารอกลับมาพร้อมเวลาที่ถูก)
      var cachedLogos = lsGet(C.storage.overlayLogos);
      var cachedState = lsGet(C.storage.overlayState);
      if (cachedLogos) applyLogos(cachedLogos);
      if (cachedState && cachedState.lobby) applyState(cachedState);
      link = window.ValoLink.create({
        role: 'overlay',
        url: params.ws || C.obs.url,
        password: params.pw || C.obs.password,
        channel: C.channel,
        onMessage: handleMessage,
        onStatus: showStatus,
        onOpen: function () { link.send('hello', {}); }
      });
      showStatus(link.getStatus());
      link.send('hello', {});                         // ขอ state + logos จาก control
    }
    requestAnimationFrame(tick);
  }

  init();
})();
