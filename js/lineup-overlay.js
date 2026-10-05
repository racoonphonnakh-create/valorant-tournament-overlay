/* =====================================================================
   js/lineup-overlay.js — หน้าจอไลน์อัพเต็มจอใน overlay
   ---------------------------------------------------------------------
   แถวบน = ทีม A · แถวล่าง = ทีม B · ทีมละ 1–7 การ์ด (lineup[k].size)
   เปิดหน้า: การ์ดพลิกจากด้านหลัง (โลโก้ทีม) มาเป็นผู้เล่นทีละใบ แล้วแถบสีปาดเผยชื่อ
   lineup.focus = 'A:0' → ไฮไลต์ผู้เล่นคนนั้น (การ์ดขยาย คนอื่นจางลง)
   ===================================================================== */
(function () {
  'use strict';
  var S = window.ValoState;
  var SIDE_TEXT = { atk: 'ATTACK · ฝ่ายบุก', def: 'DEFENSE · ฝ่ายรับ' };   // แก้ข้อความได้ที่นี่
  var ENTER_MS = 2600, LEAVE_MS = 400;

  var el = null, r = { A: null, B: null }, title = null, sub = null;
  var shown = false, enterTimer = 0, leaveTimer = 0, logos = {};

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

  function buildRow(k) {
    var row = document.createElement('div');
    row.className = 'lu-row lu-row--' + k;
    row.innerHTML =
      '<div class="lu-team">' +
        '<div class="lu-team-logo"><img alt="" hidden><i></i></div>' +
        '<div class="lu-team-name"></div>' +
        '<div class="lu-team-side"></div>' +
        '<div class="lu-coach"></div>' +
      '</div>' +
      '<div class="lu-cards"></div>';
    return {
      el: row, k: k, size: 0, cards: [],
      box: row.querySelector('.lu-cards'),
      logoImg: row.querySelector('.lu-team-logo img'), logoFb: row.querySelector('.lu-team-logo i'),
      name: row.querySelector('.lu-team-name'), side: row.querySelector('.lu-team-side'), coach: row.querySelector('.lu-coach')
    };
  }

  // สร้างการ์ดใหม่เฉพาะตอนจำนวนผู้เล่นเปลี่ยน
  function buildCards(ref, size) {
    ref.size = size;
    ref.cards = [];
    ref.box.innerHTML = '';
    ref.el.style.setProperty('--lu-n', size);
    var offset = ref.k === 'B' ? r.A.size : 0;        // ไล่จังหวะต่อจากแถว A
    for (var i = 0; i < size; i++) {
      var c = document.createElement('div');
      c.className = 'lu-card';
      c.style.setProperty('--i', i + offset);
      c.innerHTML =
        '<div class="lu-flip">' +
          '<div class="lu-face lu-front">' +
            '<div class="lu-photo"><img alt="" hidden><i class="lu-photo-fb"></i></div>' +
            '<div class="lu-info"><div class="lu-name"></div><div class="lu-meta"><span class="lu-role"></span><span class="lu-agent"></span></div></div>' +
          '</div>' +
          '<div class="lu-face lu-back"><div class="lu-back-logo"><img alt="" hidden><i></i></div></div>' +
        '</div>';
      ref.box.appendChild(c);
      ref.cards.push({
        el: c, img: c.querySelector('.lu-photo img'), fb: c.querySelector('.lu-photo-fb'),
        backImg: c.querySelector('.lu-back img'), backFb: c.querySelector('.lu-back i'),
        name: c.querySelector('.lu-name'), role: c.querySelector('.lu-role'), agent: c.querySelector('.lu-agent')
      });
    }
    applyRowLogos(ref);
  }

  function init(stage) {
    el = document.createElement('div');
    el.id = 'lineup';
    el.className = 'lu';
    el.innerHTML = '<div class="lu-bg"></div><div class="lu-head"><div class="lu-title"></div><div class="lu-sub"></div></div>';
    title = el.querySelector('.lu-title');
    sub = el.querySelector('.lu-sub');
    r.A = buildRow('A');
    r.B = buildRow('B');
    el.appendChild(r.A.el);
    el.appendChild(r.B.el);
    stage.appendChild(el);
  }

  function show() {
    clearTimeout(leaveTimer);
    clearTimeout(enterTimer);
    el.classList.remove('is-leaving', 'is-entering');
    el.classList.add('is-shown');
    void el.offsetWidth;
    el.classList.add('is-entering');
    shown = true;
    enterTimer = setTimeout(function () { el.classList.remove('is-entering'); }, ENTER_MS);
  }
  function hide() {
    clearTimeout(enterTimer);
    el.classList.remove('is-entering');
    el.classList.add('is-leaving');
    shown = false;
    leaveTimer = setTimeout(function () { el.classList.remove('is-shown', 'is-leaving'); }, LEAVE_MS);
  }

  function render(state) {
    if (!el || !state || !state.lineup) return;
    var lu = state.lineup;
    setText(title, lu.title || '');
    var map = state.match.map ? ' · ' + state.match.map : '';
    setText(sub, state.teams.A.name + '  VS  ' + state.teams.B.name + map);
    el.classList.toggle('no-role', !lu.showRole);
    el.classList.toggle('no-agent', !lu.showAgent);
    ['A', 'B'].forEach(function (k) {
      var ref = r[k], team = state.teams[k], data = lu[k] || S.makeLineupTeam();
      var size = Math.max(1, Math.min(S.LINEUP_SIZE, Number(data.size) || S.LINEUP_DEFAULT));
      if (size !== ref.size) buildCards(ref, size);
      ref.el.setAttribute('data-side', team.side);
      setText(ref.name, team.name || '');
      setText(ref.logoFb, S.initials(team.name, team.tag));
      setText(ref.side, SIDE_TEXT[team.side] || '');
      setText(ref.coach, data.coach ? 'COACH · ' + data.coach : '');
      ref.cards.forEach(function (c, i) {
        var p = data.players[i] || S.makePlayer();
        setText(c.name, p.name || 'PLAYER ' + (i + 1));
        c.el.classList.toggle('is-empty', !p.name);
        c.el.classList.toggle('is-focus', lu.focus === k + ':' + i);
        setText(c.fb, p.name ? S.initials(p.name) : String(i + 1));
        setText(c.backFb, S.initials(team.name, team.tag));
        setText(c.role, p.role || '');
        setText(c.agent, p.agent || '');
      });
    });
    // ไลน์อัพ B ไล่จังหวะต่อจาก A → ถ้าจำนวน A เปลี่ยน ต้องตั้ง --i ของ B ใหม่
    r.B.cards.forEach(function (c, i) { c.el.style.setProperty('--i', i + r.A.size); });
    el.classList.toggle('has-focus', !!lu.focus && !!el.querySelector('.lu-card.is-focus'));
    if (lu.visible && !shown) show();
    else if (!lu.visible && shown) hide();
  }

  function applyRowLogos(ref) {
    var ph = (logos.players || {})[ref.k] || [];
    setImg(ref.logoImg, ref.logoFb, logos[ref.k]);
    ref.cards.forEach(function (c, i) {
      setImg(c.img, c.fb, ph[i]);
      setImg(c.backImg, c.backFb, logos[ref.k]);
    });
  }
  function applyLogos(l) {
    if (!el) return;
    logos = l || {};
    applyRowLogos(r.A);
    applyRowLogos(r.B);
  }

  window.ValoLineupOverlay = { init: init, render: render, applyLogos: applyLogos };
})();
