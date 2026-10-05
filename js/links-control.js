/* =====================================================================
   js/links-control.js — หน้าต่าง "🔗 ลิงก์ OBS" ในหน้าคอนโทรล
   ---------------------------------------------------------------------
   สร้างลิงก์ overlay จากตำแหน่งไฟล์จริงของ control.html (ย้ายโฟลเดอร์ไปที่ไหนก็ได้ลิงก์ที่ถูก)
   คัดลอกได้คลิกเดียว · ตรวจว่า OBS มี Browser Source ที่ใช้ลิงก์นี้หรือยัง · เพิ่มเข้า OBS ให้ได้
   ctx จาก control.js: { getObs() -> { url, password }, link, toast, modalEl }
   ===================================================================== */
(function () {
  'use strict';
  var C = window.ValoConfig;
  var SOURCE_NAME = 'VALO Overlay';                  // ชื่อ Browser Source ตอนกด "เพิ่มเข้า OBS ให้เลย"

  var ctx = null, els = {};

  function q(name) { return ctx.modalEl.querySelector('[data-el="' + name + '"]'); }
  function folderUrl() { return location.href.split(/[?#]/)[0].replace(/[^/]*$/, ''); }
  // ?pw= / ?ws= ใส่เฉพาะตอนต่างจากค่าใน js/config.js
  function overlayUrl(extra) {
    var obs = ctx.getObs(), params = [];
    if (obs.url && obs.url !== C.obs.url) params.push('ws=' + encodeURIComponent(obs.url));
    if (obs.password && obs.password !== C.obs.password) params.push('pw=' + encodeURIComponent(obs.password));
    if (extra) params.push(extra);
    return folderUrl() + 'overlay.html' + (params.length ? '?' + params.join('&') : '');
  }
  function samePage(a, b) {
    function clean(u) {
      var s = String(u || '').split(/[?#]/)[0].replace(/\\/g, '/');
      try { s = decodeURI(s); } catch (e) { /* ใช้ตามเดิม */ }
      return s.toLowerCase();
    }
    return clean(a) === clean(b);
  }

  // [ชื่อ, คำอธิบาย, query เพิ่ม, ใช้ใน OBS ไหม]
  var LINKS = [
    ['Overlay หลัก', 'ใส่ใน OBS → Browser Source (เอาติ๊ก Local file ออก) · Width 1920 · Height 1080', '', true],
    ['Overlay + ป้ายสถานะ', 'ใช้ตอนหาสาเหตุว่าต่อไม่ติด — มีป้ายบอกสถานะมุมซ้ายล่าง (อย่าใช้ตอนไลฟ์จริง)', 'debug=1', true],
    ['ตัวอย่างลูกเล่นแถบสกอร์', 'เปิดดูในเบราว์เซอร์ได้เลย ไม่ต้องต่อ OBS', 'demo=1&loop=fx', false],
    ['ตัวอย่างหน้ารอเข้าไลฟ์', 'วนเล่นแอนิเมชันเข้าไลฟ์', 'demo=1&lobby=1&loop=golive', false],
    ['ตัวอย่างไลน์อัพ', 'ข้อมูลตัวอย่าง 5 vs 5', 'demo=1&lineup=1', false]
  ];

  function copy(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
  }

  function build() {
    els.list.innerHTML = '';
    LINKS.forEach(function (l) {
      var url = l[3] ? overlayUrl(l[2]) : folderUrl() + 'overlay.html?' + l[2];
      var row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = '<div class="link-head"><b></b><small></small></div>' +
        '<div class="row"><input type="text" readonly class="grow link-url">' +
        '<button class="btn-go" data-act="copy">📋 คัดลอก</button><button data-act="open">↗ เปิด</button></div>';
      row.querySelector('b').textContent = l[0];
      row.querySelector('small').textContent = l[1];
      var input = row.querySelector('input');
      input.value = url;
      input.addEventListener('focus', function () { input.select(); });
      row.querySelector('[data-act="copy"]').addEventListener('click', function (e) {
        var btn = e.currentTarget;
        copy(url).then(function (ok) {
          if (ok) {
            ctx.toast('คัดลอกลิงก์ "' + l[0] + '" แล้ว — ไปวางใน OBS ได้เลย');
            btn.textContent = '✔ คัดลอกแล้ว';
            setTimeout(function () { btn.textContent = '📋 คัดลอก'; }, 1800);
          } else {
            input.focus();
            ctx.toast('คัดลอกอัตโนมัติไม่ได้ — ลิงก์ถูกเลือกไว้แล้ว กด Ctrl+C', 'error');
          }
        });
      });
      row.querySelector('[data-act="open"]').addEventListener('click', function () { window.open(url, '_blank'); });
      els.list.appendChild(row);
    });
    var obs = ctx.getObs();
    els.pwNote.hidden = !(obs.password && obs.password !== C.obs.password);
  }

  /* ---------- ตรวจ / เพิ่ม Browser Source ใน OBS (อ่านอย่างเดียว จนกว่าจะกดปุ่มเพิ่ม) ---------- */
  function setCheck(text, kind) {
    els.check.textContent = text;
    els.check.className = 'link-check' + (kind ? ' is-' + kind : '');
  }
  function checkObs() {
    els.add.hidden = true;
    if (ctx.link.getStatus().ws !== 'on') {
      setCheck('ยังไม่ได้เชื่อมต่อ OBS — ตรวจไม่ได้ว่าใส่ลิงก์แล้วหรือยัง (คัดลอกไปวางเองได้ตามปกติ)', 'warn');
      return;
    }
    setCheck('กำลังตรวจใน OBS…');
    var want = overlayUrl('');
    ctx.link.request('GetInputList', { inputKind: 'browser_source' }).then(function (r) {
      return Promise.all((r.inputs || []).map(function (i) {
        return ctx.link.request('GetInputSettings', { inputName: i.inputName }).then(function (s) {
          return { name: i.inputName, s: s.inputSettings || {} };
        }, function () { return null; });
      }));
    }).then(function (all) {
      var found = all.filter(function (x) { return x && samePage(x.s.url || x.s.local_file, want); });
      if (!found.length) {
        setCheck('OBS ยังไม่มี Browser Source ที่ใช้ overlay นี้ — คัดลอกลิงก์ไปเพิ่มเอง หรือกดปุ่มด้านล่าง', 'warn');
        els.add.hidden = false;
        return;
      }
      var notes = [];
      found.forEach(function (x) {
        var n = '"' + x.name + '"';
        if ((x.s.width && x.s.width !== 1920) || (x.s.height && x.s.height !== 1080)) n += ' (ขนาดเป็น ' + x.s.width + '×' + x.s.height + ' ควรเป็น 1920×1080)';
        if (x.s.url && x.s.url !== want && /[?&]debug=1/.test(x.s.url)) n += ' (ยังเปิดป้ายสถานะ debug=1 อยู่)';
        notes.push(n);
      });
      setCheck('✔ OBS ใช้ overlay นี้อยู่แล้วที่ Browser Source ' + notes.join(', '), 'ok');
    }).catch(function (err) {
      setCheck('ตรวจไม่สำเร็จ: ' + (err && err.message ? err.message : err), 'warn');
    });
  }
  function addToObs() {
    els.add.disabled = true;
    ctx.link.request('GetCurrentProgramScene').then(function (r) {
      var scene = r.sceneName || r.currentProgramSceneName;
      return ctx.link.request('CreateInput', {
        sceneName: scene, inputName: SOURCE_NAME, inputKind: 'browser_source', sceneItemEnabled: true,
        inputSettings: { is_local_file: false, url: overlayUrl(''), width: 1920, height: 1080, css: '', shutdown: false, restart_when_active: false }
      }).then(function () { return scene; });
    }).then(function (scene) {
      ctx.toast('เพิ่ม "' + SOURCE_NAME + '" เข้า Scene "' + scene + '" แล้ว — ถ้ามีภาพเกม ให้ลากไว้บนสุดของรายการ Sources');
      checkObs();
    }, function (err) {
      ctx.toast('เพิ่มเข้า OBS ไม่สำเร็จ: ' + (err && err.message ? err.message : err), 'error');
    }).then(function () { els.add.disabled = false; });
  }

  function open() {
    build();
    ctx.modalEl.hidden = false;
    checkObs();
  }

  function init(context) {
    ctx = context;
    ['list', 'check', 'add', 'pwNote'].forEach(function (n) { els[n] = q(n); });
    els.add.addEventListener('click', addToObs);
  }

  window.ValoLinks = { init: init, open: open };
})();
