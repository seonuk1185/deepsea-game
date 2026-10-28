/* =========================================================
   심해 포격전(가칭) — PC 키보드 조작 (12차) + 키 설정 화면 (13차)
   기본 키는 config.js keys 에 모여 있음. 형님이 「키 설정」 화면에서 바꾼 키는 브라우저(localStorage)에 저장되고,
   불러올 때 기본값 위에 덮어씀 (아래 3번). 이 파일 안에서는 K = 「지금 쓰는 키 목록」 (config.js keys 와 같은 모양)
   이 파일은 「키를 눌렀다 / 뗐다」만 알아채서 화면 버튼과 「같은 코드」를 부름 → 결국 같은 주문서(쪽지)가 나감
     WASD     → move.js (Game.setMoveKeys) → 조이스틱과 같은 걸음 계산 → 이동 쪽지
     화살표    → move.js (Game.setPanKeys) → 화면(바다) 둘러보기 (손가락으로 바다를 미는 것과 같음)
     스페이스  → fire.js (Game.fireHold) → 발사 버튼 꾹 누르기와 똑같음 → 발사 쪽지
     1·2·3·4  → main.js (Game.selectItem) → 아이템 칸 고르기 (칸을 누른 것과 같음)
     F1       → pad.js (Game.padKeys.reset) → ↺ 점 처음 모양
     Tab      → move.js (Game.endTurn) → 턴 넘기기 쪽지
     Insert·Home·PageUp / Delete·End·PageDown → pad.js (Game.padKeys) → 점1·2·3 ▲ / ▼ (▲▼ 버튼과 같은 한 칸 계산, 꾹 누르면 계속.
              점마다 따로라서 여러 점을 동시에 움직일 수 있음. 빠르기는 config.js pad.keyRepeatDelay·keyRepeatEvery)
     ?        → 키 안내 열기/닫기 (PC 화면에서만 보이는 오른쪽 아래 「?」 버튼과 같음)
     (키 없음) → move.js (Game.recenter) → 내 잠수함으로 화면 돌아가기 (13차, 키 설정 화면에서 정함)
   잠김(어뢰 날아가는 중 등)은 각 파일이 원래대로 막음. 키를 꾹 누를 때 자동으로 반복되는 신호는 무시
   키 설정 화면이 열려 있는 동안은 게임 키가 전부 쉼 (키를 바꾸다가 발사·이동되지 않게)
   move.js, pad.js, fire.js 다음에 불러야 함
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;

  /* =========================================================
     1. 키 목록 — 기본값(config.js) + 저장해 둔 것
     ========================================================= */
  var MAX_SLOTS = 2;            // 한 동작에 키 칸 2개 (첫째 키 + 둘째 키)
  var STORE = 'deepsea.keys.v1';   // 브라우저 저장 칸 이름

  // config.js 의 기본값을 따로 복사해 둠 (「기본값으로」 단추가 여기로 되돌림)
  var DEFAULTS = {};
  Object.keys(C.keys || {}).forEach(function (act) { DEFAULTS[act] = (C.keys[act] || []).slice(0, MAX_SLOTS); });

  // 키로 못 쓰는 키: Esc = 키 설정에서 「취소」 전용, F5 = 새로고침, F11 = 전체 화면, F12 = 개발자 창 (막으면 브라우저가 불편해짐)
  //   Ctrl·Alt·Windows(⌘) 키는 원래 게임이 안 받음 (Ctrl+R 같은 브라우저 기능을 위해) → 그 키들도 못 씀
  var RESERVED = { Escape: 1, F5: 1, F11: 1, F12: 1, ControlLeft: 1, ControlRight: 1, AltLeft: 1, AltRight: 1,
                   MetaLeft: 1, MetaRight: 1, OSLeft: 1, OSRight: 1, ContextMenu: 1, Unidentified: 1 };
  function usable(code) { return typeof code === 'string' && /^[A-Za-z0-9]+$/.test(code) && !RESERVED[code]; }

  function copyKeys(src) {
    var out = {};
    Object.keys(src).forEach(function (act) { out[act] = src[act].slice(); });
    return out;
  }

  // 저장해 둔 키 불러오기: 저장된 건 「기본값과 달라진 동작」만 → 기본값 위에 덮어씀
  //   (나중에 config.js 에 새 동작을 더하면 저장된 게 없으니 기본 키로 시작)
  //   저장 칸을 못 읽거나 망가져 있으면 그냥 기본값으로 (게임은 그대로 됨)
  function loadKeys() {
    var keys = copyKeys(DEFAULTS), saved = null;
    try { saved = JSON.parse(window.localStorage.getItem(STORE) || 'null'); } catch (err) { saved = null; }
    if (!saved || typeof saved !== 'object') return keys;
    var used = {};
    Object.keys(saved).forEach(function (act) {
      if (!DEFAULTS.hasOwnProperty(act) || !Array.isArray(saved[act])) return;   // 이제는 없는 동작은 버림
      keys[act] = saved[act].filter(function (c) { return usable(c) && !used[c] && (used[c] = true); }).slice(0, MAX_SLOTS);
    });
    // 기본값 그대로인 동작이 저장된 키와 겹치면(예: 새 동작의 기본 키를 형님이 다른 데 이미 씀) → 저장된 쪽이 이김
    Object.keys(keys).forEach(function (act) {
      if (saved.hasOwnProperty(act)) return;
      keys[act] = keys[act].filter(function (c) { return !used[c]; });
    });
    return keys;
  }
  // 저장: 기본값과 다른 동작만 적음. 다 기본값이면 저장 칸을 지움. 못 쓰면(사생활 보호 창 등) 이번 창에서만 바뀜
  function saveKeys() {
    var diff = {}, any = false;
    Object.keys(K).forEach(function (act) {
      if (K[act].join(',') !== DEFAULTS[act].join(',')) { diff[act] = K[act].slice(); any = true; }
    });
    try {
      if (any) window.localStorage.setItem(STORE, JSON.stringify(diff));
      else window.localStorage.removeItem(STORE);
      return true;
    } catch (err) { return false; }
  }

  var K = loadKeys();
  C.keys = K;                   // config.js keys 도 「지금 쓰는 키」를 가리키게 (밖에서 볼 때 헷갈리지 않게)

  // 키 이름 → 동작 이름 찾기표 (K 를 뒤집어 둠). 키를 바꿀 때마다 다시 만듦
  var actionOf = {};
  function rebuildLookup() {
    actionOf = {};
    Object.keys(K).forEach(function (act) {
      K[act].forEach(function (code) { actionOf[code] = act; });
    });
  }
  rebuildLookup();

  /* =========================================================
     2. 게임 키 처리 (12차 그대로 + recenter + 설정 화면 열려 있으면 쉼)
     ========================================================= */
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
  //   점마다 꾹 누르기가 따로라서(pad.js pinStart) 다른 점 키는 같이 눌러도 동시에 움직이고, 하나를 떼도 나머지는 계속
  //   같은 점의 ▲·▼ 를 같이 누르면: 「나중에 누른 쪽」만 움직임. 그 키를 떼면 아직 누르고 있는 반대쪽으로 이어감
  var pinDir = [0, 0, 0];   // [점] = 지금 움직이는 방향 (-1 ▲ / +1 ▼ / 0 멈춤)
  function pinAct(i, dir) {   // 점 i 의 ▲(-1) 또는 ▼(+1) 동작 이름
    return 'pin' + (i + 1) + (dir < 0 ? 'Up' : 'Down');
  }
  function pinPress(act) {
    var pin = PINS[act];
    G.padKeys.select(pin[0]);                                // 그 점을 고름 (노란 빛 = 마지막에 누른 점 키)
    G.padKeys.pinStart(pin[0], pin[1]);                      // 누르는 순간 한 칸 + 꾹 누르면 계속
    pinDir[pin[0]] = pin[1];
  }
  function pinRelease(act) {
    var pin = PINS[act];
    if (pinDir[pin[0]] !== pin[1]) return;                   // 이 점은 이미 반대쪽 키로 움직이는 중 → 그대로 둠
    if (stillHeld(pinAct(pin[0], -pin[1]))) {                // 반대쪽 키를 아직 누르고 있으면 그쪽으로 이어감 (한 칸 없이)
      G.padKeys.pinStart(pin[0], -pin[1], false);
      pinDir[pin[0]] = -pin[1];
    } else {
      G.padKeys.pinStop(pin[0]);
      pinDir[pin[0]] = 0;
    }
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
      case 'recenter': if (G.recenter) G.recenter(); break;
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
    if (setOpen) return;                // 키 설정 화면이 열려 있으면 게임 키는 쉼 (설정 화면이 따로 받음, 아래 4번)
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
  //   (발사는 손가락이 끊겼을 때처럼 「안 쏘고 원래대로」). 키 설정 화면을 열 때도 이것부터
  function releaseAll() {
    held = {};
    G.setMoveKeys(0, 0);
    G.setPanKeys(0, 0);
    G.fireHold.cancel('key');
    G.padKeys.up.stop('key');
    G.padKeys.down.stop('key');
    G.padKeys.pinStopAll();
    pinDir = [0, 0, 0];
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

  /* =========================================================
     3. 키 이름 (보여 주기용)
        short = 오른쪽 아래 키 안내용 짧은 이름 (Ins, PgUp …), 아니면 키 설정 화면용 긴 이름 (Insert, Page Up, 스페이스 …)
     ========================================================= */
  var SHORT = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter',
                Tab: 'Tab', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', Delete: 'Del', Slash: '?', Backspace: '←Bksp',
                CapsLock: 'Caps', ShiftLeft: 'Shift', ShiftRight: 'Shift', NumpadEnter: 'Num Enter' };
  var LONG = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '스페이스', Enter: 'Enter',
               Tab: 'Tab', PageUp: 'Page Up', PageDown: 'Page Down', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
               Backspace: 'Backspace', CapsLock: 'Caps Lock', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift',
               NumpadEnter: '숫자판 Enter', Slash: '? /', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
               BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
               IntlBackslash: '\\', IntlRo: '\\', IntlYen: '₩', Lang1: '한/영', Lang2: '한자', ScrollLock: 'Scroll Lock',
               Pause: 'Pause', PrintScreen: 'Print Screen', NumLock: 'Num Lock' };
  var NUMPAD_SIGN = { NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.' };
  function keyName(code, short) {
    var t = short ? SHORT : LONG;
    if (code in t) return t[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return (short ? 'Num' : '숫자판 ') + code.slice(6);
    if (code in NUMPAD_SIGN) return (short ? 'Num' : '숫자판 ') + NUMPAD_SIGN[code];
    if (!short && code in SHORT) return SHORT[code];
    return code;
  }
  function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- 키 안내 (PC 화면에서만: 오른쪽 아래 작은 「?」 — 보이고 안 보이고는 style.css) ----------
     내용은 지금 쓰는 키(K)에서 만들어서, 키 설정에서 바꾸면 안내도 바로 같이 바뀜 */
  function keysOf(act) {
    var list = K[act] || [];
    return list.filter(function (code) {
      // 숫자판 키는 같은 동작에 윗줄 숫자(또는 Enter)도 있으면 안내에서 생략 (자리만 차지하니까)
      if (/^Numpad\d$/.test(code)) return list.indexOf('Digit' + code.slice(6)) < 0;
      if (code === 'NumpadEnter') return list.indexOf('Enter') < 0;
      return true;
    }).map(function (c) { return '<kbd>' + escHtml(keyName(c, true)) + '</kbd>'; }).join('');
  }
  // 키가 하나도 없는 줄(아직 안 정한 점 고르기·화면 돌아가기 등)은 안내에서 빠짐
  var ROWS = [
    [['up', 'left', 'down', 'right'], '잠수함 이동'],
    [['camUp', 'camLeft', 'camDown', 'camRight'], '화면 둘러보기'],
    [['recenter'], '내 잠수함으로 화면 돌아가기'],
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
  function renderHelp() {
    if (!helpBox) return;
    helpBox.innerHTML = '<b>키보드</b>' + ROWS.map(function (r) {
      var k = r[0].map(keysOf).join('');
      return k ? '<p><span>' + k + '</span><em>' + r[1] + '</em></p>' : '';
    }).join('') + '<small>마우스로도 전부 됨</small>' +
      '<button class="keyhelp-set" id="btnKeySet" type="button">키 설정</button>';   // 13차: 키 바꾸는 화면 열기
  }
  function toggleHelp() {
    if (!helpBox) return;
    var open = helpBox.hidden;
    helpBox.hidden = !open;
    if (helpBtn) helpBtn.classList.toggle('on', open);
  }
  if (helpBtn) helpBtn.addEventListener('click', toggleHelp);
  if (helpBox) helpBox.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'btnKeySet') openSettings();
  });

  /* =========================================================
     4. 키 설정 화면 (13차, PC 만 — 「?」 안내 맨 아래 「키 설정」 단추로 열림)
        칸을 누르면 「키를 누르세요」 → 다음에 누른 키가 그 칸에 들어감 (Esc = 취소, 같은 칸 다시 누르기 = 비우기)
        ★ 겹치는 키 규칙 = 「서로 바꾸기」: 고른 키가 이미 다른 동작에 쓰이고 있으면,
           그 동작의 그 칸에는 이 칸에 원래 있던 키가 들어감 (이 칸이 비어 있었으면 그쪽 칸은 「없음」이 됨)
           → 키를 바꾸다가 발사 같은 중요한 동작이 실수로 키 없이 남는 일을 줄이려고 지우기 대신 바꾸기로 함
        바뀐 키는 바로 적용 + 브라우저에 저장. 「기본값으로」 = config.js keys 기본값으로 전부 되돌림
     ========================================================= */
  // 설정 화면에 보이는 순서와 이름 (config.js 에 새 동작을 더하면 여기에도 한 줄)
  var LABELS = [
    ['up', '이동 위'], ['down', '이동 아래'], ['left', '이동 왼쪽'], ['right', '이동 오른쪽'],
    ['camUp', '화면 둘러보기 위'], ['camDown', '화면 둘러보기 아래'], ['camLeft', '화면 둘러보기 왼쪽'], ['camRight', '화면 둘러보기 오른쪽'],
    ['recenter', '내 잠수함으로 화면 돌아가기'],
    ['fire', '발사 (꾹 눌렀다 떼기)'],
    ['item1', '아이템 1'], ['item2', '아이템 2'], ['item3', '아이템 3'], ['item4', '아이템 4'],
    ['pin1Up', '핀1 ▲'], ['pin1Down', '핀1 ▼'], ['pin2Up', '핀2 ▲'], ['pin2Down', '핀2 ▼'], ['pin3Up', '핀3 ▲'], ['pin3Down', '핀3 ▼'],
    ['reset', '핀 처음으로 (↺)'], ['endTurn', '턴 넘기기'], ['help', '키 목록 열기/닫기'],
    ['pin1', '(예비) 핀1 고르기'], ['pin2', '(예비) 핀2 고르기'], ['pin3', '(예비) 핀3 고르기'],
    ['nudgeUp', '(예비) 고른 핀 ▲'], ['nudgeDown', '(예비) 고른 핀 ▼']
  ];
  var labelOf = {};
  LABELS.forEach(function (l) { labelOf[l[0]] = l[1]; });
  // 이름표에 없는 동작(나중에 config.js 에만 더한 것)도 맨 아래에 동작 이름 그대로 보여 줌
  Object.keys(K).forEach(function (act) { if (!labelOf[act]) { LABELS.push([act, act]); labelOf[act] = act; } });

  var setBox = document.getElementById('keySet');
  var setOpen = false;          // 설정 화면이 열려 있는지 (열려 있으면 위 게임 키 처리가 쉼)
  var waiting = null;           // 「키를 누르세요」 기다리는 칸 { act, slot }
  var note = { text: '', kind: '' };   // 맨 위 알림 줄 (kind: 'warn' 노랑 / 'ok' 초록 / '' 보통)
  var flashActs = {};           // 방금 바뀐 줄 (잠깐 빛남)
  var swallowUp = null;         // 방금 칸에 넣은 키 — 그 키를 뗄 때 단추가 눌리지 않게 막음

  var HINT = '바꿀 칸을 누르고 → 쓰고 싶은 키를 누르세요. 바꾸면 바로 적용·저장돼요.';

  function renderSettings() {
    if (!setBox) return;
    var rows = LABELS.filter(function (l) { return K.hasOwnProperty(l[0]); }).map(function (l) {
      var act = l[0], slots = '';
      for (var i = 0; i < MAX_SLOTS; i++) {
        var code = K[act][i], wait = waiting && waiting.act === act && waiting.slot === i;
        var text = wait ? '키를 누르세요' : (code ? keyName(code) : '없음');
        slots += '<button type="button" class="ks-slot' + (wait ? ' wait' : '') + (code ? '' : ' none') +
                 '" data-act="' + act + '" data-slot="' + i + '">' + escHtml(text) + '</button>';
      }
      return '<div class="ks-row' + (flashActs[act] ? ' flash' : '') + (labelOf[act].indexOf('(예비)') === 0 ? ' spare' : '') + '">' +
             '<span class="ks-name">' + escHtml(labelOf[act]) + '</span>' + slots + '</div>';
    }).join('');
    setBox.innerHTML =
      '<div class="ks-panel" role="dialog" aria-label="키 설정">' +
        '<div class="ks-head"><b>키 설정</b>' +
          '<button type="button" class="ks-btn" data-cmd="reset">기본값으로</button>' +
          '<button type="button" class="ks-btn main" data-cmd="close">닫기 (Esc)</button></div>' +
        '<p class="ks-note ' + note.kind + '">' + escHtml(note.text || HINT) + '</p>' +
        '<div class="ks-list">' + rows + '</div>' +
        '<small class="ks-foot">이미 다른 일에 쓰는 키를 고르면 <b>두 칸의 키를 서로 바꿔요</b> (이 칸이 비어 있었으면 다른 쪽은 「없음」). ' +
          '못 쓰는 키: Esc(취소용)·F5·F11·F12, Ctrl·Alt 와 같이 누른 키. 기다리는 칸을 한 번 더 누르면 그 칸을 비워요.</small>' +
      '</div>';
  }

  function openSettings() {
    if (!setBox || setOpen) return;
    releaseAll();               // 누르고 있던 게임 키(발사 꾹 누르기 등)는 안 쏘고 전부 놓음
    setOpen = true;
    waiting = null; note = { text: '', kind: '' }; flashActs = {};
    renderSettings();
    setBox.hidden = false;
  }
  function closeSettings() {
    if (!setOpen) return;
    setOpen = false;
    waiting = null;
    setBox.hidden = true;
  }

  // 바뀐 뒤 공통: 찾기표·안내 다시 만들고 저장
  function applyChange() {
    rebuildLookup();
    renderHelp();
    if (!saveKeys()) note = { text: note.text + ' (브라우저에 저장은 못 했어요 — 이번 창에서만 바뀜)', kind: 'warn' };
  }

  // 칸 (act, slot) 에 키 code 넣기 — 겹치면 서로 바꾸기 (위 ★ 규칙)
  function assign(act, slot, code) {
    var list = K[act];
    slot = Math.min(slot, list.length);          // 첫째 칸이 비었는데 둘째 칸을 골랐으면 첫째 칸에 넣음
    var oldCode = list[slot];                    // 이 칸에 원래 있던 키 (없을 수도)
    if (oldCode === code) { note = { text: keyName(code) + ' 키는 이미 이 칸에 있어요.', kind: '' }; return; }
    var other = actionOf[code], flash = {};
    flash[act] = true;
    if (other) {
      var oi = K[other].indexOf(code);
      if (oldCode) K[other][oi] = oldCode; else K[other].splice(oi, 1);
      flash[other] = true;
      if (other === act) {
        note = { text: '같은 동작 안에서 두 칸의 키를 서로 바꿨어요.', kind: 'ok' };
      } else {
        note = { text: '⚠ ' + keyName(code) + ' 키는 「' + labelOf[other] + '」에 쓰이고 있었어요 → 서로 바꿨어요: 「' + labelOf[other] + '」 = ' +
                        (oldCode ? keyName(oldCode) : '없음'), kind: 'warn' };
      }
      list = K[act];
      slot = Math.min(slot, list.length);
    } else {
      note = { text: '「' + labelOf[act] + '」 = ' + keyName(code), kind: 'ok' };
    }
    list[slot] = code;
    flashActs = flash;
    applyChange();
  }
  function clearSlot(act, slot) {
    if (K[act][slot] === undefined) { note = { text: '이미 빈 칸이에요.', kind: '' }; return; }
    var code = K[act].splice(slot, 1)[0];
    note = { text: '「' + labelOf[act] + '」에서 ' + keyName(code) + ' 키를 뺐어요.', kind: 'ok' };
    flashActs = {}; flashActs[act] = true;
    applyChange();
  }
  function resetAll() {
    K = copyKeys(DEFAULTS);
    C.keys = K;
    waiting = null; flashActs = {};
    note = { text: '전부 기본 키로 되돌렸어요.', kind: 'ok' };
    applyChange();
  }

  if (setBox) {
    setBox.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) {
        if (e.target === setBox) { if (waiting) { waiting = null; note = { text: '', kind: '' }; renderSettings(); } else closeSettings(); }   // 바깥 어두운 곳 = 취소 / 닫기
        return;
      }
      if (t.blur) t.blur();     // 단추에 「눌린 자리」가 남으면 스페이스·Enter 가 그 단추를 또 누름 → 키로 쓸 수 있게 놓아 줌
      var cmd = t.getAttribute('data-cmd');
      if (cmd === 'close') { closeSettings(); return; }
      if (cmd === 'reset') { resetAll(); renderSettings(); return; }
      var act = t.getAttribute('data-act');
      if (!act) return;
      var slot = +t.getAttribute('data-slot');
      if (waiting && waiting.act === act && waiting.slot === slot) { waiting = null; clearSlot(act, slot); }   // 기다리는 칸을 또 누름 = 비우기
      else { waiting = { act: act, slot: slot }; note = { text: '「' + labelOf[act] + '」에 쓸 키를 누르세요. (Esc = 취소, 이 칸을 한 번 더 누르면 비우기)', kind: '' }; }
      renderSettings();
    });
  }

  // 설정 화면이 열려 있는 동안의 키: 게임보다 먼저 받음 (capture). 게임 쪽 keydown 은 setOpen 이라 쉼
  document.addEventListener('keydown', function (e) {
    if (!setOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (waiting) { waiting = null; note = { text: '취소했어요.', kind: '' }; renderSettings(); }
      else closeSettings();
      return;
    }
    if (!waiting) return;       // 기다리는 칸이 없으면 Tab·Enter 등은 보통 단추 이동·누르기로 둠
    if (e.repeat) { e.preventDefault(); return; }   // 꾹 누를 때 자동 반복 신호는 무시
    if (e.ctrlKey || e.altKey || e.metaKey || !usable(e.code)) {
      // 못 쓰는 키는 알림만. 막지 않고 브라우저에 그대로 넘김 (Ctrl+R 새로고침·F5·F11 전체 화면 등은 평소처럼 됨)
      note = { text: '⚠ 그 키는 쓸 수 없어요 (Esc·F5·F11·F12, Ctrl·Alt 와 같이 누른 키). 다른 키를 누르세요.', kind: 'warn' };
      renderSettings();
      return;
    }
    e.preventDefault();         // 칸에 넣는 키는 원래 하던 일(스크롤·F1 도움말·Tab 칸 이동 등)을 막음
    var w = waiting;
    waiting = null;
    swallowUp = e.code;
    assign(w.act, w.slot, e.code);
    renderSettings();
  }, true);
  // 방금 칸에 넣은 키를 뗄 때 단추가 눌리지 않게 (스페이스는 뗄 때 단추를 누름)
  document.addEventListener('keyup', function (e) {
    if (swallowUp && e.code === swallowUp) { swallowUp = null; if (setOpen) e.preventDefault(); }
  }, true);

  renderHelp();

  // 확인용으로 밖에서 볼 수 있게
  G.keySettings = { open: openSettings, close: closeSettings, isOpen: function () { return setOpen; },
                    current: function () { return copyKeys(K); }, defaults: function () { return copyKeys(DEFAULTS); } };
})();
