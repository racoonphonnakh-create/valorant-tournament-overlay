/* =====================================================================
   js/link.js — ส่งข้อความระหว่าง control ↔ overlay
   ---------------------------------------------------------------------
   2 ช่องทางพร้อมกัน (ข้อความซ้ำถูกกรองทิ้ง):
   1) OBS WebSocket v5 (BroadcastCustomEvent) — ใช้จริงตอน overlay อยู่ใน OBS
   2) BroadcastChannel — ใช้ตอนเปิด overlay.html กับ control.html ใน Chrome เดียวกัน
   ไม่ใช้ fetch / crypto.subtle (มี SHA-256 ในไฟล์นี้เอง)
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- SHA-256 + base64 (สำหรับรหัสผ่าน OBS WebSocket) ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str)), out = [], i;
    for (i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length, msg = bytes.slice(), w = new Array(64), i, t;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var hi = Math.floor(len / 0x20000000), lo = (len << 3) >>> 0;
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
             (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    for (i = 0; i < msg.length; i += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = (msg[i + 4 * t] << 24) | (msg[i + 4 * t + 1] << 16) | (msg[i + 4 * t + 2] << 8) | msg[i + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    for (i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    return out;
  }
  function b64(bytes) { return btoa(String.fromCharCode.apply(null, bytes)); }
  function sha256Hex(str) {
    return sha256(utf8Bytes(str)).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  // สูตรของ obs-websocket v5: base64(sha256(base64(sha256(password + salt)) + challenge))
  function obsAuth(password, salt, challenge) {
    var secret = b64(sha256(utf8Bytes(password + salt)));
    return b64(sha256(utf8Bytes(secret + challenge)));
  }

  /* ---------- ตัวเชื่อม ---------- */
  var RETRY_MS = 3000;

  // opts: { role: 'control' | 'overlay', url, password, channel, onMessage(type, payload), onStatus(status),
  //         eventSubscriptions (ค่าเริ่มต้น 1 = General), onObsEvent(eventType, eventData) }
  function create(opts) {
    var myId = opts.role + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var seq = 0, seen = [], seenMap = {};
    var ws = null, wsReady = false, retryTimer = 0, closed = false;
    var bc = null;
    var pending = {}, reqSeq = 0;                    // คำสั่งที่ส่งตรงถึง OBS และรอคำตอบ
    var status = { ws: 'off', bc: false };          // ws: 'off' | 'connecting' | 'on' | 'auth'
    var url = opts.url, password = opts.password || '';

    function setStatus(wsState) {
      status.ws = wsState;
      if (opts.onStatus) opts.onStatus({ ws: status.ws, bc: status.bc });
    }

    function deliver(env) {
      if (!env || env.app !== 'valo' || env.from === myId || env.role === opts.role) return;
      var key = env.from + ':' + env.seq;
      if (seenMap[key]) return;                      // มาซ้ำจากอีกช่องทาง
      seenMap[key] = true;
      seen.push(key);
      if (seen.length > 300) delete seenMap[seen.shift()];
      opts.onMessage(env.type, env.payload);
    }

    function send(type, payload) {
      var env = { app: 'valo', from: myId, role: opts.role, seq: ++seq, type: type, payload: payload };
      if (bc) { try { bc.postMessage(env); } catch (e) { /* ข้อมูลใหญ่เกิน/ช่องปิด */ } }
      if (wsReady) {
        try {
          ws.send(JSON.stringify({
            op: 6,
            d: { requestType: 'BroadcastCustomEvent', requestId: myId + ':' + seq, requestData: { eventData: env } }
          }));
        } catch (e) { /* จะต่อใหม่เองตอน onclose */ }
      }
    }

    // ส่งคำสั่งตรงถึง OBS (เช่น SaveReplayBuffer) → Promise ของ responseData
    function request(requestType, requestData) {
      return new Promise(function (resolve, reject) {
        if (!wsReady) { reject(new Error('ยังไม่ได้เชื่อมต่อ OBS')); return; }
        var id = 'q' + (++reqSeq);
        pending[id] = { resolve: resolve, reject: reject, type: requestType };
        var d = { requestType: requestType, requestId: id };
        if (requestData) d.requestData = requestData;
        try { ws.send(JSON.stringify({ op: 6, d: d })); }
        catch (e) { delete pending[id]; reject(e); }
      });
    }
    function failPending() {
      Object.keys(pending).forEach(function (id) {
        pending[id].reject(new Error('การเชื่อมต่อ OBS หลุด'));
        delete pending[id];
      });
    }

    function connect() {
      if (closed || !url || typeof WebSocket === 'undefined') return;
      clearTimeout(retryTimer);
      var sock;
      try { sock = new WebSocket(url); } catch (e) { retryTimer = setTimeout(connect, RETRY_MS); return; }
      ws = sock;
      wsReady = false;
      if (status.ws !== 'auth') setStatus('connecting');
      sock.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.op === 0) {                            // Hello
          var d = { rpcVersion: 1, eventSubscriptions: opts.eventSubscriptions || 1 };   // 1 = General (CustomEvent)
          var auth = msg.d && msg.d.authentication;
          if (auth) d.authentication = obsAuth(password, auth.salt, auth.challenge);
          sock.send(JSON.stringify({ op: 1, d: d }));
        } else if (msg.op === 2) {                     // Identified
          wsReady = true;
          setStatus('on');
          if (opts.onOpen) opts.onOpen();
        } else if (msg.op === 5) {                     // Event
          if (msg.d && msg.d.eventType === 'CustomEvent') deliver(msg.d.eventData);
          else if (msg.d && opts.onObsEvent) opts.onObsEvent(msg.d.eventType, msg.d.eventData || {});
        } else if (msg.op === 7) {                     // RequestResponse
          var p = msg.d && pending[msg.d.requestId];
          if (p) {
            delete pending[msg.d.requestId];
            var rs = msg.d.requestStatus || {};
            if (rs.result) p.resolve(msg.d.responseData || {});
            else {
              var err = new Error(rs.comment || (p.type + ' ไม่สำเร็จ'));
              err.code = rs.code;
              p.reject(err);
            }
          }
        }
      };
      sock.onclose = function (ev) {
        if (ws !== sock) return;
        wsReady = false;
        ws = null;
        failPending();
        setStatus(ev.code === 4009 ? 'auth' : 'off');  // 4009 = รหัสผ่านผิด
        if (!closed) retryTimer = setTimeout(connect, RETRY_MS);
      };
      sock.onerror = function () { /* onclose ตามมาเอง */ };
    }

    function setObs(newUrl, newPassword) {
      url = newUrl;
      password = newPassword || '';
      status.ws = 'off';
      var old = ws;
      ws = null;
      wsReady = false;
      if (old) { try { old.close(); } catch (e) { /* ปิดไปแล้ว */ } }
      connect();
    }

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(opts.channel || 'valo-tour');
        bc.onmessage = function (ev) { deliver(ev.data); };
        status.bc = true;
      }
    } catch (e) { bc = null; }

    connect();

    return {
      send: send,
      request: request,
      setObs: setObs,
      getStatus: function () { return { ws: status.ws, bc: status.bc }; },
      close: function () { closed = true; clearTimeout(retryTimer); if (ws) ws.close(); if (bc) bc.close(); }
    };
  }

  window.ValoLink = { create: create, sha256Hex: sha256Hex, obsAuth: obsAuth };
})();
