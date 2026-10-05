/* =====================================================================
   js/replay-control.js — ระบบรีเพลย์ (หน้าคอนโทรลสั่ง OBS โดยตรง)
   ---------------------------------------------------------------------
   OBS เป็นคนอัดและเล่นภาพย้อนหลัง (Replay Buffer + Media Source)
   ไฟล์นี้สั่งงานตามลำดับ และให้ overlay เล่นแอนิเมชันคั่นเข้า/ออก
   ต้องเปิด Replay Buffer ใน OBS: Settings → Output → Enable Replay Buffer
   ctx จาก control.js: { getState, commit, link, toast, containerEl, keyHint }
   ===================================================================== */
(function () {
  'use strict';

  var SOURCE = 'Valo Replay';        // ชื่อ Media Source ใน OBS (ระบบสร้างให้เองครั้งแรก)
  var COVER_MS = 450;                // แอนิเมชันคั่นบังเต็มจอเมื่อผ่านไปเท่านี้ (ตรงกับ rp-wipe ใน overlay.css)
  var SECONDS = [[5, '5 วินาที'], [8, '8 วินาที'], [10, '10 วินาที'], [15, '15 วินาที'], [20, '20 วินาที'], [30, '30 วินาที']];
  var SPEEDS = [[100, 'ปกติ 100%'], [75, 'ช้า 75%'], [50, 'ช้า 50%']];

  var ctx = null, els = {};
  var busy = false, playing = false, endTimer = 0, current = null;   // current = { sceneName, sceneItemId }

  function req(type, data) { return ctx.link.request(type, data); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function prefs() { return ctx.getState().replay; }
  function setStatus(text) { els.status.textContent = text; }
  function refresh() {
    els.play.textContent = (playing ? '⏹ หยุดรีเพลย์ ' : '⏪ เล่นรีเพลย์ ') + ctx.keyHint('replay');
    els.play.classList.toggle('is-on', playing);
    els.play.disabled = busy;
  }

  // ความยาวรีเพลย์ = "Maximum Replay Time" ของ OBS (ข้ามไปกลางคลิปไม่ได้ เพราะไฟล์มี keyframe ห่างกัน)
  // ตั้งค่าใน OBS ให้ตรงกับที่เลือกไว้ · คืน true ถ้ามีการเปลี่ยน (ต้องเริ่ม buffer ใหม่)
  function syncLength() {
    var want = String(prefs().seconds);
    return req('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'Mode' }).then(function (m) {
      var cat = m.parameterValue === 'Advanced' ? 'AdvOut' : 'SimpleOutput';
      return req('GetProfileParameter', { parameterCategory: cat, parameterName: 'RecRBTime' }).then(function (r) {
        if (String(r.parameterValue) === want) return false;
        return req('SetProfileParameter', { parameterCategory: cat, parameterName: 'RecRBTime', parameterValue: want })
          .then(function () { return true; });
      });
    });
  }

  // Replay Buffer ต้องเดินอยู่ก่อนถึงจะมีภาพให้ย้อน · คืน true ถ้าเดินอยู่แล้วและใช้ได้เลย
  function ensureBuffer() {
    return syncLength().then(function (changed) {
      return req('GetReplayBufferStatus').then(function (st) {
        if (st.outputActive && !changed) return true;
        var restart = st.outputActive
          ? req('StopReplayBuffer').then(function () { return sleep(1000); })
          : Promise.resolve();
        return restart.then(function () { return req('StartReplayBuffer'); }).then(function () { return false; });
      }, function (err) {
        if (err.code === 604) {
          throw new Error('OBS ยังไม่ได้เปิด Replay Buffer — ไปที่ Settings → Output ติ๊ก "Enable Replay Buffer" แล้วลองใหม่');
        }
        throw err;
      });
    });
  }
  // บันทึก buffer เป็นไฟล์ แล้วรอจน OBS บอกชื่อไฟล์ใหม่
  function saveReplay() {
    var before = '';
    return req('GetLastReplayBufferReplay').then(function (r) { before = r.savedReplayPath || ''; }, function () { /* ยังไม่เคยบันทึก */ })
      .then(function () { return req('SaveReplayBuffer'); })
      .then(function () {
        var tries = 0;
        function poll() {
          return sleep(200).then(function () { return req('GetLastReplayBufferReplay'); }).then(function (r) {
            if (r.savedReplayPath && r.savedReplayPath !== before) return r.savedReplayPath;
            if (++tries > 40) throw new Error('OBS บันทึกรีเพลย์ไม่สำเร็จ');
            return poll();
          });
        }
        return poll();
      })
      .then(function (path) { return sleep(300).then(function () { return path; }); });   // รอ OBS ปิดไฟล์
  }

  // เตรียม Media Source ใน Scene ปัจจุบัน: สร้างถ้ายังไม่มี, ขยายเต็มจอ, อยู่ใต้ overlay, ซ่อนไว้ก่อน
  function ensureSource(path) {
    var p = prefs(), scene = '', itemId = 0;
    var settings = {
      local_file: path, is_local_file: true, looping: false, restart_on_activate: true,
      close_when_inactive: true, clear_on_media_end: true, speed_percent: p.speed
    };
    return req('GetCurrentProgramScene').then(function (r) {
      scene = r.sceneName || r.currentProgramSceneName;
      return req('GetSceneItemId', { sceneName: scene, sourceName: SOURCE }).then(function (it) {
        itemId = it.sceneItemId;
        return req('SetSceneItemEnabled', { sceneName: scene, sceneItemId: itemId, sceneItemEnabled: false })
          .then(function () { return req('SetInputSettings', { inputName: SOURCE, inputSettings: settings }); });
      }, function () {
        // ยังไม่มีใน Scene นี้: สร้างใหม่ หรือถ้ามี source ชื่อนี้อยู่ใน Scene อื่นแล้วก็เอามาใส่
        return req('CreateInput', {
          sceneName: scene, inputName: SOURCE, inputKind: 'ffmpeg_source', inputSettings: settings, sceneItemEnabled: false
        }).then(function (c) { itemId = c.sceneItemId; }, function () {
          return req('SetInputSettings', { inputName: SOURCE, inputSettings: settings })
            .then(function () { return req('CreateSceneItem', { sceneName: scene, sourceName: SOURCE, sceneItemEnabled: false }); })
            .then(function (c) { itemId = c.sceneItemId; });
        });
      });
    }).then(function () {
      return req('GetVideoSettings');
    }).then(function (v) {
      return req('SetSceneItemTransform', {
        sceneName: scene, sceneItemId: itemId,
        sceneItemTransform: {
          positionX: 0, positionY: 0, alignment: 5, rotation: 0,
          boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: v.baseWidth, boundsHeight: v.baseHeight
        }
      });
    }).then(function () {
      return req('SetInputMute', { inputName: SOURCE, inputMuted: !!p.mute });
    }).then(function () {
      return placeBelowOverlay(scene, itemId);
    }).then(function () {
      return { sceneName: scene, sceneItemId: itemId };
    });
  }

  // รีเพลย์ต้องอยู่ใต้ Browser Source ของ overlay (ไม่งั้นจะบังแอนิเมชันคั่นและป้าย REPLAY)
  function placeBelowOverlay(scene, itemId) {
    return req('GetSceneItemList', { sceneName: scene }).then(function (r) {
      var items = r.sceneItems || [], mine = null, browsers = [];
      items.forEach(function (it) {
        if (it.sceneItemId === itemId) mine = it;
        else if (it.inputKind === 'browser_source') browsers.push(it);
      });
      if (!mine || !browsers.length) return null;
      return Promise.all(browsers.map(function (b) {
        return req('GetInputSettings', { inputName: b.sourceName }).then(function (s) {
          return /overlay\.html/i.test((s.inputSettings && (s.inputSettings.url || s.inputSettings.local_file)) || '') ? b : null;
        }, function () { return null; });
      })).then(function (found) {
        var overlay = found.filter(Boolean)[0];
        if (!overlay || mine.sceneItemIndex < overlay.sceneItemIndex) return null;
        return req('SetSceneItemIndex', { sceneName: scene, sceneItemId: itemId, sceneItemIndex: overlay.sceneItemIndex });
      });
    });
  }

  // รอจนไฟล์เปิดเสร็จ → ตั้งเวลาจบสำรองไว้ (ปกติ OBS แจ้ง MediaInputPlaybackEnded เอง)
  function armEnd() {
    var p = prefs(), tries = 0;
    function waitDuration() {
      return req('GetMediaInputStatus', { inputName: SOURCE }).then(function (s) {
        if (s.mediaDuration > 0) return s.mediaDuration;
        if (++tries > 30) return 0;
        return sleep(100).then(waitDuration);
      });
    }
    return waitDuration().then(function (duration) {
      clearTimeout(endTimer);
      var playMs = (duration || p.seconds * 1000) * 100 / p.speed;
      ctx.link.send('play', { anim: 'replay', phase: 'timer', ms: playMs });   // แถบเวลาใต้ป้าย REPLAY
      endTimer = setTimeout(stop, playMs + 2000);
    });
  }
  function start() {
    if (ctx.link.getStatus().ws !== 'on') { ctx.toast('ยังไม่ได้เชื่อมต่อ OBS — รีเพลย์ใช้ไม่ได้', 'error'); return; }
    busy = true;
    refresh();
    setStatus('กำลังเตรียมรีเพลย์…');
    ensureBuffer().then(function (wasRunning) {
      if (!wasRunning) {
        ctx.toast('เริ่ม Replay Buffer แล้ว — OBS เก็บภาพตั้งแต่ตอนนี้ กดอีกครั้งเมื่อมีจังหวะที่อยากย้อน');
        setStatus('Replay Buffer เพิ่งเริ่มเก็บภาพ');
        return null;
      }
      return saveReplay().then(ensureSource).then(function (item) {
        current = item;
        ctx.link.send('play', { anim: 'replay', phase: 'in' });
        return sleep(COVER_MS);
      }).then(function () {
        return req('SetSceneItemEnabled', { sceneName: current.sceneName, sceneItemId: current.sceneItemId, sceneItemEnabled: true });
      }).then(function () {
        playing = true;
        setStatus('● กำลังเล่นรีเพลย์');
        return armEnd();
      });
    }).catch(function (err) {
      ctx.toast('รีเพลย์: ' + (err && err.message ? err.message : err), 'error');
      setStatus('ไม่สำเร็จ');
      if (current && !playing) hideSource();
    }).then(function () {
      busy = false;
      refresh();
    });
  }

  function hideSource() {
    if (!current) return Promise.resolve();
    return req('SetSceneItemEnabled', { sceneName: current.sceneName, sceneItemId: current.sceneItemId, sceneItemEnabled: false })
      .catch(function () { /* Scene ถูกลบ/OBS ปิดไปแล้ว */ });
  }

  // กลับเข้าภาพสด: แอนิเมชันคั่น → ซ่อน Media Source ตอนจอถูกบัง
  function stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(endTimer);
    busy = true;
    refresh();
    ctx.link.send('play', { anim: 'replay', phase: 'out' });
    sleep(COVER_MS).then(hideSource).then(function () {
      busy = false;
      setStatus('พร้อม');
      refresh();
    });
  }

  // เริ่ม/ปรับ Replay Buffer ไว้ล่วงหน้า (เรียกตอนต่อ OBS ติด และตอนเปลี่ยนความยาว)
  function prepare() {
    if (!ctx || busy || playing || ctx.link.getStatus().ws !== 'on') return;
    ensureBuffer().then(function () { setStatus('พร้อม — OBS กำลังเก็บภาพย้อนหลัง ' + prefs().seconds + ' วินาที'); },
      function (err) { setStatus(err.message); });
  }

  function toggle() {
    if (busy) return;
    if (playing) stop(); else start();
  }

  function onObsEvent(type, data) {
    if (type === 'MediaInputPlaybackEnded' && data.inputName === SOURCE) stop();
  }

  function fillSelect(sel, options) {
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = String(o[0]);
      opt.textContent = o[1];
      sel.appendChild(opt);
    });
  }

  function init(context) {
    ctx = context;
    var root = ctx.containerEl;
    root.innerHTML = '<h3>รีเพลย์</h3>' +
      '<div class="row"><button class="btn-big" data-el="rpPlay"></button><span class="lc-state" data-el="rpStatus">พร้อม</span></div>' +
      '<div class="row"><span class="lbl">ย้อนหลัง</span><select data-el="rpSeconds"></select>' +
        '<span class="lbl">ความเร็ว</span><select data-el="rpSpeed"></select></div>' +
      '<div class="row"><label><input type="checkbox" data-el="rpMute"> ปิดเสียงของคลิปรีเพลย์</label></div>' +
      '<small>OBS ต้องติ๊ก Enable Replay Buffer ไว้ (Settings → Output) · คลิปจริงอาจยาวกว่าที่เลือกได้หลายวินาที (ขึ้นกับ keyframe ของ OBS)</small>';
    ['rpPlay', 'rpStatus', 'rpSeconds', 'rpSpeed', 'rpMute'].forEach(function (n) {
      els[n.slice(2).toLowerCase()] = root.querySelector('[data-el="' + n + '"]');
    });
    fillSelect(els.seconds, SECONDS);
    fillSelect(els.speed, SPEEDS);
    els.play.addEventListener('click', toggle);
    els.seconds.addEventListener('change', function () {
      var v = Number(els.seconds.value) || 10;
      ctx.commit(function (s) { s.replay.seconds = v; });
      prepare();                                     // ตั้งความยาวใน OBS ทันที จะได้พร้อมก่อนถึงจังหวะสำคัญ
    });
    els.speed.addEventListener('change', function () {
      var v = Number(els.speed.value) || 100;
      ctx.commit(function (s) { s.replay.speed = v; });
    });
    els.mute.addEventListener('change', function () {
      var on = els.mute.checked;
      ctx.commit(function (s) { s.replay.mute = on; });
    });
  }

  function render(state) {
    if (!ctx) return;
    var p = state.replay;
    if (document.activeElement !== els.seconds) els.seconds.value = String(p.seconds);
    if (document.activeElement !== els.speed) els.speed.value = String(p.speed);
    els.mute.checked = !!p.mute;
    refresh();
  }

  window.ValoReplay = { init: init, render: render, toggle: toggle, prepare: prepare, onObsEvent: onObsEvent, SOURCE: SOURCE };
})();
