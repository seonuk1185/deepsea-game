/* =========================================================
   심해 포격전(가칭) — PC 키보드 조작 (12차)
   어떤 키가 무슨 일을 하는지는 config.js keys 에 모여 있음 (나중에 「키 설정」 화면이 거기만 바꾸면 됨)
   이 파일은 「키를 눌렀다 / 뗐다」만 알아채서 화면 버튼과 「같은 코드」를 부름 → 결국 같은 주문서(쪽지)가 나감
     WASD     → move.js (Game.setMoveKeys) → 조이스틱과 같은 걸음 계산 → 이동 쪽지
     화살표    → move.js (Game.setPanKeys) → 화면(바다) 둘러보기 (손가락으로 바다를 미는 것과 같음)
     스페이스  → fire.js (Game.fireHold) → 발사 버튼 꾹 누르기와 똑같음 → 발사 쪽지
     1·2·3·4  → main.js (Game.selectItem) → 아이템 칸 고르기 (칸을 누른 것과 같음)
     F1       → pad.js (Game.padKeys.reset) → ↺ 점 처음 모양
     Tab      → move.js (Game.endTurn) → 턴 넘기기 쪽지
     Insert·Home·PageUp / Delete·End·PageDown → pad.js (Game.padKeys) → 점1·2·3 고르기 + ▲ / ▼ (꾹 누르면 계속, ▲▼ 버튼과 같은 코드)
     ?        → 키 안내 열기/닫기 (PC 화면에서만 보이는 오른쪽 아래 「?」 버튼과 같음)
   잠김(어뢰 날아가는 중 등)은 각 파일이 원래대로 막음. 키를 꾹 누를 때 자동으로 반복되는 신호는 무시
   move.js, pad.js, fire.js 다음에 불러야 함
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var K = C.keys || {};

  // 키 이름 → 동작 이름 찾기표 (config.js keys 를 뒤집어 둠)
  var actionOf = {};
  Object.keys(K).forEach(function (act) {
    (K[act] || []).forEach(function (code) { actionOf[code] = act; });
  });

  var held = {};   // 지금 누르고 있는 키 { 키 이름: 동작 이름 }

  // 누르고 있는 방향 키 → 이동 방향·둘러보기 방향 (-1 / 0 / 1). 반대 방향을 같이 누르면 0
  function updateMove() {
    var on = {};
    Object.keys(held).forEach(function (code) { on[held[code]] = true; });
    G.setMoveKeys((on.right ? 1 : 0) - (on.left ? 1 : 0), (on.down ? 1 : 0) - (on.up ? 1 : 0));
    G.setPanKeys((on.camRight ? 1 : 0) - (on.camLeft ? 1 : 0), (on.camDown ? 1 : 0) - (on.camUp ? 1 : 0));
  }
  // 점 키: 동작 이름 → [몇 번째 점, 위(-1)/아래(+1)]
  var PINS = { pin1Up: [0, -1], pin1Down: [0, 1], pin2Up: [1, -1], pin2Down: [1, 1], pin3Up: [2, -1], pin3Down: [2, 1] };
  var nudgeOwner = null;   // 지금 꾹 누르고 있는 점 키 (다른 점 키를 누르면 그쪽으로 넘어감)
  function pinPress(act) {
    var pin = PINS[act];
    G.padKeys.up.stop('key'); G.padKeys.down.stop('key');   // 앞에 누르던 점 키는 멈춤
    G.padKeys.select(pin[0]);                                // 그 점을 고르고
    (pin[1] < 0 ? G.padKeys.up : G.padKeys.down).start('key');   // ▲ 또는 ▼ 버튼을 꾹 누른 것과 똑같이
    nudgeOwner = act;
  }
  function pinRelease(act) {
    if (nudgeOwner !== act) return;                          // 이미 다른 점 키로 넘어갔으면 그대로 둠
    G.padKeys.up.stop('key'); G.padKeys.down.stop('key');
    nudgeOwner = null;
  }
  var DIRS = { up: 1, down: 1, left: 1, right: 1, camUp: 1, camDown: 1, camLeft: 1, camRight: 1 };
  // 같은 동작의 다른 키를 아직 누르고 있는지 (예: ↑ 와 W 를 같이 눌렀다가 하나만 뗀 경우)
  function stillHeld(act) {
    return Object.keys(held).some(function (code) { return held[code] === act; });
  }

  function press(act) {
    switch (act) {
      case 'fire': G.fireHold.start('key'); break;
      case 'item1': G.selectItem(0); break;
      case 'item2': G.selectItem(1); break;
      case 'item3': G.selectItem(2); break;
      case 'item4': G.selectItem(3); break;
      case 'pin1': G.padKeys.select(0); break;
      case 'pin2': G.padKeys.select(1); break;
      case 'pin3': G.padKeys.select(2); break;
      case 'nudgeUp': G.padKeys.up.start('key'); break;
      case 'nudgeDown': G.padKeys.down.start('key'); break;
      case 'reset': G.padKeys.reset(); break;
      case 'endTurn': G.endTurn(); break;
      case 'help': toggleHelp(); break;
      default: if (DIRS[act]) updateMove(); else if (PINS[act]) pinPress(act);
    }
  }
  function release(act) {
    switch (act) {
      default: if (DIRS[act]) updateMove(); else if (PINS[act]) pinRelease(act); break;
      case 'fire': G.fireHold.release('key'); break;
      case 'nudgeUp': G.padKeys.up.stop('key'); break;
      case 'nudgeDown': G.padKeys.down.stop('key'); break;
    }
  }

  // 나중에 채팅 칸 같은 글자 입력 칸에서 치는 글자는 게임이 가로채지 않음
  function typing(e) {
    var t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || typing(e)) return;
    var act = actionOf[e.code];
    if (!act) return;
    e.preventDefault();                 // 화살표·스페이스 스크롤, F1 도움말 창, Tab 칸 이동, 마지막에 누른 버튼이 다시 눌리는 것 막음
    if (e.repeat || held[e.code]) return;   // 꾹 누를 때 자동 반복 신호는 무시 (꾹 누르기는 각 동작이 알아서)
    var already = stillHeld(act);
    held[e.code] = act;
    if (!already || DIRS[act]) press(act);
  });

  document.addEventListener('keyup', function (e) {
    var act = held[e.code];
    if (!act) return;
    e.preventDefault();                 // 스페이스를 뗄 때 버튼이 눌리는 것도 막음
    delete held[e.code];
    if (!stillHeld(act)) release(act);
  });

  // 다른 창으로 넘어가면 키를 뗀 신호가 안 올 수 있음 → 누르고 있던 것 전부 놓기
  //   (발사는 손가락이 끊겼을 때처럼 「안 쏘고 원래대로」)
  function releaseAll() {
    held = {};
    G.setMoveKeys(0, 0);
    G.setPanKeys(0, 0);
    G.fireHold.cancel('key');
    G.padKeys.up.stop('key');
    G.padKeys.down.stop('key');
    nudgeOwner = null;
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

  /* ---------- 키 안내 (PC 화면에서만: 오른쪽 아래 작은 「?」 — 보이고 안 보이고는 style.css) ----------
     내용은 config.js keys 에서 만들어서, 키를 바꾸면 안내도 같이 바뀜 */
  var NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter',
                NumpadEnter: '', Tab: 'Tab', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', Delete: 'Del', Slash: '?' };
  function keyName(code) {
    if (code in NAMES) return NAMES[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return '';           // 숫자판은 안내에서 생략 (윗줄 숫자와 같음)
    return code;
  }
  function keysOf(act) {
    return (K[act] || []).map(keyName).filter(Boolean).map(function (n) { return '<kbd>' + n + '</kbd>'; }).join('');
  }
  // 키가 하나도 없는 줄(아직 안 정한 점 고르기 등)은 안내에서 빠짐
  var ROWS = [
    [['up', 'left', 'down', 'right'], '잠수함 이동'],
    [['camUp', 'camLeft', 'camDown', 'camRight'], '화면 둘러보기'],
    [['fire'], '꾹 눌렀다 떼면 발사'],
    [['item1', 'item2', 'item3', 'item4'], '아이템 칸 고르기'],
    [['pin1Up', 'pin1Down'], '점1 ▲ / ▼'],
    [['pin2Up', 'pin2Down'], '점2 ▲ / ▼'],
    [['pin3Up', 'pin3Down'], '점3 ▲ / ▼'],
    [['pin1', 'pin2', 'pin3'], '점 고르기'],
    [['nudgeUp', 'nudgeDown'], '고른 점 ▲ / ▼'],
    [['reset'], '↺ 점 처음 모양'],
    [['endTurn'], '턴 넘기기'],
    [['help'], '이 안내 닫기']
  ];
  var helpBtn = document.getElementById('btnKeyHelp');
  var helpBox = document.getElementById('keyHelp');
  if (helpBox) {
    helpBox.innerHTML = '<b>키보드</b>' + ROWS.map(function (r) {
      var k = r[0].map(keysOf).join('');
      return k ? '<p><span>' + k + '</span><em>' + r[1] + '</em></p>' : '';
    }).join('') + '<small>마우스로도 전부 됨</small>';
  }
  function toggleHelp() {
    if (!helpBox) return;
    var open = helpBox.hidden;
    helpBox.hidden = !open;
    if (helpBtn) helpBtn.classList.toggle('on', open);
  }
  if (helpBtn) helpBtn.addEventListener('click', toggleHelp);
})();
