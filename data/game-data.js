/* =====================================================================
   data/game-data.js — ข้อมูลเกม (รายชื่อแมพ)
   ===================================================================== */
(function () {
  'use strict';
  window.ValoGameData = {
    maps: [
      'ABYSS', 'ASCENT', 'BIND', 'BREEZE', 'CORRODE', 'FRACTURE', 'HAVEN',
      'ICEBOX', 'LOTUS', 'PEARL', 'SPLIT', 'SUNSET'
    ],
    // ตำแหน่งผู้เล่น (ไลน์อัพ) — [ค่าที่เก็บ, ข้อความที่โชว์]
    roles: [
      ['', '— ตำแหน่ง —'], ['Duelist', 'Duelist'], ['Initiator', 'Initiator'], ['Controller', 'Controller'],
      ['Sentinel', 'Sentinel'], ['Flex', 'Flex'], ['IGL', 'IGL (คอลเกม)']
    ],
    // เอเจนต์ — เพิ่มตัวใหม่ได้ที่นี่
    agents: [
      'Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor',
      'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova',
      'Tejo', 'Veto', 'Viper', 'Vyse', 'Waylay', 'Yoru'
    ]
  };
})();
