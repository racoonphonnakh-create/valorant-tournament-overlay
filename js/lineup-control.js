/* =====================================================================
   js/lineup-control.js — แท็บ "👥 ไลน์อัพ" ในหน้าคอนโทรล
   ---------------------------------------------------------------------
   ฐานข้อมูลนักแข่ง (ctx.getPlayers) เก็บชื่อ/ตำแหน่ง/เอเจนต์หลัก/รูป ไว้ครั้งเดียว
   แล้วจัดทีมแต่ละแมตช์ด้วยการ "เลือกนักแข่ง" ใส่ช่อง — ไม่ต้องกรอกใหม่
   state.lineup[k] = { size, coach, players[7]: { pid, name, role, agent } } (name/role เป็นสำเนาจากฐานข้อมูล)
   ctx จาก control.js: { getState, commit, toast, resizeImage, containerEl, bindText, pickImage, bindDrop, setVal,
     keyHint, saveTeamToLibrary, getPlayers, findPlayer, addPlayer, updatePlayer, removePlayer }
   ===================================================================== */
(function () {
  'use strict';
  var S = window.ValoState, C = window.ValoConfig, G = window.ValoGameData;
  var NEW = '__new';

  var ctx = null, root = null, els = {}, teams = {}, list = { sig: null, rows: {} }, search = '';

  function q(name, base) { return (base || root).querySelector('[data-el="' + name + '"]'); }
  function fill(sel, options) {
    sel.innerHTML = '';
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      sel.appendChild(opt);
    });
  }
  function agentOptions(first) { return [['', first]].concat(G.agents.map(function (a) { return [a, a]; })); }
  function roleLabel(role) {
    var found = '';
    G.roles.forEach(function (r) { if (r[0] === role) found = r[1]; });
    return role ? found || role : '';
  }
  function setPhotoBtn(btn, src) {
    btn.style.backgroundImage = src ? 'url("' + src + '")' : '';
    btn.textContent = src ? '' : '👤';
  }
  function sortedPlayers() {
    return ctx.getPlayers().slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
  }
  // นักแข่งคนนี้อยู่ช่องไหน → { k, i } หรือ null (นับเฉพาะช่องที่โชว์อยู่)
  function whereIs(state, pid) {
    var at = null;
    ['A', 'B'].forEach(function (k) {
      state.lineup[k].players.forEach(function (slot, i) {
        if (!at && slot.pid === pid && i < state.lineup[k].size) at = { k: k, i: i };
      });
    });
    return at;
  }

  /* ---------- จัดทีม ---------- */
  function toggleVisible() {
    ctx.commit(function (s) { s.lineup.visible = !s.lineup.visible; });
  }
  // ใส่นักแข่งลงช่อง · ถ้าอยู่ช่องอื่นอยู่แล้วให้ย้ายมา (คนเดียวอยู่สองที่ไม่ได้)
  function assign(k, i, pid) {
    var p = ctx.findPlayer(pid);
    if (!p) return;
    var from = null;
    ctx.commit(function (s) {
      ['A', 'B'].forEach(function (kk) {
        s.lineup[kk].players.forEach(function (slot, j) {
          if (slot.pid === pid && !(kk === k && j === i)) {
            if (j < s.lineup[kk].size) from = { k: kk, i: j };
            s.lineup[kk].players[j] = S.makePlayer();
          }
        });
      });
      s.lineup[k].players[i] = { pid: p.id, name: p.name, role: p.role, agent: p.agent };
    });
    if (from) ctx.toast('ย้าย ' + p.name + ' จากทีม ' + from.k + ' ช่อง ' + (from.i + 1) + ' มาทีม ' + k + ' ช่อง ' + (i + 1));
  }
  function clearSlot(k, i) {
    ctx.commit(function (s) { s.lineup[k].players[i] = S.makePlayer(); });
  }
  function swapSlots(k, i, j) {
    if (j < 0 || j >= ctx.getState().lineup[k].size) return;
    ctx.commit(function (s) {
      var p = s.lineup[k].players, t = p[i];
      p[i] = p[j];
      p[j] = t;
    });
  }
  // ใส่ช่องว่างแรกของทีม
  function addToTeam(k, pid) {
    var lu = ctx.getState().lineup[k], at = whereIs(ctx.getState(), pid);
    if (at && at.k === k) { ctx.toast('อยู่ทีม ' + k + ' แล้ว'); return; }
    for (var i = 0; i < lu.size; i++) {
      if (!lu.players[i].pid && !lu.players[i].name) { assign(k, i, pid); return; }
    }
    ctx.toast('ทีม ' + k + ' เต็มแล้ว (' + lu.size + ' คน) — เพิ่มจำนวนผู้เล่นหรือเอาคนออกก่อน', 'error');
  }
  function createPlayer(name, extra) {
    name = String(name || '').trim().slice(0, 24);
    if (!name) return null;
    var dup = null;
    ctx.getPlayers().forEach(function (p) { if (p.name.toLowerCase() === name.toLowerCase()) dup = p; });
    if (dup) { ctx.toast('มี "' + dup.name + '" ในฐานข้อมูลอยู่แล้ว — ใช้คนเดิม'); return dup; }
    extra = extra || {};
    return ctx.addPlayer({ name: name, role: extra.role || '', agent: extra.agent || '' });
  }

  // ไฮไลต์ทีละคน (เฉพาะช่องที่มีชื่อ) · dir = +1 / -1 · เลยคนสุดท้าย = ล้างไฮไลต์
  function focusStep(dir) {
    var st = ctx.getState(), order = [];
    ['A', 'B'].forEach(function (k) {
      for (var i = 0; i < st.lineup[k].size; i++) if (st.lineup[k].players[i].name) order.push(k + ':' + i);
    });
    if (!order.length) { ctx.toast('ยังไม่มีผู้เล่นในไลน์อัพ'); return; }
    var idx = order.indexOf(st.lineup.focus), next;
    if (idx < 0) next = dir > 0 ? order[0] : order[order.length - 1];
    else next = order[idx + dir] || '';
    ctx.commit(function (s) { s.lineup.focus = next; }, { undo: false });
  }
  function focusClear() {
    if (ctx.getState().lineup.focus) ctx.commit(function (s) { s.lineup.focus = ''; }, { undo: false });
  }

  function uploadPhoto(pid, file) {
    ctx.resizeImage(file, C.playerPhotoMax, 'image/jpeg').then(function (url) {
      ctx.updatePlayer(pid, function (p) { p.photo = url; });
    }, function () { ctx.toast('เปิดไฟล์รูปไม่ได้', 'error'); });
  }

  /* ---------- DOM: ทีม ---------- */
  function buildTeam(k) {
    var panel = document.createElement('div');
    panel.className = 'panel lu-team';
    var sizes = [];
    for (var n = 1; n <= S.LINEUP_SIZE; n++) sizes.push([String(n), n + ' คน']);
    panel.innerHTML =
      '<h3>ทีม ' + k + ' · <span data-el="teamName"></span> <span class="side" data-el="side"></span></h3>' +
      '<div class="row"><span class="lbl">จำนวนผู้เล่น</span><select data-el="size"></select>' +
        '<small>ไลน์อัพบนจอจะโชว์ตามจำนวนนี้</small></div>' +
      '<div data-el="rows"></div>' +
      '<div class="row"><span class="lbl">โค้ช</span><input type="text" maxlength="24" class="grow" data-el="coach" placeholder="ชื่อโค้ช (เว้นว่างได้)"></div>' +
      '<div class="row"><button data-el="save">💾 เก็บทีมนี้ลงคลังทีม</button><button data-el="clear">ล้างไลน์อัพทีมนี้</button></div>';
    var t = { panel: panel, name: q('teamName', panel), side: q('side', panel), size: q('size', panel), coach: q('coach', panel), rows: [] };
    fill(t.size, sizes);
    var box = q('rows', panel);
    for (var i = 0; i < S.LINEUP_SIZE; i++) { var row = buildSlot(k, i); t.rows.push(row); box.appendChild(row.el); }
    t.size.addEventListener('change', function () {
      var v = Math.max(1, Math.min(S.LINEUP_SIZE, Number(t.size.value) || S.LINEUP_DEFAULT));
      ctx.commit(function (s) { s.lineup[k].size = v; });
    });
    ctx.bindText(t.coach, function (s, v) { s.lineup[k].coach = v; });
    q('save', panel).addEventListener('click', function () { ctx.saveTeamToLibrary(k); });
    q('clear', panel).addEventListener('click', function () {
      if (!window.confirm('เอาผู้เล่นทั้งหมดออกจากทีม ' + k + '? (ข้อมูลนักแข่งในฐานข้อมูลยังอยู่)')) return;
      ctx.commit(function (s) { var size = s.lineup[k].size; s.lineup[k] = S.makeLineupTeam(); s.lineup[k].size = size; });
    });
    teams[k] = t;
    return panel;
  }

  function buildSlot(k, i) {
    var el = document.createElement('div');
    el.className = 'lu-row';
    el.innerHTML =
      '<span class="lr-no">' + (i + 1) + '</span>' +
      '<button class="logo-btn logo-btn--sm lu-photo-btn" data-el="photo" title="รูปนักแข่ง (คลิกหรือลากไฟล์มาวาง)"></button>' +
      '<select class="grow" data-el="pick" title="เลือกนักแข่งจากฐานข้อมูล"></select>' +
      '<span class="lu-role-tag" data-el="role"></span>' +
      '<select data-el="agent" title="เอเจนต์ที่ใช้แมตช์นี้"></select>' +
      '<button data-el="up" title="เลื่อนขึ้น">↑</button><button data-el="down" title="เลื่อนลง">↓</button>' +
      '<button class="btn-x" data-el="x" title="เอาออกจากช่องนี้">✕</button>';
    var ref = { el: el, sig: null };
    ['photo', 'pick', 'role', 'agent', 'up', 'down', 'x'].forEach(function (n) { ref[n] = q(n, el); });
    fill(ref.agent, agentOptions('— เอเจนต์ —'));
    ref.up.disabled = i === 0;

    function currentPid() { return ctx.getState().lineup[k].players[i].pid; }
    function upload(f) {
      var pid = currentPid();
      if (!pid) { ctx.toast('เลือกนักแข่งใส่ช่องนี้ก่อน แล้วค่อยใส่รูป', 'error'); return; }
      uploadPhoto(pid, f);
    }
    ref.photo.addEventListener('click', function () { if (currentPid()) ctx.pickImage(upload); else upload(); });
    ctx.bindDrop(ref.photo, upload);
    ref.pick.addEventListener('change', function () {
      var v = ref.pick.value;
      if (v === NEW) {
        var p = createPlayer(window.prompt('ชื่อในเกม (IGN) ของนักแข่งใหม่'));
        ref.sig = null;                               // บังคับวาดตัวเลือกใหม่
        if (p) assign(k, i, p.id); else ctx.commit(function () {}, { undo: false });
      } else if (v) assign(k, i, v);
      else clearSlot(k, i);
    });
    ref.agent.addEventListener('change', function () {
      var v = ref.agent.value;
      ctx.commit(function (s) { s.lineup[k].players[i].agent = v; });
    });
    ref.up.addEventListener('click', function () { swapSlots(k, i, i - 1); });
    ref.down.addEventListener('click', function () { swapSlots(k, i, i + 1); });
    ref.x.addEventListener('click', function () { clearSlot(k, i); });
    return ref;
  }

  /* ---------- DOM: ฐานข้อมูลนักแข่ง ---------- */
  function buildRoster() {
    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML =
      '<h3>ฐานข้อมูลนักแข่ง <small data-el="count"></small></h3>' +
      '<p class="hint">บันทึกนักแข่งไว้ครั้งเดียว แล้วเลือกใส่ทีมไหนก็ได้ทุกแมตช์ · แก้ชื่อ/รูปที่นี่ ไลน์อัพที่ใช้คนนั้นอยู่จะเปลี่ยนตามทันที</p>' +
      '<div class="row">' +
        '<input type="text" maxlength="24" class="grow" data-el="newName" placeholder="ชื่อในเกม (IGN)">' +
        '<select data-el="newRole"></select><select data-el="newAgent"></select>' +
        '<button class="btn-go" data-el="add">+ เพิ่มนักแข่ง</button>' +
      '</div>' +
      '<div class="row"><span class="lbl">ค้นหา</span><input type="text" class="grow" data-el="search" placeholder="พิมพ์ชื่อเพื่อกรอง"></div>' +
      '<div class="roster" data-el="list"></div>';
    ['count', 'newName', 'newRole', 'newAgent', 'add', 'search', 'list'].forEach(function (n) { els[n] = q(n, panel); });
    fill(els.newRole, G.roles);
    fill(els.newAgent, agentOptions('— เอเจนต์หลัก —'));
    function add() {
      var p = createPlayer(els.newName.value, { role: els.newRole.value, agent: els.newAgent.value });
      if (!p) { els.newName.focus(); return; }
      els.newName.value = '';
      els.newName.focus();
      list.sig = null;
      render(ctx.getState());
    }
    els.add.addEventListener('click', add);
    els.newName.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    els.search.addEventListener('input', function () { search = els.search.value.trim().toLowerCase(); render(ctx.getState()); });
    return panel;
  }

  function buildRosterRow(p) {
    var el = document.createElement('div');
    el.className = 'roster-row';
    el.innerHTML =
      '<button class="logo-btn logo-btn--sm lu-photo-btn" data-el="photo" title="รูปนักแข่ง (คลิกหรือลากไฟล์มาวาง)"></button>' +
      '<button class="btn-x" data-el="photoX" title="ลบรูป">✕</button>' +
      '<input type="text" maxlength="24" class="grow" data-el="name">' +
      '<select data-el="role"></select><select data-el="agent"></select>' +
      '<span class="roster-at" data-el="at"></span>' +
      '<button data-el="toA" title="ใส่ทีม A">→ A</button><button data-el="toB" title="ใส่ทีม B">→ B</button>' +
      '<button class="btn-x" data-el="del" title="ลบออกจากฐานข้อมูล">ลบ</button>';
    var ref = { el: el };
    ['photo', 'photoX', 'name', 'role', 'agent', 'at', 'toA', 'toB', 'del'].forEach(function (n) { ref[n] = q(n, el); });
    fill(ref.role, G.roles);
    fill(ref.agent, agentOptions('— เอเจนต์หลัก —'));
    var id = p.id, timer = 0;
    function upload(f) { uploadPhoto(id, f); }
    ref.photo.addEventListener('click', function () { ctx.pickImage(upload); });
    ctx.bindDrop(ref.photo, upload);
    ref.photoX.addEventListener('click', function () { ctx.updatePlayer(id, function (x) { x.photo = null; }); });
    ref.name.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var v = ref.name.value.trim();
        if (v) ctx.updatePlayer(id, function (x) { x.name = v; });
      }, 200);
    });
    ref.role.addEventListener('change', function () { ctx.updatePlayer(id, function (x) { x.role = ref.role.value; }); });
    ref.agent.addEventListener('change', function () { ctx.updatePlayer(id, function (x) { x.agent = ref.agent.value; }); });
    ref.toA.addEventListener('click', function () { addToTeam('A', id); });
    ref.toB.addEventListener('click', function () { addToTeam('B', id); });
    ref.del.addEventListener('click', function () {
      var x = ctx.findPlayer(id);
      if (x && window.confirm('ลบ "' + x.name + '" ออกจากฐานข้อมูลนักแข่ง? (ถ้าอยู่ในไลน์อัพจะถูกเอาออกด้วย)')) ctx.removePlayer(id);
    });
    return ref;
  }

  function renderRoster(state) {
    var all = sortedPlayers();
    var shown = all.filter(function (p) { return !search || p.name.toLowerCase().indexOf(search) >= 0; });
    els.count.textContent = '(' + all.length + ' คน)';
    var sig = shown.map(function (p) { return p.id; }).join() + '|' + search;
    if (sig !== list.sig) {
      list.sig = sig;
      var old = list.rows;
      list.rows = {};
      els.list.innerHTML = '';
      if (!shown.length) {
        els.list.textContent = all.length ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีนักแข่ง — เพิ่มด้านบน หรือเลือก "+ เพิ่มนักแข่งใหม่…" ในช่องของทีม';
      }
      shown.forEach(function (p) {
        var ref = old[p.id] || buildRosterRow(p);
        list.rows[p.id] = ref;
        els.list.appendChild(ref.el);
      });
    }
    shown.forEach(function (p) {
      var ref = list.rows[p.id], at = whereIs(state, p.id);
      ctx.setVal(ref.name, p.name);
      ctx.setVal(ref.role, p.role);
      ctx.setVal(ref.agent, p.agent);
      setPhotoBtn(ref.photo, p.photo);
      ref.photoX.hidden = !p.photo;
      ref.at.textContent = at ? 'ทีม ' + at.k + ' · ช่อง ' + (at.i + 1) : '';
      ref.at.setAttribute('data-team', at ? at.k : '');
      ref.toA.disabled = !!at && at.k === 'A';
      ref.toB.disabled = !!at && at.k === 'B';
    });
  }

  /* ---------- init / render ---------- */
  function init(context) {
    ctx = context;
    root = ctx.containerEl;
    root.innerHTML =
      '<div class="lc-head">' +
        '<button class="btn-big" data-el="toggle"></button>' +
        '<span class="lc-state" data-el="state"></span>' +
      '</div>' +
      '<div class="panel"><h3>หน้าจอไลน์อัพ</h3>' +
        '<div class="row"><span class="lbl">หัวข้อ</span><input type="text" maxlength="30" class="grow" data-el="title"></div>' +
        '<div class="row"><label><input type="checkbox" data-el="showRole"> โชว์ตำแหน่ง</label>' +
          '<label><input type="checkbox" data-el="showAgent"> โชว์เอเจนต์</label></div>' +
        '<div class="row"><span class="lbl">ไฮไลต์ผู้เล่น</span>' +
          '<button data-el="fPrev">◀ คนก่อน <span data-key="luPrev"></span></button>' +
          '<button data-el="fNext">คนถัดไป ▶ <span data-key="luNext"></span></button>' +
          '<button data-el="fClear">ล้างไฮไลต์</button><span class="lc-state" data-el="fState"></span></div>' +
      '</div>' +
      '<div class="grid2" data-el="teams"></div>';
    ['toggle', 'state', 'title', 'showRole', 'showAgent', 'fPrev', 'fNext', 'fClear', 'fState', 'teams'].forEach(function (n) { els[n] = q(n); });
    els.teams.appendChild(buildTeam('A'));
    els.teams.appendChild(buildTeam('B'));
    root.appendChild(buildRoster());
    els.toggle.addEventListener('click', toggleVisible);
    ctx.bindText(els.title, function (s, v) { s.lineup.title = v; });
    els.showRole.addEventListener('change', function () {
      var on = els.showRole.checked;
      ctx.commit(function (s) { s.lineup.showRole = on; });
    });
    els.showAgent.addEventListener('change', function () {
      var on = els.showAgent.checked;
      ctx.commit(function (s) { s.lineup.showAgent = on; });
    });
    els.fPrev.addEventListener('click', function () { focusStep(-1); });
    els.fNext.addEventListener('click', function () { focusStep(1); });
    els.fClear.addEventListener('click', focusClear);
  }

  var SIDE_LABEL = { atk: 'ATK (ฝ่ายบุก)', def: 'DEF (ฝ่ายรับ)' };
  function renderSlotOptions(ref, state, k, i) {
    var players = sortedPlayers();
    var sig = players.map(function (p) {
      var at = whereIs(state, p.id);
      return p.id + '=' + p.name + (at ? '@' + at.k + at.i : '');
    }).join('|');
    if (sig === ref.sig) return;
    ref.sig = sig;
    var opts = [['', '— เลือกนักแข่ง —'], [NEW, '+ เพิ่มนักแข่งใหม่…']];
    players.forEach(function (p) {
      var at = whereIs(state, p.id), mark = '';
      if (at && !(at.k === k && at.i === i)) mark = '  (อยู่ทีม ' + at.k + ')';
      opts.push([p.id, p.name + (p.role ? ' · ' + roleLabel(p.role) : '') + mark]);
    });
    fill(ref.pick, opts);
  }

  function render(state) {
    if (!root) return;
    var lu = state.lineup;
    els.toggle.textContent = (lu.visible ? '🙈 ปิดหน้าไลน์อัพ ' : '👁 เปิดหน้าไลน์อัพ ') + ctx.keyHint('lineup');
    els.toggle.classList.toggle('is-on', lu.visible);
    els.state.textContent = lu.visible ? 'สถานะ: ● กำลังแสดงบนไลฟ์' : 'สถานะ: ○ ปิดอยู่';
    els.state.classList.toggle('is-on', lu.visible);
    ctx.setVal(els.title, lu.title);
    els.showRole.checked = !!lu.showRole;
    els.showAgent.checked = !!lu.showAgent;
    var f = /^([AB]):(\d)$/.exec(lu.focus || '');
    els.fState.textContent = f ? 'กำลังไฮไลต์: ' + (lu[f[1]].players[+f[2]].name || '-') + ' (ทีม ' + f[1] + ')' : '';
    els.fClear.disabled = !lu.focus;
    ['A', 'B'].forEach(function (k) {
      var team = state.teams[k], t = teams[k], data = lu[k];
      t.name.textContent = team.name;
      t.side.textContent = SIDE_LABEL[team.side] || '';
      t.side.setAttribute('data-side', team.side);
      ctx.setVal(t.size, String(data.size));
      ctx.setVal(t.coach, data.coach);
      t.rows.forEach(function (ref, i) {
        var slot = data.players[i], p = slot.pid ? ctx.findPlayer(slot.pid) : null;
        ref.el.hidden = i >= data.size;
        ref.down.disabled = i >= data.size - 1;
        renderSlotOptions(ref, state, k, i);
        ctx.setVal(ref.pick, p ? p.id : '');
        ref.role.textContent = roleLabel(slot.role);
        ctx.setVal(ref.agent, slot.agent || '');
        setPhotoBtn(ref.photo, p && p.photo);
        ref.photo.disabled = !p;
        ref.x.disabled = !slot.pid && !slot.name;
        ref.el.classList.toggle('is-focus', lu.focus === k + ':' + i);
      });
    });
    renderRoster(state);
  }

  window.ValoLineupControl = {
    init: init, render: render, toggleVisible: toggleVisible,
    focusNext: function () { focusStep(1); }, focusPrev: function () { focusStep(-1); }
  };
})();
