/* =====================================================================
   js/config.js — ค่าตั้งต้นของระบบ (แก้ไฟล์นี้ได้)
   ===================================================================== */
(function () {
  'use strict';
  window.ValoConfig = {
    // OBS → Tools → WebSocket Server Settings (ค่าเริ่มต้นพอร์ต 4455)
    // overlay ใน OBS อ่านรหัสผ่านจากที่นี่ (หรือใส่ ?pw=... ท้าย URL ของ Browser Source)
    obs: { url: 'ws://127.0.0.1:4455', password: '' },
    channel: 'valo-tour',                       // ชื่อช่อง BroadcastChannel (ใช้ตอนทดสอบใน Chrome)
    stage: { width: 1920, height: 1080 },
    logoMax: 256,                               // โลโก้ทีมบนแถบสกอร์
    eventLogoMax: 1024,                         // โลโก้งาน
    scheduleLogoMax: 128,
    playerPhotoMax: 320,                        // รูปผู้เล่นในไลน์อัพ (เก็บเป็น JPEG ให้ไฟล์เล็ก)                       // โลโก้ทีมในตารางหน้ารอ
    undoMax: 60,
    storage: {
      state: 'valo.state',
      logos: 'valo.logos',
      library: 'valo.library',
      tab: 'valo.ui.tab',
      obs: 'valo.obs',
      keys: 'valo.keys',
      players: 'valo.players',                  // ฐานข้อมูลนักแข่ง (ชื่อ ตำแหน่ง เอเจนต์หลัก รูป)
      overlayState: 'valo.overlay.state',
      overlayLogos: 'valo.overlay.logos'
    }
  };
})();
