/* =====================================================================
   js/lobby-control.js — แท็บ "หน้ารอเข้าไลฟ์" ในหน้าคอนโทรล
   ---------------------------------------------------------------------
   โหลดก่อน control.js · ตรรกะนับเวลาใช้ของ window.ValoLobby ทั้งหมด
   ctx มาจาก control.js:
   { getState, commit, getLogos, saveLogos, sendLogos, link, toast, resizeImage(src, max) -> Promise<dataURL>,
     getLibrary, containerEl, statusEl, bindText(input, apply), pickImage(cb), bindDrop(el, cb),
     fillLibSelect(select, libId), setVal(input, value) }
   ===================================================================== */
(function () {
  'use strict';
  var L = window.ValoLobby;
  var C = window.ValoConfig;

  var FIELDS = [
    ['eventName', 'ชื่องาน', 60],                    // ยาวเกินบรรทัดเดียว → overlay ขึ้น 2 บรรทัดเอง
    ['tagline', 'บรรทัดรอง', 40],
    ['scheduleTitle', 'หัวตาราง', 40],
    ['countdownLabel', 'ป้ายเหนือเวลา', 30],
    ['zeroText', 'ข้อความตอนหมด', 30],
    ['ticker', 'ข้อความวิ่ง', 200]
  ];
  var STATUS = [['upcoming', 'กำลังจะแข่ง'], ['next', 'คู่ถัดไป'], ['live', 'กำลังแข่ง'], ['done', 'จบแล้ว']];
  var TARGET_ERROR = 'เวลานี้ผ่านไปแล้ว หรือรูปแบบไม่ถูก (ถ้าข้ามเที่ยงคืนให้ใช้โหมดนับนาที)';

  var ctx = null, root = null, els = {}, fieldEls = {}, rows = {}, rowsKey = null;
  var goingLive = false, cfgSig = null, prevRem = null, lastClock = '', lastStatus = '';

  function q(name, base) { return (base || root).querySelector('[data-el="' + name + '"]'); }
  function findMatch(s, id) {
    var list = s.lobby.matches;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function indexOfMatch(s, id) {
    var list = s.lobby.matches;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }
  function clampInt(v, min, max) {
    v = Math.round(Number(v) || 0);
    return Math.max(min, Math.min(max, v));
  }
  // 'HH:MM' + 2 ชม. (ถ้าคำนวณไม่ได้/ข้ามวัน คืน '')
  function plusTwoHours(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m || +m[1] + 2 > 23) return '';
    var h = +m[1] + 2;
    return (h < 10 ? '0' : '') + h + ':' + m[2];
  }

  /* ---------- เข้าไลฟ์ (LOBBY.md 5.1) ---------- */
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
    ctx.commit(function (s) { L.lobbyStop(s.lobby.countdown, Date.now()); }, { undo: false });
    ctx.commit(function (s) { s.lobby.visible = false; });
    ctx.toast(source === 'auto' ? 'หมดเวลา — เข้าไลฟ์แล้ว 🚀' : 'เข้าไลฟ์แล้ว 🚀');
    setTimeout(function () { goingLive = false; }, L.goLiveTotalMs(st.lobby.goLiveHoldMs));
  }

  function toggleVisible() {
    ctx.commit(function (s) { s.lobby.visible = !s.lobby.visible; });
  }

  /* ---------- โลโก้ในตาราง ---------- */
  function setScheduleLogo(id, side, dataUrl) {
    var logos = ctx.getLogos();
    if (!logos.schedule[id]) logos.schedule[id] = { A: null, B: null };
    logos.schedule[id][side] = dataUrl || null;
    ctx.saveLogos();
    ctx.sendLogos();
  }
  function shrink(src) {
    return src ? ctx.resizeImage(src, C.scheduleLogoMax).catch(function () { return null; }) : Promise.resolve(null);
  }
  function uploadScheduleLogo(id, side, file) {
    ctx.resizeImage(file, C.scheduleLogoMax).then(function (url) {
      if (findMatch(ctx.getState(), id)) setScheduleLogo(id, side, url);
    }, function () { ctx.toast('เปิดไฟล์รูปไม่ได้', 'error'); });
  }

  /* ---------- สร้าง DOM ---------- */
  function buildStatic() {
    root.innerHTML =
      '<div class="lc-head">' +
        '<button data-el="toggle" class="btn-big"></button>' +
        '<span class="lc-state" data-el="stateText"></span>' +
        '<span class="spacer"></span>' +
        '<button data-el="go" class="btn-big btn-go">🚀 เข้าไลฟ์เลย <span data-key="goLive"></span></button>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>ข้อความบนจอ</h3><div data-el="fields"></div>' +
          '<div class="row"><span class="lbl">โลโก้งาน</span>' +
            '<button class="logo-btn" data-el="evLogo" title="คลิกหรือลากไฟล์มาวาง"></button>' +
            '<button data-el="evPick">🖼 เปลี่ยน</button><button data-el="evClear">ลบ</button>' +
            '<small>(ใช้ร่วมกับแอนิเมชันเปลี่ยนแมตช์)</small></div>' +
          ctx.scaleRowHtml('lobbyLogo', 'ขนาดโลโก้งาน') +
          ctx.scaleRowHtml('lobbyTeamLogo', 'ขนาดโลโก้ทีมในตาราง') +
        '</div>' +
        '<div class="panel"><h3>นับถอยหลัง</h3>' +
          '<div class="lc-clock" data-el="clock">30:00</div>' +
          '<div class="row">' +
            '<label><input type="radio" name="lcMode" value="duration" data-el="modeDur"> นับ</label>' +
            '<input type="number" min="1" max="600" step="1" class="w70" data-el="minutes"><span>นาที</span>' +
            '<label><input type="radio" name="lcMode" value="target" data-el="modeTgt"> นับถึงเวลา</label>' +
            '<input type="time" data-el="target">' +
            '<button data-el="apply">✓ ตั้งค่า</button>' +
          '</div>' +
          '<div class="row"><button data-el="start">▶ เริ่มนับ</button><button data-el="stop">⏸ หยุด</button>' +
            '<button data-el="reset">↺ ตั้งใหม่</button></div>' +
          '<div class="row"><span class="lbl">ปรับเวลา</span>' +
            '<button data-adj="-5">−5</button><button data-adj="-1">−1</button>' +
            '<button data-adj="1">+1</button><button data-adj="5">+5</button><span>นาที</span></div>' +
          '<div class="row"><label><input type="checkbox" data-el="auto"> หมดเวลาแล้วเข้าไลฟ์อัตโนมัติ</label></div>' +
          '<div class="row"><span class="lbl">โลโก้ค้างกลางจอ</span>' +
            '<input type="number" min="0" max="5" step="0.5" class="w70" data-el="hold"><span>วินาที</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="panel"><h3>ตารางการแข่งขัน (สูงสุด ' + L.MAX_MATCHES + ' คู่)</h3>' +
        '<div class="lr-rows" data-el="rows"></div>' +
        '<div class="row"><button data-el="add">+ เพิ่มคู่</button>' +
          '<button data-el="useCurrent">⇢ ใช้ทีม A/B ปัจจุบันเป็นคู่แรก</button></div>' +
      '</div>';

    ['toggle', 'stateText', 'go', 'fields', 'evLogo', 'evPick', 'evClear', 'clock', 'modeDur', 'minutes', 'modeTgt',
     'target', 'apply', 'start', 'stop', 'reset', 'auto', 'hold', 'rows', 'add', 'useCurrent'
    ].forEach(function (n) { els[n] = q(n); });

    FIELDS.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = f[1];
      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = f[2];
      input.className = 'grow';
      row.appendChild(lbl);
      row.appendChild(input);
      els.fields.appendChild(row);
      fieldEls[f[0]] = input;
      ctx.bindText(input, function (s, v) { s.lobby[f[0]] = v; });
    });

    ctx.bindScales(root);

    // ป้ายสถานะบนแถบบนสุด (เห็นทุกแท็บ)
    ctx.statusEl.innerHTML = '<span class="ls" data-el="ls"><i class="ls-dot"></i><span data-el="lsText"></span></span>' +
      '<button class="btn-go" data-el="lsGo" hidden>🚀 เข้าไลฟ์</button>';
    els.ls = q('ls', ctx.statusEl);
    els.lsText = q('lsText', ctx.statusEl);
    els.lsGo = q('lsGo', ctx.statusEl);
  }

  function bindStatic() {
    els.toggle.addEventListener('click', toggleVisible);
    els.go.addEventListener('click', function () { goLive('manual'); });
    els.lsGo.addEventListener('click', function () { goLive('manual'); });

    function setEventLogo(file) {
      ctx.resizeImage(file, C.eventLogoMax).then(function (url) {
        ctx.getLogos().event = url;
        ctx.saveLogos();
        ctx.sendLogos();
      }, function () { ctx.toast('เปิดไฟล์รูปไม่ได้', 'error'); });
    }
    els.evLogo.addEventListener('click', function () { ctx.pickImage(setEventLogo); });
    els.evPick.addEventListener('click', function () { ctx.pickImage(setEventLogo); });
    ctx.bindDrop(els.evLogo, setEventLogo);
    els.evClear.addEventListener('click', function () {
      ctx.getLogos().event = null;
      ctx.saveLogos();
      ctx.sendLogos();
    });

    els.apply.addEventListener('click', function () {
      var now = Date.now();
      if (els.modeTgt.checked) {
        var hhmm = els.target.value;
        if (L.targetToEndsAt(hhmm, now) === null) { ctx.toast(TARGET_ERROR, 'error'); return; }
        ctx.commit(function (s) { L.lobbySetTarget(s.lobby.countdown, hhmm, Date.now()); });
      } else {
        var minutes = clampInt(els.minutes.value, 1, 600);
        els.minutes.value = minutes;
        ctx.commit(function (s) { L.lobbySetDuration(s.lobby.countdown, minutes); });
      }
    });
    els.start.addEventListener('click', function () {
      ctx.commit(function (s) { L.lobbyStart(s.lobby.countdown, Date.now()); });
    });
    els.stop.addEventListener('click', function () {
      ctx.commit(function (s) { L.lobbyStop(s.lobby.countdown, Date.now()); });
    });
    els.reset.addEventListener('click', function () {
      ctx.commit(function (s) { L.lobbyReset(s.lobby.countdown); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-adj]'), function (btn) {
      btn.addEventListener('click', function () {
        var n = Number(btn.getAttribute('data-adj'));
        ctx.commit(function (s) { L.lobbyAdjust(s.lobby.countdown, n, Date.now()); });
      });
    });
    els.auto.addEventListener('change', function () {
      var on = els.auto.checked;
      ctx.commit(function (s) { s.lobby.autoGoLive = on; });
    });
    els.hold.addEventListener('change', function () {
      var ms = Math.max(0, Math.min(5000, Math.round((Number(els.hold.value) || 0) * 2) * 500));
      ctx.commit(function (s) { s.lobby.goLiveHoldMs = ms; });
    });

    els.add.addEventListener('click', function () {
      ctx.commit(function (s) {
        var list = s.lobby.matches;
        if (list.length >= L.MAX_MATCHES) return;
        list.push(L.makeMatch(plusTwoHours(list[list.length - 1].time)));
      });
    });
    els.useCurrent.addEventListener('click', function () {
      var id = ctx.getState().lobby.matches[0].id, logos = ctx.getLogos();
      ctx.commit(function (s) {
        var m = s.lobby.matches[0];
        ['A', 'B'].forEach(function (k) {
          var t = s.teams[k];
          m['team' + k] = { name: t.name, tag: t.tag, libId: t.libId || '' };
        });
        s.lobby.matches.forEach(function (x) { if (x.status === 'next') x.status = 'upcoming'; });
        m.status = 'next';
      });
      Promise.all([shrink(logos.A), shrink(logos.B)]).then(function (r) {
        if (!findMatch(ctx.getState(), id)) return;
        ctx.getLogos().schedule[id] = { A: r[0], B: r[1] };
        ctx.saveLogos();
        ctx.sendLogos();
      });
    });
  }

  /* ---------- แถวในตัวแก้ตาราง ---------- */
  function buildSide(id, side) {
    var wrap = document.createElement('span');
    wrap.className = 'lr-side';
    wrap.innerHTML =
      '<button class="logo-btn logo-btn--sm" data-el="logo" title="โลโก้ทีม (คลิกหรือลากไฟล์มาวาง)"></button>' +
      '<button class="btn-x" data-el="logoX" title="ลบโลโก้">✕</button>' +
      '<select data-el="lib" title="เลือกทีมจากคลัง"></select>' +
      '<input type="text" maxlength="32" data-el="name" placeholder="ชื่อทีม">';
    var ref = { logo: q('logo', wrap), logoX: q('logoX', wrap), lib: q('lib', wrap), name: q('name', wrap) };
    var key = 'team' + side;

    function upload(file) { uploadScheduleLogo(id, side, file); }
    ref.logo.addEventListener('click', function () { ctx.pickImage(upload); });
    ctx.bindDrop(ref.logo, upload);
    ref.logoX.addEventListener('click', function () { setScheduleLogo(id, side, null); });

    ref.lib.addEventListener('change', function () {
      var libId = ref.lib.value, team = null;
      ctx.getLibrary().forEach(function (t) { if (t.id === libId) team = t; });
      if (!team) return;
      ctx.commit(function (s) {
        var m = findMatch(s, id);
        if (m) m[key] = { name: team.name, tag: team.tag || '', libId: team.id };
      });
      shrink(team.logo).then(function (url) {
        if (findMatch(ctx.getState(), id)) setScheduleLogo(id, side, url);
      });
    });
    // พิมพ์ชื่อเอง = ไม่ผูกกับคลังแล้ว
    ctx.bindText(ref.name, function (s, v) {
      var m = findMatch(s, id);
      if (m) { m[key].name = v; m[key].libId = ''; m[key].tag = ''; }
    });
    return { el: wrap, ref: ref };
  }

  function buildRow(m) {
    var id = m.id;
    var row = document.createElement('div');
    row.className = 'lr-row';
    row.innerHTML =
      '<span class="lr-no" data-el="no"></span>' +
      '<input type="time" data-el="time">' +
      '<span data-el="slotA"></span><span class="lr-vs">VS</span><span data-el="slotB"></span>' +
      '<input type="text" maxlength="30" class="lr-note" data-el="note" placeholder="หมายเหตุ เช่น BO3">' +
      '<select data-el="status"></select>' +
      '<span class="lr-score" data-el="scoreBox" hidden>' +
        '<input type="number" min="0" max="9" data-el="scoreA"><b>:</b><input type="number" min="0" max="9" data-el="scoreB"></span>' +
      '<span class="spacer"></span>' +
      '<button data-el="up" title="เลื่อนขึ้น">↑</button><button data-el="down" title="เลื่อนลง">↓</button>' +
      '<button class="btn-x" data-el="del" title="ลบคู่นี้">✕</button>';
    var ref = {};
    ['no', 'time', 'note', 'status', 'scoreBox', 'scoreA', 'scoreB', 'up', 'down', 'del'].forEach(function (n) {
      ref[n] = q(n, row);
    });
    var a = buildSide(id, 'A'), b = buildSide(id, 'B');
    q('slotA', row).parentNode.replaceChild(a.el, q('slotA', row));
    q('slotB', row).parentNode.replaceChild(b.el, q('slotB', row));
    ref.A = a.ref;
    ref.B = b.ref;

    STATUS.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s[0];
      o.textContent = s[1];
      ref.status.appendChild(o);
    });

    ref.time.addEventListener('change', function () {
      var v = ref.time.value;
      ctx.commit(function (s) { var x = findMatch(s, id); if (x) x.time = v; });
    });
    ctx.bindText(ref.note, function (s, v) { var x = findMatch(s, id); if (x) x.note = v; });
    ref.status.addEventListener('change', function () {
      var v = ref.status.value;
      ctx.commit(function (s) {
        var x = findMatch(s, id);
        if (!x) return;
        // "คู่ถัดไป" และ "กำลังแข่ง" มีได้อย่างละคู่เดียว
        if (v === 'next' || v === 'live') {
          s.lobby.matches.forEach(function (o) { if (o !== x && o.status === v) o.status = 'upcoming'; });
        }
        x.status = v;
      });
    });
    ['A', 'B'].forEach(function (k) {
      ref['score' + k].addEventListener('change', function () {
        var v = clampInt(ref['score' + k].value, 0, 9);
        ctx.commit(function (s) { var x = findMatch(s, id); if (x) x['score' + k] = v; });
      });
    });
    function move(dir) {
      ctx.commit(function (s) { L.moveMatch(s.lobby.matches, indexOfMatch(s, id), dir); });
    }
    ref.up.addEventListener('click', function () { move(-1); });
    ref.down.addEventListener('click', function () { move(1); });
    ref.del.addEventListener('click', function () {
      var st = ctx.getState();
      if (st.lobby.matches.length <= 1) return;
      var x = findMatch(st, id);
      if (!x || !window.confirm('ลบคู่ ' + x.teamA.name + ' VS ' + x.teamB.name + ' ?')) return;
      ctx.commit(function (s) {
        var i = indexOfMatch(s, id);
        if (i >= 0 && s.lobby.matches.length > 1) s.lobby.matches.splice(i, 1);
      });
      var logos = ctx.getLogos();
      if (logos.schedule[id]) {
        delete logos.schedule[id];
        ctx.saveLogos();
        ctx.sendLogos();
      }
    });
    return { el: row, ref: ref };
  }

  function setLogoBtn(btn, src) {
    btn.style.backgroundImage = src ? 'url("' + src + '")' : '';
    btn.textContent = src ? '' : '🖼';
  }

  function renderRows(lb) {
    var list = lb.matches;
    var key = list.map(function (m) { return m.id; }).join();
    if (key !== rowsKey) {
      var old = rows;
      rows = {};
      while (els.rows.firstChild) els.rows.removeChild(els.rows.firstChild);
      list.forEach(function (m) {
        rows[m.id] = old[m.id] || buildRow(m);
        els.rows.appendChild(rows[m.id].el);
      });
      rowsKey = key;
    }
    var sch = ctx.getLogos().schedule || {};
    list.forEach(function (m, i) {
      var ref = rows[m.id].ref, lg = sch[m.id] || {};
      ref.no.textContent = String(i + 1);
      ctx.setVal(ref.time, m.time || '');
      ctx.setVal(ref.note, m.note || '');
      ctx.setVal(ref.status, m.status);
      ref.scoreBox.hidden = m.status !== 'done';
      ctx.setVal(ref.scoreA, String(m.scoreA));
      ctx.setVal(ref.scoreB, String(m.scoreB));
      ref.up.disabled = i === 0;
      ref.down.disabled = i === list.length - 1;
      ref.del.disabled = list.length <= 1;
      ['A', 'B'].forEach(function (k) {
        var side = ref[k], t = m['team' + k];
        ctx.setVal(side.name, t.name || '');
        ctx.fillLibSelect(side.lib, t.libId);
        setLogoBtn(side.logo, lg[k]);
        side.logoX.hidden = !lg[k];
      });
    });
    els.add.disabled = list.length >= L.MAX_MATCHES;
  }

  /* ---------- render / tick ---------- */
  function render(state) {
    if (!root) return;
    var lb = state.lobby, c = lb.countdown;
    els.toggle.textContent = (lb.visible ? '🙈 ปิดหน้ารอ ' : '👁 เปิดหน้ารอ ') + ctx.keyHint('lobbyToggle');
    els.toggle.classList.toggle('is-on', lb.visible);
    els.stateText.textContent = lb.visible ? 'สถานะ: ● กำลังแสดงบนไลฟ์' : 'สถานะ: ○ ปิดอยู่';
    els.stateText.classList.toggle('is-on', lb.visible);
    els.go.disabled = !lb.visible;

    FIELDS.forEach(function (f) { ctx.setVal(fieldEls[f[0]], lb[f[0]] || ''); });
    setLogoBtn(els.evLogo, ctx.getLogos().event);

    // โหมด/ช่องตั้งเวลา: ซิงก์จาก state เฉพาะตอนค่าที่ตั้งไว้เปลี่ยน (ไม่ทับสิ่งที่ผู้ใช้กำลังเลือกค้างไว้)
    var sig = c.mode + '|' + c.durationMs + '|' + c.targetTime;
    if (sig !== cfgSig) {
      cfgSig = sig;
      els.modeDur.checked = c.mode === 'duration';
      els.modeTgt.checked = c.mode === 'target';
      if (c.mode === 'duration') els.minutes.value = Math.round(c.durationMs / 60000);
      else if (!els.minutes.value) els.minutes.value = 30;
      els.target.value = c.targetTime || '';
    }
    els.start.disabled = c.running || c.remainingMs <= 0;
    els.stop.disabled = !c.running;
    els.auto.checked = !!lb.autoGoLive;
    ctx.setVal(els.hold, String(lb.goLiveHoldMs / 1000));

    renderRows(lb);
  }

  function tick(now) {
    if (!root) return;
    var lb = ctx.getState().lobby;
    var clock = L.formatLong(L.lobbyRemaining(lb.countdown, now));
    if (clock !== lastClock) { lastClock = clock; els.clock.textContent = clock; }
    els.clock.classList.toggle('is-running', lb.countdown.running);
    var status = lb.visible ? 'หน้ารอ: ● แสดงอยู่ · ' + clock : 'หน้ารอ: ○ ปิด';
    if (status !== lastStatus) {
      lastStatus = status;
      els.lsText.textContent = status;
      els.ls.classList.toggle('is-on', lb.visible);
      els.lsGo.hidden = !lb.visible;
    }
  }

  // ทุก 250 ms: เข้าไลฟ์อัตโนมัติ (ชั้นที่ 1) + เตือนเหลือ 5 นาที / 1 นาที
  // ใช้ setInterval เพราะ requestAnimationFrame หยุดเมื่อหน้าต่างถูกบัง/ย่อ
  function watch() {
    var lb = ctx.getState().lobby, c = lb.countdown, now = Date.now();
    if (L.shouldAutoGoLive(lb, now)) { prevRem = null; goLive('auto'); return; }
    if (!lb.visible || !c.running) { prevRem = null; return; }
    var rem = L.lobbyRemaining(c, now);
    if (prevRem !== null) {
      if (prevRem > 300000 && rem <= 300000 && rem > 240000) {
        ctx.toast('อีก 5 นาทีเข้าไลฟ์ — เตรียมภาพเกมและแถบสกอร์ให้พร้อม');
      } else if (prevRem > 60000 && rem <= 60000 && rem > 0) {
        ctx.toast('อีก 1 นาทีเข้าไลฟ์');
      }
    }
    prevRem = rem;
  }

  function init(context) {
    ctx = context;
    root = ctx.containerEl;
    buildStatic();
    bindStatic();
    setInterval(watch, 250);
  }

  window.ValoLobbyControl = {
    init: init,
    render: render,
    tick: tick,
    goLive: goLive,
    toggleVisible: toggleVisible
  };
})();
