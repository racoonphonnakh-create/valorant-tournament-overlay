/* =====================================================================
   js/control.js — หน้าคอนโทรล (เปิดใน Chrome)
   ---------------------------------------------------------------------
   แท็บ 🎮 ควบคุมการแข่ง (ไฟล์นี้) + แท็บ 🕒 หน้ารอเข้าไลฟ์ (lobby-control.js)
   ทุกการแก้ไขผ่าน commit() → Undo ได้, บันทึกอัตโนมัติ, ส่งให้ overlay อัตโนมัติ
   ===================================================================== */
(function () {
  'use strict';
  var S = window.ValoState, L = window.ValoLobby, C = window.ValoConfig;
  var G = window.ValoGameData, LC = window.ValoLobbyControl, RP = window.ValoReplay, LU = window.ValoLineupControl;
  var KEY = C.storage;
  var SIDE_LABEL = { atk: 'ATK (ฝ่ายบุก)', def: 'DEF (ฝ่ายรับ)' };

  var state, logos, library, players, link;      // players = ฐานข้อมูลนักแข่ง
  var undoStack = [], sendQueued = false;
  var teamEls = {}, m = {}, fileInput = null, fileCb = null, lastClock = '';

  function $(id) { return document.getElementById(id); }
  function q(name, base) { return base.querySelector('[data-el="' + name + '"]'); }
  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- localStorage ---------- */
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { toast('บันทึกไม่ได้ — พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม (ลองลดขนาด/จำนวนโลโก้)', 'error'); return false; }
  }

  /* ---------- โหลด + ตรวจข้อมูล ---------- */
  // merge กับค่าเริ่มต้น: ไม่มี lobby → makeDefaultLobby() · lobby.matches ใช้ของที่บันทึกไว้ทั้งก้อน
  function normalizeState(saved) {
    var st = S.merge(S.makeDefaultState(), saved || {});
    var lb = st.lobby, ids = {};
    if (!Array.isArray(lb.matches) || !lb.matches.length) lb.matches = L.makeDefaultLobby().matches;
    lb.matches = lb.matches.slice(0, L.MAX_MATCHES).map(function (x) {
      var mm = S.merge(L.makeMatch(), x);
      if (ids[mm.id]) mm.id = L.makeMatch().id;
      ids[mm.id] = true;
      return mm;
    });
    ['A', 'B'].forEach(function (k) { st.lineup[k] = normalizeLineupTeam(st.lineup[k]); });
    return st;
  }
  function normalizeLineupTeam(t) {
    var team = S.merge(S.makeLineupTeam(), t || {}), players = [];
    for (var i = 0; i < S.LINEUP_SIZE; i++) players.push(S.merge(S.makePlayer(), team.players[i] || {}));
    team.players = players;
    team.size = Math.max(1, Math.min(S.LINEUP_SIZE, Math.round(Number(team.size)) || S.LINEUP_DEFAULT));
    return team;
  }
  function normalizePlayers(saved) {
    return (Array.isArray(saved) ? saved : []).filter(function (p) { return p && p.id && p.name; }).map(function (p) {
      return { id: p.id, name: String(p.name), role: p.role || '', agent: p.agent || '', photo: p.photo || null };
    });
  }

  /* ---------- ฐานข้อมูลนักแข่ง ---------- */
  function savePlayers() { return lsSet(KEY.players, players); }
  function findPlayer(id) {
    for (var i = 0; i < players.length; i++) if (players[i].id === id) return players[i];
    return null;
  }
  function addPlayer(p) {
    var x = { id: newId('p'), name: String(p.name || '').trim().slice(0, 24), role: p.role || '', agent: p.agent || '', photo: p.photo || null };
    players.push(x);
    if (!savePlayers()) { players.pop(); return null; }
    return x;
  }
  // หาตามชื่อ (ไม่สนตัวพิมพ์เล็กใหญ่) ไม่เจอก็สร้างใหม่ — ใช้ย้ายข้อมูลไลน์อัพแบบเก่าที่ยังไม่มี pid
  function ensurePlayer(name, role, agent, photo) {
    var key = String(name || '').trim().toLowerCase(), found = null;
    if (!key) return null;
    players.forEach(function (p) { if (!found && p.name.toLowerCase() === key) found = p; });
    if (found) {
      if (!found.photo && photo) { found.photo = photo; savePlayers(); }
      return found;
    }
    return addPlayer({ name: name, role: role, agent: agent, photo: photo });
  }
  // สำเนาชื่อ/ตำแหน่งในไลน์อัพต้องตรงกับฐานข้อมูลเสมอ
  function refreshLineupFromDb(s) {
    ['A', 'B'].forEach(function (k) {
      s.lineup[k].players.forEach(function (slot, i) {
        if (!slot.pid) return;
        var p = findPlayer(slot.pid);
        if (!p) { s.lineup[k].players[i] = S.makePlayer(); return; }
        slot.name = p.name;
        slot.role = p.role;
      });
    });
  }
  function updatePlayer(id, fn) {
    var p = findPlayer(id);
    if (!p) return;
    var before = JSON.stringify(p);
    fn(p);
    if (!savePlayers()) { var old = JSON.parse(before); Object.keys(old).forEach(function (x) { p[x] = old[x]; }); return; }
    commit(function (s) { refreshLineupFromDb(s); }, { undo: false });
  }
  function removePlayer(id) {
    players = players.filter(function (p) { return p.id !== id; });
    savePlayers();
    commit(function (s) { refreshLineupFromDb(s); });
  }
  // ไลน์อัพจากเวอร์ชันก่อน (มีชื่อแต่ไม่มี pid) → ใส่ลงฐานข้อมูลให้อัตโนมัติ
  function migrateLineup(s, oldPhotos) {
    var moved = 0;
    ['A', 'B'].forEach(function (k) {
      s.lineup[k].players.forEach(function (slot, i) {
        if (slot.pid || !slot.name) return;
        var p = ensurePlayer(slot.name, slot.role, slot.agent, oldPhotos && oldPhotos[k] && oldPhotos[k][i]);
        if (p) { slot.pid = p.id; moved++; }
      });
    });
    return moved;
  }
  // รูปที่ overlay ใช้ (logos.players) สร้างจากฐานข้อมูลทุกครั้ง · ส่งเฉพาะตอนเปลี่ยน
  function syncLineupPhotos() {
    var changed = false;
    ['A', 'B'].forEach(function (k) {
      var arr = state.lineup[k].players.map(function (slot) {
        var p = slot.pid ? findPlayer(slot.pid) : null;
        return (p && p.photo) || null;
      });
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] !== logos.players[k][i]) { changed = true; break; }
      }
      if (changed) logos.players[k] = arr;
    });
    if (changed && link) sendLogos();
  }
  function normalizeLogos(saved) {
    var l = saved && typeof saved === 'object' ? saved : {};
    var sch = l.schedule && typeof l.schedule === 'object' && !Array.isArray(l.schedule) ? l.schedule : {};
    return { A: l.A || null, B: l.B || null, event: l.event || null, schedule: sch, players: normalizePhotos(l.players) };
  }
  // รูปผู้เล่น: { A: [5], B: [5] } (dataURL | null) — ลำดับตรงกับ state.lineup[k].players
  function normalizePhotos(p) {
    var out = {};
    ['A', 'B'].forEach(function (k) {
      var arr = p && Array.isArray(p[k]) ? p[k] : [];
      out[k] = [];
      for (var i = 0; i < S.LINEUP_SIZE; i++) out[k].push(arr[i] || null);
    });
    return out;
  }
  function normalizeLibrary(saved) {
    return (Array.isArray(saved) ? saved : []).filter(function (t) { return t && t.id && t.name; });
  }
  // โลโก้ของคู่ที่ไม่มีแล้วไม่ควรค้างใน localStorage
  function pruneScheduleLogos() {
    var alive = {}, changed = false;
    state.lobby.matches.forEach(function (x) { alive[x.id] = true; });
    Object.keys(logos.schedule).forEach(function (id) {
      if (!alive[id]) { delete logos.schedule[id]; changed = true; }
    });
    return changed;
  }

  /* ---------- commit / undo / ส่ง ---------- */
  function saveState() { lsSet(KEY.state, state); }
  // รูปผู้เล่นไม่ต้องเก็บซ้ำใน logos (อยู่ในฐานข้อมูลนักแข่งแล้ว)
  function saveLogos() { lsSet(KEY.logos, Object.assign({}, logos, { players: null })); renderAll(); }
  function sendLogos() { link.send('logos', logos); }

  // รวบส่ง state ครั้งเดียวต่อเฟรม (ห้ามเปลี่ยนเป็นส่งทันทีทุก commit — ดู LOBBY.md 5.1)
  function scheduleSend() {
    if (sendQueued) return;
    sendQueued = true;
    function send() {
      if (!sendQueued) return;
      sendQueued = false;
      link.send('state', state);
    }
    // rAF ไม่ทำงานในหน้าที่มองไม่เห็น → ใช้ setTimeout แทน (และกันไว้อีกชั้นเผื่อถูกย่อระหว่างรอเฟรม)
    if (document.hidden) setTimeout(send, 16);
    else { requestAnimationFrame(send); setTimeout(send, 100); }
  }

  // fn แก้ state ในที่เดิม หรือคืน state ใหม่ทั้งก้อน · opts.undo === false → ไม่เก็บ Undo
  function commit(fn, opts) {
    if (!opts || opts.undo !== false) {
      undoStack.push(JSON.stringify(state));
      if (undoStack.length > C.undoMax) undoStack.shift();
    }
    var next = fn(state);
    if (next && typeof next === 'object') state = next;
    saveState();
    scheduleSend();
    syncLineupPhotos();
    renderAll();
  }
  function undo() {
    if (!undoStack.length) { toast('ไม่มีอะไรให้ย้อนกลับ'); return; }
    state = JSON.parse(undoStack.pop());
    refreshLineupFromDb(state);
    saveState();
    scheduleSend();
    syncLineupPhotos();
    renderAll();
    toast('ย้อนกลับแล้ว');
  }

  /* ---------- เครื่องมือ UI (ใช้ร่วมกับ lobby-control.js) ---------- */
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 3600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }
  // ไม่ทับช่องที่กำลังพิมพ์อยู่
  function setVal(input, value) {
    if (document.activeElement !== input && input.value !== value) input.value = value;
  }
  // พิมพ์แล้วขึ้นจอทันที (debounce 120ms) · Undo เก็บครั้งเดียวตอนเริ่มพิมพ์
  function bindText(input, apply) {
    var timer = 0, fresh = true;
    function flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      var v = input.value, first = fresh;
      fresh = false;
      commit(function (s) { apply(s, v); }, { undo: first });
    }
    input.addEventListener('focus', function () { fresh = true; });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(flush, 120);
    });
    input.addEventListener('blur', flush);
  }
  // ย่อรูป (File หรือ dataURL) ให้ด้านยาวไม่เกิน max → dataURL (PNG หรือ JPEG ถ้า type = 'image/jpeg')
  function resizeImage(src, max, type) {
    return new Promise(function (resolve, reject) {
      function load(url) {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, max / Math.max(img.width, img.height, 1));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k));
          cv.height = Math.max(1, Math.round(img.height * k));
          var g = cv.getContext('2d');
          if (type === 'image/jpeg') { g.fillStyle = '#1b2733'; g.fillRect(0, 0, cv.width, cv.height); }   // JPEG ไม่มีพื้นใส
          g.drawImage(img, 0, 0, cv.width, cv.height);
          try { resolve(type === 'image/jpeg' ? cv.toDataURL('image/jpeg', 0.85) : cv.toDataURL('image/png')); } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('โหลดรูปไม่ได้')); };
        img.src = url;
      }
      if (typeof src === 'string') { load(src); return; }
      var fr = new FileReader();
      fr.onload = function () { load(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(src);
    });
  }
  function pickImage(cb) {
    fileCb = cb;
    fileInput.value = '';
    fileInput.click();
  }
  function bindDrop(el, cb) {
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('is-drop'); });
    el.addEventListener('dragleave', function () { el.classList.remove('is-drop'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('is-drop');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) cb(f);
    });
  }
  function fillLibSelect(sel, libId) {
    var sig = library.map(function (t) { return t.id + '=' + t.name; }).join('|');
    if (sel._sig !== sig) {
      sel._sig = sig;
      sel.innerHTML = '';
      var first = document.createElement('option');
      first.value = '';
      first.textContent = 'คลัง ▼';
      sel.appendChild(first);
      library.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        sel.appendChild(o);
      });
    }
    var has = library.some(function (t) { return t.id === libId; });
    if (document.activeElement !== sel) sel.value = has ? libId : '';
  }
  // แถบเลื่อนปรับขนาดโลโก้ (%) → state.display[key] · wrap = element ที่มี input[type=range] + [data-el="pct"]
  var scaleEls = [];
  function scaleRowHtml(key, label) {
    var r = S.LOGO_SCALE[key];
    return '<div class="row" data-scale="' + key + '"><span class="lbl">' + label + '</span>' +
      '<input type="range" class="grow" min="' + r[0] + '" max="' + r[1] + '" step="5">' +
      '<span class="pct" data-el="pct"></span><button data-el="scaleReset" title="กลับเป็น 100%">↺</button></div>';
  }
  function bindScales(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-scale]'), function (row) {
      var key = row.getAttribute('data-scale'), range = S.LOGO_SCALE[key];
      var ref = { key: key, input: row.querySelector('input'), pct: q('pct', row) };
      scaleEls.push(ref);
      bindText(ref.input, function (s, v) {
        s.display[key] = Math.max(range[0], Math.min(range[1], Math.round(Number(v) || 100)));
      });
      q('scaleReset', row).addEventListener('click', function () { commit(function (s) { s.display[key] = 100; }); });
    });
  }
  function renderScales() {
    scaleEls.forEach(function (ref) {
      var v = state.display[ref.key];
      setVal(ref.input, String(v));
      ref.pct.textContent = v + '%';
    });
  }

  function setLogoBtn(btn, src) {
    btn.style.backgroundImage = src ? 'url("' + src + '")' : '';
    btn.textContent = src ? '' : '🖼';
  }

  /* ---------- แท็บ 🎮 ควบคุมการแข่ง ---------- */
  function teamPanelHtml(k) {
    return '<div class="panel team" data-team="' + k + '">' +
      '<h3>ทีม ' + k + ' <span class="side" data-el="side"></span></h3>' +
      '<div class="row">' +
        '<button class="logo-btn" data-el="logo" title="โลโก้ทีม (คลิกหรือลากไฟล์มาวาง)"></button>' +
        '<div class="col grow">' +
          '<input type="text" maxlength="32" data-el="name" placeholder="ชื่อทีม">' +
          '<input type="text" maxlength="5" data-el="tag" placeholder="ชื่อย่อ (≤ 5 ตัว)">' +
        '</div></div>' +
      '<div class="row"><select data-el="lib"></select>' +
        '<button data-el="saveLib">💾 เก็บลงคลัง</button><button data-el="clearLogo">ลบโลโก้</button></div>' +
      '<div class="row score-row">' +
        '<span class="lbl">รอบ</span><button data-el="sMinus">−</button><b data-el="score">0</b>' +
        '<button data-el="sPlus">+ <span data-key="score' + k + '"></span></button>' +
        '<span class="lbl">แมพที่ชนะ</span><button data-el="mMinus">−</button><b data-el="maps">0</b>' +
        '<button data-el="mPlus">+</button></div>' +
      '</div>';
  }

  function buildMain() {
    var root = $('tab-main');
    root.innerHTML =
      '<div class="grid2">' + teamPanelHtml('A') + teamPanelHtml('B') + '</div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3>เวลารอบ</h3>' +
          '<div class="clock" data-el="clock">1:40</div>' +
          '<div class="row"><button data-el="tBuy">🛒 ซื้อของ 0:30 <span data-key="timerBuy"></span></button>' +
            '<button data-el="tRound">▶ เริ่มรอบ 1:40 <span data-key="timerRound"></span></button>' +
            '<button data-el="tSpike">💣 วางสไปก์ 0:45 <span data-key="timerSpike"></span></button>' +
            '<button data-el="tToggle">⏯ หยุด/เดินต่อ <span data-key="timerToggle"></span></button></div>' +
        '</div>' +
        '<div class="panel"><h3>แมตช์</h3>' +
          '<div class="row"><span class="lbl">แมพ</span><select data-el="map"></select>' +
            '<span class="lbl">แมพที่</span><input type="number" min="1" max="5" class="w70" data-el="mapNo">' +
            '<span class="lbl">BO</span><select data-el="bestOf"><option>1</option><option>3</option><option>5</option></select></div>' +
          '<div class="row"><span class="lbl">ข้อความเปลี่ยนแมตช์</span>' +
            '<input type="text" maxlength="30" class="grow" data-el="title"></div>' +
          '<div class="row"><button data-el="swap">⇄ สลับฝั่ง <span data-key="swap"></span></button>' +
            '<button data-el="sbToggle"></button>' +
            '<button data-el="trans">🎬 แอนิเมชันเปลี่ยนแมตช์ <span data-key="transition"></span></button></div>' +
          '<div class="row"><span class="lbl">ผลแพ้ชนะ</span>' +
            '<button data-el="winA">🏆 ทีม A ชนะ <span data-key="winA"></span></button>' +
            '<button data-el="winB">🏆 ทีม B ชนะ <span data-key="winB"></span></button>' +
            '<button data-el="winClear">✕ ล้างผล <span data-key="winClear"></span></button></div>' +
          '<div class="row"><button data-el="newMap">🗺 แมพใหม่</button>' +
            '<button data-el="newMatch">🆕 แมตช์ใหม่</button></div>' +
        '</div>' +
      '</div>' +
      '<div class="grid2">' +
        '<div class="panel" data-el="replay"></div>' +
        '<div class="panel"><h3>คลังทีม</h3><div class="lib-list" data-el="libList"></div></div>' +
        '<div class="panel"><h3>ข้อมูล</h3>' +
          '<div class="row"><span class="lbl">โลโก้งาน</span>' +
            '<button class="logo-btn" data-el="evLogo" title="คลิกหรือลากไฟล์มาวาง"></button>' +
            '<small>ใช้ทั้งในแอนิเมชันเปลี่ยนแมตช์และหน้ารอเข้าไลฟ์</small></div>' +
          scaleRowHtml('sbLogo', 'ขนาดโลโก้ทีม (แถบสกอร์)') +
          scaleRowHtml('trLogo', 'ขนาดโลโก้งาน (แอนิเมชันเปลี่ยนแมตช์)') +
          '<div class="row"><button data-el="backup">⬇ สำรองข้อมูล</button>' +
            '<button data-el="import">⬆ นำเข้า</button></div>' +
        '</div>' +
      '</div>';

    ['clock', 'tBuy', 'tRound', 'tSpike', 'tToggle', 'map', 'mapNo', 'bestOf', 'title', 'swap', 'sbToggle', 'trans',
     'newMap', 'newMatch', 'winA', 'winB', 'winClear', 'libList', 'evLogo', 'backup', 'import'
    ].forEach(function (n) { m[n] = q(n, root); });

    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— ไม่ระบุ —';
    m.map.appendChild(blank);
    G.maps.forEach(function (name) {
      var o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      m.map.appendChild(o);
    });

    ['A', 'B'].forEach(function (k) {
      var p = root.querySelector('[data-team="' + k + '"]'), ref = {};
      ['side', 'logo', 'name', 'tag', 'lib', 'saveLib', 'clearLogo', 'sMinus', 'score', 'sPlus', 'mMinus', 'maps', 'mPlus'
      ].forEach(function (n) { ref[n] = q(n, p); });
      teamEls[k] = ref;
      bindTeam(k, ref);
    });
    bindMain();
    bindScales(root);
  }

  function setTeamLogo(k, file) {
    resizeImage(file, C.logoMax).then(function (url) {
      logos[k] = url;
      saveLogos();
      sendLogos();
    }, function () { toast('เปิดไฟล์รูปไม่ได้', 'error'); });
  }
  function addScore(k, d) { commit(function (s) { s.teams[k].score = Math.max(0, Math.min(99, s.teams[k].score + d)); }); }
  function addMaps(k, d) { commit(function (s) { s.teams[k].maps = Math.max(0, Math.min(3, s.teams[k].maps + d)); }); }

  function bindTeam(k, ref) {
    bindText(ref.name, function (s, v) { s.teams[k].name = v; s.teams[k].libId = ''; });
    bindText(ref.tag, function (s, v) { s.teams[k].tag = v; });
    ref.logo.addEventListener('click', function () { pickImage(function (f) { setTeamLogo(k, f); }); });
    bindDrop(ref.logo, function (f) { setTeamLogo(k, f); });
    ref.clearLogo.addEventListener('click', function () { logos[k] = null; saveLogos(); sendLogos(); });
    ref.sMinus.addEventListener('click', function () { addScore(k, -1); });
    ref.sPlus.addEventListener('click', function () { addScore(k, 1); });
    ref.mMinus.addEventListener('click', function () { addMaps(k, -1); });
    ref.mPlus.addEventListener('click', function () { addMaps(k, 1); });
    ref.lib.addEventListener('change', function () {
      var team = null;
      library.forEach(function (t) { if (t.id === ref.lib.value) team = t; });
      if (team) loadTeamFromLibrary(k, team);
    });
    ref.saveLib.addEventListener('click', function () { saveTeamToLibrary(k); });
  }

  // คลังทีมเก็บ ชื่อ / ชื่อย่อ / โลโก้ / ไลน์อัพ (อ้างนักแข่งด้วย pid — รูปอยู่ในฐานข้อมูลนักแข่ง)
  function loadTeamFromLibrary(k, team) {
    var moved = [];
    commit(function (s) {
      s.teams[k].name = team.name;
      s.teams[k].tag = team.tag || '';
      s.teams[k].libId = team.id;
      if (!team.lineup) return;
      var lu = normalizeLineupTeam(S.clone(team.lineup)), other = k === 'A' ? 'B' : 'A';
      lu.players.forEach(function (slot, i) {
        if (!slot.pid || !findPlayer(slot.pid)) {
          var p = slot.name ? ensurePlayer(slot.name, slot.role, slot.agent, (team.photos || [])[i]) : null;
          lu.players[i] = p ? { pid: p.id, name: p.name, role: p.role, agent: slot.agent } : S.makePlayer();
        }
      });
      // คนเดียวอยู่สองทีมไม่ได้ → เอาออกจากอีกทีม
      lu.players.forEach(function (slot, i) {
        if (!slot.pid || i >= lu.size) return;
        s.lineup[other].players.forEach(function (o, j) {
          if (o.pid === slot.pid) { s.lineup[other].players[j] = S.makePlayer(); moved.push(slot.name); }
        });
      });
      s.lineup[k] = lu;
      refreshLineupFromDb(s);
    });
    if (moved.length) toast('ย้าย ' + moved.join(', ') + ' ออกจากอีกทีม (คนเดียวอยู่สองทีมไม่ได้)');
    logos[k] = team.logo || null;
    saveLogos();
    sendLogos();
  }
  function saveTeamToLibrary(k) {
    var t = state.teams[k], entry = null;
    library.forEach(function (x) { if (x.id === t.libId || x.name === t.name) entry = x; });
    var isNew = !entry;
    if (isNew) entry = { id: newId('t') };
    var backup = JSON.stringify(entry);
    entry.name = t.name;
    entry.tag = t.tag;
    entry.logo = logos[k] || null;
    entry.lineup = S.clone(state.lineup[k]);
    delete entry.photos;                              // เวอร์ชันเก่าเก็บรูปไว้ในคลังทีม — ตอนนี้อยู่ในฐานข้อมูลนักแข่ง
    if (isNew) library.push(entry);
    if (!lsSet(KEY.library, library)) {               // เต็ม → คืนค่าเดิม
      if (isNew) library.pop(); else { var old = JSON.parse(backup); Object.keys(entry).forEach(function (x) { delete entry[x]; }); Object.keys(old).forEach(function (x) { entry[x] = old[x]; }); }
      return;
    }
    commit(function (s) { s.teams[k].libId = entry.id; }, { undo: false });
    toast('เก็บ "' + t.name + '" (รวมไลน์อัพ) ลงคลังแล้ว');
  }

  function startPhase(phase) { commit(function (s) { S.timerStartPhase(s.timer, phase, Date.now()); }); }
  function toggleTimer() { commit(function (s) { S.timerToggle(s.timer, Date.now()); }); }
  function swapSides() {
    commit(function (s) { var a = s.teams.A.side; s.teams.A.side = s.teams.B.side; s.teams.B.side = a; });
  }
  function toggleScoreboard() { commit(function (s) { s.scoreboard.visible = !s.scoreboard.visible; }); }
  // กดทีมเดิมซ้ำ = ล้างผล · '' = ล้างผล
  function setWinner(k) {
    if (!k && !state.result.winner) return;
    commit(function (s) { s.result.winner = s.result.winner === k ? '' : k; });
  }
  function playTransition() { link.send('play', { anim: 'transition', title: state.match.title }); }

  function bindMain() {
    m.tBuy.addEventListener('click', function () { startPhase('buy'); });
    m.tRound.addEventListener('click', function () { startPhase('round'); });
    m.tSpike.addEventListener('click', function () { startPhase('spike'); });
    m.tToggle.addEventListener('click', toggleTimer);
    m.swap.addEventListener('click', swapSides);
    m.sbToggle.addEventListener('click', toggleScoreboard);
    m.trans.addEventListener('click', playTransition);
    m.winA.addEventListener('click', function () { setWinner('A'); });
    m.winB.addEventListener('click', function () { setWinner('B'); });
    m.winClear.addEventListener('click', function () { setWinner(''); });
    m.map.addEventListener('change', function () { var v = m.map.value; commit(function (s) { s.match.map = v; }); });
    m.mapNo.addEventListener('change', function () {
      var v = Math.max(1, Math.min(5, Math.round(Number(m.mapNo.value) || 1)));
      commit(function (s) { s.match.mapNo = v; });
    });
    m.bestOf.addEventListener('change', function () {
      var v = Number(m.bestOf.value) || 3;
      commit(function (s) { s.match.bestOf = v; });
    });
    bindText(m.title, function (s, v) { s.match.title = v; });

    // "แมพใหม่" / "แมตช์ใหม่" ห้ามแตะ state.lobby
    m.newMap.addEventListener('click', function () {
      if (!window.confirm('เริ่มแมพใหม่? (คะแนนรอบกลับเป็น 0 : 0)')) return;
      commit(function (s) {
        s.teams.A.score = 0;
        s.teams.B.score = 0;
        s.match.mapNo = Math.min(5, s.match.mapNo + 1);
        s.match.map = '';
        s.result.winner = '';
        S.timerReset(s.timer);
      });
    });
    m.newMatch.addEventListener('click', function () {
      if (!window.confirm('เริ่มแมตช์ใหม่? (คะแนน แมพ และเวลาจะถูกรีเซ็ต · ชื่อทีมและหน้ารอไม่หาย)')) return;
      commit(function (s) {
        var fresh = S.makeDefaultState();
        fresh.lobby = s.lobby;                       // ก๊อป lobby เดิมกลับเข้าไป
        fresh.scoreboard = s.scoreboard;
        fresh.display = s.display;
        fresh.replay = s.replay;
        fresh.lineup = s.lineup;
        fresh.match.bestOf = s.match.bestOf;
        fresh.match.title = s.match.title;
        ['A', 'B'].forEach(function (k) {
          fresh.teams[k].name = s.teams[k].name;
          fresh.teams[k].tag = s.teams[k].tag;
          fresh.teams[k].libId = s.teams[k].libId;
        });
        return fresh;
      });
    });

    function setEventLogo(f) {
      resizeImage(f, C.eventLogoMax).then(function (url) {
        logos.event = url;
        saveLogos();
        sendLogos();
      }, function () { toast('เปิดไฟล์รูปไม่ได้', 'error'); });
    }
    m.evLogo.addEventListener('click', function () { pickImage(setEventLogo); });
    bindDrop(m.evLogo, setEventLogo);

    m.backup.addEventListener('click', backup);
    m.import.addEventListener('click', function () { $('importFile').value = ''; $('importFile').click(); });
    $('importFile').addEventListener('change', function () {
      var f = $('importFile').files[0];
      if (f) importBackup(f);
    });
  }

  /* ---------- สำรอง / นำเข้า ---------- */
  function backup() {
    var data = JSON.stringify({ app: 'valo-backup', v: 2, state: state, logos: Object.assign({}, logos, { players: null }), library: library, players: players });
    var a = document.createElement('a');
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'valo-backup-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' +
      two(d.getHours()) + two(d.getMinutes()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('สำรองข้อมูลแล้ว');
  }
  function importBackup(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { data = null; }
      if (!data || data.app !== 'valo-backup' || !data.state) { toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบ', 'error'); return; }
      library = normalizeLibrary(data.library);
      lsSet(KEY.library, library);
      if (Array.isArray(data.players)) { players = normalizePlayers(data.players); savePlayers(); }
      var oldPhotos = data.logos && data.logos.players;
      logos = normalizeLogos(data.logos);
      commit(function () { var st = normalizeState(data.state); migrateLineup(st, oldPhotos); refreshLineupFromDb(st); return st; });
      pruneScheduleLogos();
      saveLogos();
      sendLogos();
      toast('นำเข้าข้อมูลแล้ว');
    };
    fr.readAsText(file);
  }

  /* ---------- render ---------- */
  function renderLibrary() {
    var sig = library.map(function (t) { return t.id + '=' + t.name + (t.logo ? '+' : ''); }).join('|');
    if (m.libList._sig === sig) return;
    m.libList._sig = sig;
    m.libList.innerHTML = '';
    if (!library.length) {
      m.libList.textContent = 'ยังไม่มีทีมในคลัง — ตั้งชื่อ/โลโก้ทีมด้านบนแล้วกด "💾 เก็บลงคลัง"';
      return;
    }
    library.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'lib-item';
      var pic = document.createElement('span');
      pic.className = 'logo-btn logo-btn--sm';
      setLogoBtn(pic, t.logo);
      var name = document.createElement('span');
      name.className = 'grow';
      name.textContent = t.name + (t.tag ? ' (' + t.tag + ')' : '');
      var del = document.createElement('button');
      del.className = 'btn-x';
      del.textContent = '✕';
      del.title = 'ลบออกจากคลัง';
      del.addEventListener('click', function () {
        if (!window.confirm('ลบ "' + t.name + '" ออกจากคลัง?')) return;
        library = library.filter(function (x) { return x.id !== t.id; });
        lsSet(KEY.library, library);
        renderAll();
      });
      row.appendChild(pic);
      row.appendChild(name);
      row.appendChild(del);
      m.libList.appendChild(row);
    });
  }

  function renderAll() {
    ['A', 'B'].forEach(function (k) {
      var t = state.teams[k], ref = teamEls[k];
      setVal(ref.name, t.name);
      setVal(ref.tag, t.tag);
      ref.score.textContent = String(t.score);
      ref.maps.textContent = String(t.maps);
      ref.side.textContent = SIDE_LABEL[t.side] || '';
      ref.side.setAttribute('data-side', t.side);
      setLogoBtn(ref.logo, logos[k]);
      fillLibSelect(ref.lib, t.libId);
    });
    setVal(m.map, state.match.map);
    setVal(m.mapNo, String(state.match.mapNo));
    setVal(m.bestOf, String(state.match.bestOf));
    setVal(m.title, state.match.title);
    m.sbToggle.textContent = (state.scoreboard.visible ? '🙈 ซ่อนแถบสกอร์ ' : '👁 โชว์แถบสกอร์ ') + keyHint('sbToggle');
    m.winA.classList.toggle('is-on', state.result.winner === 'A');
    m.winB.classList.toggle('is-on', state.result.winner === 'B');
    m.winClear.disabled = !state.result.winner;
    refreshKeyHints();
    setLogoBtn(m.evLogo, logos.event);
    $('btnUndo').disabled = !undoStack.length;
    renderLibrary();
    renderScales();
    RP.render(state);
    LU.render(state);
    LC.render(state);
  }

  function tick() {
    requestAnimationFrame(tick);
    var now = Date.now();
    var clock = S.formatClock(S.timerRemaining(state.timer, now));
    if (clock !== lastClock) { lastClock = clock; m.clock.textContent = clock; }
    LC.tick(now);
  }

  /* ---------- แท็บ / หน้าต่าง / ปุ่มลัด ---------- */
  function showTab(name) {
    if (['main', 'lineup', 'lobby'].indexOf(name) < 0) name = 'main';
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === name);
    });
    $('tab-main').hidden = name !== 'main';
    $('tab-lobby').hidden = name !== 'lobby';
    $('tab-lineup').hidden = name !== 'lineup';
    try { localStorage.setItem(KEY.tab, name); } catch (e) { /* ไม่เป็นไร */ }
  }
  function modalOpen() { return !$('help').hidden || !$('settings').hidden || !$('links').hidden; }
  function closeModals() { capturing = null; $('help').hidden = true; $('settings').hidden = true; $('links').hidden = true; }

  function isTyping(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.tagName !== 'INPUT') return false;
    return ['checkbox', 'radio', 'button', 'file', 'range'].indexOf(t.type) < 0;
  }

  /* ---------- ปุ่มลัด (ตั้งค่าเองได้ในหน้า ?) ---------- */
  // [id, ชื่อที่โชว์, ปุ่มเริ่มต้น (e.code), ฟังก์ชัน]
  var ACTIONS = [
    ['timerToggle', 'หยุด / เดินต่อ เวลารอบ', 'Space', function () { toggleTimer(); }],
    ['timerBuy', 'เริ่มช่วงซื้อของ 0:30', 'KeyB', function () { startPhase('buy'); }],
    ['timerRound', 'เริ่มรอบ 1:40', 'KeyR', function () { startPhase('round'); }],
    ['timerSpike', 'วางสไปก์ 0:45', 'KeyP', function () { startPhase('spike'); }],
    ['scoreA', '+1 คะแนนรอบ ทีม A', 'Digit1', function () { addScore('A', 1); }],
    ['scoreB', '+1 คะแนนรอบ ทีม B', 'Digit2', function () { addScore('B', 1); }],
    ['winA', 'ทีม A ชนะ (กดซ้ำ = ล้างผล)', 'KeyQ', function () { setWinner('A'); }],
    ['winB', 'ทีม B ชนะ (กดซ้ำ = ล้างผล)', 'KeyE', function () { setWinner('B'); }],
    ['winClear', 'ล้างผลแพ้ชนะ', 'KeyX', function () { setWinner(''); }],
    ['swap', 'สลับฝั่ง ATK / DEF', 'KeyS', function () { swapSides(); }],
    ['sbToggle', 'ซ่อน / โชว์แถบสกอร์', 'KeyH', function () { toggleScoreboard(); }],
    ['transition', 'แอนิเมชันเปลี่ยนแมตช์', 'KeyT', function () { playTransition(); }],
    ['replay', 'เล่น / หยุดรีเพลย์', 'KeyV', function () { RP.toggle(); }],
    ['lineup', 'เปิด / ปิดหน้าไลน์อัพ', 'KeyU', function () { LU.toggleVisible(); }],
    ['luNext', 'ไลน์อัพ: ไฮไลต์ผู้เล่นคนถัดไป', 'KeyK', function () { LU.focusNext(); }],
    ['luPrev', 'ไลน์อัพ: ไฮไลต์ผู้เล่นคนก่อน', 'KeyJ', function () { LU.focusPrev(); }],
    ['lobbyToggle', 'เปิด / ปิดหน้ารอเข้าไลฟ์', 'KeyL', function () { LC.toggleVisible(); }],
    ['goLive', 'เข้าไลฟ์เลย (เฉพาะตอนหน้ารอแสดงอยู่)', 'KeyG', function () {
      if (state.lobby.visible) LC.goLive('manual'); else toast('หน้ารอไม่ได้เปิดอยู่');
    }]
  ];
  var MODIFIER_KEYS = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];
  var keymap = {}, capturing = null;                 // keymap: { actionId: e.code | '' }

  function defaultKeymap() {
    var map = {};
    ACTIONS.forEach(function (a) { map[a[0]] = a[2]; });
    return map;
  }
  function loadKeymap() {
    var saved = lsGet(KEY.keys, null) || {};
    keymap = defaultKeymap();
    Object.keys(keymap).forEach(function (id) { if (typeof saved[id] === 'string') keymap[id] = saved[id]; });
  }
  // 'KeyL' → 'L' · 'Digit1' → '1' · 'Numpad1' → 'Num 1' · 'ArrowUp' → '↑'
  function keyLabel(code) {
    if (!code) return '';
    var arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    if (arrows[code]) return arrows[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    return code;
  }
  function keyHint(id) { return keymap[id] ? '(' + keyLabel(keymap[id]) + ')' : ''; }
  function refreshKeyHints() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (el) {
      var text = keyHint(el.getAttribute('data-key'));
      if (el.textContent !== text) el.textContent = text;
    });
  }
  function assignKey(id, code) {
    ACTIONS.forEach(function (a) {
      if (a[0] !== id && keymap[a[0]] === code) {
        keymap[a[0]] = '';
        toast('ปุ่ม ' + keyLabel(code) + ' เคยใช้กับ "' + a[1] + '" — คำสั่งนั้นไม่มีปุ่มลัดแล้ว', 'error');
      }
    });
    keymap[id] = code;
    lsSet(KEY.keys, keymap);
  }
  function renderKeys() {
    var box = $('keysList');
    box.innerHTML = '';
    ACTIONS.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'key-row';
      var name = document.createElement('span');
      name.className = 'grow';
      name.textContent = a[1];
      var btn = document.createElement('button');
      btn.className = 'key-btn' + (capturing === a[0] ? ' is-capturing' : '');
      btn.textContent = capturing === a[0] ? 'กดปุ่มที่ต้องการ…' : (keyLabel(keymap[a[0]]) || '— ไม่มี —');
      btn.title = 'คลิกแล้วกดปุ่มใหม่ · Esc = ยกเลิก · Delete = ไม่ใช้ปุ่มลัด';
      btn.addEventListener('click', function () {
        capturing = capturing === a[0] ? null : a[0];
        renderKeys();
      });
      row.appendChild(name);
      row.appendChild(btn);
      box.appendChild(row);
    });
  }
  function openHelp() {
    capturing = null;
    renderKeys();
    $('help').hidden = false;
  }

  // ใช้ e.code (ตำแหน่งปุ่ม) → กดได้แม้แป้นพิมพ์เป็นภาษาไทยอยู่
  function onKey(e) {
    if (capturing) {                                 // กำลังตั้งปุ่มลัดใหม่ในหน้า ?
      if (MODIFIER_KEYS.indexOf(e.code) >= 0) return;
      e.preventDefault();
      if (e.code === 'Delete' || e.code === 'Backspace') { keymap[capturing] = ''; lsSet(KEY.keys, keymap); }
      else if (e.code !== 'Escape') assignKey(capturing, e.code);
      capturing = null;
      renderKeys();
      renderAll();
      return;
    }
    if (e.code === 'Escape' && modalOpen()) { closeModals(); return; }
    if (isTyping(e.target) || modalOpen()) return;
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    for (var i = 0; i < ACTIONS.length; i++) {
      if (keymap[ACTIONS[i][0]] === e.code) {
        e.preventDefault();
        ACTIONS[i][3]();
        return;
      }
    }
    if (e.code === 'Slash' && e.shiftKey) { e.preventDefault(); openHelp(); }
  }

  function showConn(st) {
    var el = $('conn');
    if (st.ws === 'on') { el.textContent = '🟢 เชื่อมต่อ OBS แล้ว'; el.title = ''; }
    else if (st.ws === 'auth') { el.textContent = '🔴 รหัสผ่าน OBS ไม่ถูก'; el.title = 'กด ⚙ เพื่อใส่รหัสผ่าน OBS WebSocket'; }
    else {
      el.textContent = st.bc ? '🟡 ยังไม่ได้ต่อ OBS' : '🔴 ยังไม่ได้ต่อ OBS';
      el.title = 'เปิด OBS และเปิด WebSocket Server (Tools → WebSocket Server Settings) · ' +
        'ระหว่างนี้ยังทดสอบกับ overlay.html ใน Chrome เดียวกันได้';
    }
  }

  function init() {
    state = normalizeState(lsGet(KEY.state, null));
    var savedLogos = lsGet(KEY.logos, null);
    logos = normalizeLogos(savedLogos);
    library = normalizeLibrary(lsGet(KEY.library, []));
    players = normalizePlayers(lsGet(KEY.players, []));
    var migrated = migrateLineup(state, savedLogos && savedLogos.players);
    refreshLineupFromDb(state);
    if (migrated) { saveState(); lsSet(KEY.logos, Object.assign({}, logos, { players: null })); }
    syncLineupPhotos();
    loadKeymap();
    if (pruneScheduleLogos()) lsSet(KEY.logos, logos);

    fileInput = $('imageFile');
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0], cb = fileCb;
      fileCb = null;
      if (f && cb) cb(f);
    });

    var obs = lsGet(KEY.obs, null) || { url: C.obs.url, password: C.obs.password };
    link = window.ValoLink.create({
      role: 'control',
      url: obs.url,
      password: obs.password,
      channel: C.channel,
      onMessage: function (type) { if (type === 'hello') { link.send('state', state); sendLogos(); } },
      onStatus: showConn,
      eventSubscriptions: 1 | 256,                   // General + MediaInputs (รู้ว่ารีเพลย์เล่นจบ)
      onObsEvent: function (type, data) { RP.onObsEvent(type, data); },
      onOpen: function () { link.send('state', state); sendLogos(); RP.prepare(); }
    });
    showConn(link.getStatus());

    buildMain();
    RP.init({
      getState: function () { return state; },
      commit: commit,
      link: link,
      toast: toast,
      keyHint: keyHint,
      containerEl: q('replay', $('tab-main'))
    });
    LU.init({
      getState: function () { return state; },
      commit: commit,
      getLogos: function () { return logos; },
      saveLogos: saveLogos,
      sendLogos: sendLogos,
      toast: toast,
      resizeImage: resizeImage,
      containerEl: $('tab-lineup'),
      bindText: bindText,
      pickImage: pickImage,
      bindDrop: bindDrop,
      setVal: setVal,
      keyHint: keyHint,
      saveTeamToLibrary: saveTeamToLibrary,
      getPlayers: function () { return players; },
      findPlayer: findPlayer,
      addPlayer: addPlayer,
      updatePlayer: updatePlayer,
      removePlayer: removePlayer
    });
    LC.init({
      getState: function () { return state; },
      commit: commit,
      getLogos: function () { return logos; },
      saveLogos: saveLogos,
      sendLogos: sendLogos,
      link: link,
      toast: toast,
      resizeImage: resizeImage,
      getLibrary: function () { return library; },
      containerEl: $('tab-lobby'),
      statusEl: $('lobbyStatus'),
      bindText: bindText,
      pickImage: pickImage,
      bindDrop: bindDrop,
      fillLibSelect: fillLibSelect,
      setVal: setVal,
      keyHint: keyHint,
      scaleRowHtml: scaleRowHtml,
      bindScales: bindScales
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });
    var savedTab = 'main';
    try { savedTab = localStorage.getItem(KEY.tab) || 'main'; } catch (e) { /* ไม่เป็นไร */ }
    showTab(savedTab);

    $('btnUndo').addEventListener('click', undo);
    $('btnHelp').addEventListener('click', openHelp);
    $('keysReset').addEventListener('click', function () {
      keymap = defaultKeymap();
      lsSet(KEY.keys, keymap);
      renderKeys();
      renderAll();
      toast('คืนค่าปุ่มลัดเริ่มต้นแล้ว');
    });
    window.ValoLinks.init({ getObs: function () { return obs; }, link: link, toast: toast, modalEl: $('links') });
    $('btnLinks').addEventListener('click', function () { window.ValoLinks.open(); });
    $('btnSettings').addEventListener('click', function () {
      $('obsUrl').value = obs.url;
      $('obsPw').value = obs.password;
      $('settings').hidden = false;
    });
    $('obsSave').addEventListener('click', function () {
      obs = { url: $('obsUrl').value.trim() || C.obs.url, password: $('obsPw').value };
      lsSet(KEY.obs, obs);
      link.setObs(obs.url, obs.password);
      closeModals();
      toast('บันทึกแล้ว — กำลังเชื่อมต่อ OBS ใหม่');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', closeModals);
    });

    document.addEventListener('keydown', onKey);
    // ปุ่มที่เพิ่งคลิกไม่ควรค้างโฟกัส (ไม่งั้น Space จะกดปุ่มนั้นซ้ำ)
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? (e.target.closest('button') || e.target) : e.target;
      if (t && (t.tagName === 'BUTTON' || (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio')))) t.blur();
    });
    // กันลากไฟล์พลาดเป้าแล้วเบราว์เซอร์เปิดรูปทับหน้าคอนโทรล
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    renderAll();
    link.send('state', state);
    sendLogos();
    requestAnimationFrame(tick);
  }

  init();
})();
