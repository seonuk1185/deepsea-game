/* =========================================================
   심해 포격전(가칭) — 게임 화면
   하는 일: 설정값(config.js)대로 화면을 그림 + 카메라 + 바다 끌어서 둘러보기
           + 「주문서 창구」 Game.submit — 모든 행동 쪽지를 받아 심판(rules.js)에게 넘기고, 결과대로 화면을 바꿈
   진짜 게임 상태(잠수함 자리·체력·조류·차례)는 심판(rules.js)이 들고 있음. 이 파일은 그걸 「보여 주기」만 함
   잠수함 이동(조이스틱)은 move.js 가 맡음
   궤도 판 점 끌기는 pad.js, 발사 꾹 누르기(거리 정하기)는 fire.js, 어뢰 재생(날아가기·폭발·데미지 숫자)은 torpedo.js
   (14차) 차례 진행(20초 시계·상대 차례·판 끝)은 turn.js, 미니맵은 minimap.js. 여기는 「내 차례인가」 도우미 + 다시 하기(restart)
   컴퓨터 상대(③)는 bot.js — 사람과 같은 쪽지를 Game.submit 으로 냄
   rules.js 다음에 불러야 함
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, R = window.Rules;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 진짜 게임 상태 = 심판이 들고 있음 (rules.js) ----------
     잠수함 자리·바라보는 쪽·체력·팀·격침·이동 게이지, 조류, 차례 정보. 화면 코드는 읽기만 하고 직접 바꾸지 않음
     (바꾸고 싶으면 주문서를 Game.submit 으로 냄) */
  var rs = R.createState(C, C.seed);
  var mySubId = C.mySubId || 'me';   // (14차) 이 화면에서 내가 조종하는 잠수함

  /* ---------- 판 시계 (14차) ----------
     판이 시작된 뒤 지난 시간 (1/1000초). 화면 창구(submit)가 모든 쪽지에 at 으로 찍어 줌 → 심판은 이 숫자로만 시간을 판단
     (심판은 시계를 직접 안 봄 — rules.js 맨 위 「턴 시계」 설명). 온라인 때는 서버 시계가 이 자리를 대신함 */
  var clock0 = performance.now();
  function matchNow() { return performance.now() - clock0; }

  /* ---------- 화면 쪽 상태 (내 손에서 아직 준비 중인 것 + 보여 주기용) ----------
     궤도 판: 핀 3개 [가로(거리 칸, 잠수함 쪽 끝 = 0), 세로(판 높이 %)] (캐릭터 기본 모양에서 시작) + 거리 게이지 찬 정도 (0~1)
             + sel = ▲▼ 미세조정으로 움직일 「골라 둔 점」 번호 (0~2, 처음엔 가운데)
     조준(점 모양)은 발사 주문서에 담겨서 심판에게 갈 때 비로소 「진짜」가 됨 */
  var state = {
    pad: { points: defaultPoints(), fill: 0, facing: 'right', sel: C.pad.defaultSelected || 0 }
  };
  // 화면에 지금 보이는 체력·바라보는 쪽 (어뢰가 날아가는 동안엔 심판 결과보다 늦게, 맞는 순간에 바뀜)
  var shown = {};
  rs.subs.forEach(function (s) { shown[s.id] = { hp: s.hp, facing: s.facing }; });
  function copyPoints(list) { return list.map(function (p) { return [p[0], p[1]]; }); }
  // 캐릭터 기본 점 모양 (설정값이 노란 상자 밖이면 상자 안으로 넣어서)
  function defaultPoints() {
    var lim = C.character.limit;
    return C.character.padPoints.map(function (p) {
      return [clamp(p[0], lim.left, lim.right), clamp(p[1], lim.top, lim.bottom)];
    });
  }
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function getSub(id) { return R.getSub(rs, id); }   // 심판이 들고 있는 잠수함 (읽기용)

  /* ---------- 내 차례인가 (14차) ----------
     isMyTurn = 지금 차례가 내 잠수함이고, 판이 안 끝났고, 내 잠수함이 살아 있음
     canAct   = 거기에 더해 어뢰를 보여 주는 중이 아님 (2026-10-28: 쏜 뒤에도 재생이 끝나면 다시 움직일 수 있음)
     canFire  = 거기에 더해 이번 차례에 아직 안 쐈음 (한 차례에 한 발)
     → 조이스틱·WASD·턴 넘기기는 canAct, 발사는 canFire 일 때만. 궤도 판 점(조준)은 상대 차례에도 미리 맞춰 둘 수 있음 */
  function isMyTurn() {
    var me = getSub(mySubId);
    return !rs.over && rs.turn.activeId === mySubId && !!me && !me.sunk;
  }
  function canAct() { return isMyTurn() && !state.busy; }
  function canFire() { return canAct() && !rs.turn.fired; }

  var seaView = $('seaView'), world = $('world'), worldBg = $('worldBg'), worldThings = $('worldThings');

  /* ---------- 잠수함 임시 그림 (D2: 강철 잠수함 — 3D 모델이 오기 전까지) ----------
     시안 D2 와 같은 몸통 그림. 오른쪽을 보는 모양 (왼쪽을 보면 style.css 가 좌우 뒤집음)
     편 구분 = 앞코 작은 불빛 + 몸통 쇠색: 우리 편 = 청록 불 + 푸른 쇠, 상대 = 빨간 불 + 붉은 쇠
     그림 칸 크기는 예전 그대로 76×44 (판정 크기 config.js movement.subHalfW·H 와 같음) — 그림만 바뀜
     viewBox 세로 가운데(24) = 몸통 가운데 → 잠수함 자리(x, y)가 몸통 한가운데 */
  var SUB_TONES = {
    ours:   { hi: '#9fb2bc', mid: '#3b4b55', lo: '#0a0f12', light: '#8ff4ff' },
    theirs: { hi: '#a48f8c', mid: '#4b3836', lo: '#110b0a', light: '#ff8696' }
  };
  function subSvg(id, tone) {
    var k = SUB_TONES[tone] || SUB_TONES.ours, g = 'subGrad-' + id;
    return '<svg viewBox="0 -1 120 50" aria-hidden="true" style="color:' + k.light + '">' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + k.hi + '"/>' +
        '<stop offset=".45" stop-color="' + k.mid + '"/><stop offset="1" stop-color="' + k.lo + '"/></linearGradient></defs>' +
      '<g fill="url(#' + g + ')">' +
        '<path d="M8 24C8 16 20 13 40 13h52c16 0 24 5 24 11s-8 11-24 11H40C20 35 8 32 8 24z"/>' +   // 몸통
        '<path d="M52 13l4-10h18l4 10z"/>' +                                                         // 탑
        '<path d="M66 3V-3h5" fill="none" stroke="#2b3438" stroke-width="1.5"/>' +                   // 잠망경
        '<path d="M12 24L2 16l3 8-3 8z" fill="#1a2024"/>' +                                          // 꼬리 날개
        '<path d="M40 13v22M92 13v22M20 24h88" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>' +       // 이음매
        '<path d="M22 16c20-2 60-2 84 1" stroke="rgba(255,255,255,.25)" stroke-width="1" fill="none"/>' +   // 위 반짝임
        '<circle cx="108" cy="22" r="2" fill="currentColor"/><circle cx="108" cy="22" r="5" fill="currentColor" opacity=".25"/>' +   // 앞코 불빛
      '</g></svg>';
  }
  // 계기판 홀로그램 창의 내 잠수함 (청록 선 그림)
  function holoSvg() {
    return '<svg viewBox="0 0 120 44" aria-hidden="true"><g fill="rgba(62,232,255,.12)" stroke="#7ff0ff" stroke-width="1.6">' +
      '<path d="M10 24C10 16 22 14 40 14h52c14 0 22 4 22 10s-8 10-22 10H40C22 34 10 32 10 24z"/>' +
      '<path d="M52 14l4-10h18l4 10" fill="none"/><path d="M14 24l-10-8v16z"/></g>' +
      '<g stroke="rgba(127,240,255,.5)" stroke-width=".8"><path d="M40 14v20M66 14v20M92 14v20M12 24h100"/></g></svg>' +
      '<span class="base"></span>';
  }
  // 이 잠수함이 우리 편인가 (내 잠수함과 같은 팀) → 그림 색
  function toneOf(s) {
    var me = getSub(mySubId);
    return me && s.team === me.team ? 'ours' : 'theirs';
  }

  /* ---------- 아이템 아이콘 (색 = currentColor: 보통 청록, 골라진 칸은 앰버 — style.css .slot / .slot.sel) ---------- */
  var ITEM_ICONS = {
    double: '<svg viewBox="0 0 26 26" aria-hidden="true"><g fill="currentColor"><rect x="3" y="6" width="15" height="5" rx="2.5"/><path d="M18 6l5 2.5-5 2.5z"/><rect x="3" y="15" width="15" height="5" rx="2.5"/><path d="M18 15l5 2.5-5 2.5z"/></g></svg>',
    shield: '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M13 3l8 3v6c0 5-3.5 8.5-8 10.5C8.5 20.5 5 17 5 12V6z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    move:   '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M4 13h18M8 9l-4 4 4 4M18 9l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>'
  };
  var ITEM_EMPTY = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M8 13h10M13 8v10" stroke="currentColor" stroke-width="2"/></svg>';   // 빈 칸 = 희미한 +
  var ITEM_NAMES = { double: '2연발', shield: '방어막', move: '무브' };

  /* =========================================================
     1. 게임 세계 그리기 (배경 + 잠수함 + 보급상자)
     ========================================================= */
  function buildWorld() {
    world.style.width = C.world.w + 'px';
    world.style.height = C.world.h + 'px';

    // 배경: 맵 높이에 맞춘 그림을 좌우 거울로 이어 붙여 맵 가로를 채움
    var bg = C.background;
    var tileW = C.world.h * bg.imgW / bg.imgH;
    var html = '';
    for (var i = 0, x = 0; x < C.world.w; i++, x += tileW) {
      html += '<div class="bg-tile' + (i % 2 ? ' flip' : '') + '" style="left:' + x + 'px;width:' + (tileW + 1) +
        'px;background-image:url(\'' + bg.src + '\')"></div>';
    }
    worldBg.innerHTML = html;

    // 보급상자
    html = '';
    C.crates.forEach(function (c) {
      html += '<div class="crate" style="left:' + c.x + 'px;top:' + c.y + 'px"><b>?</b></div>';
    });

    // 잠수함 + 머리 위 이름·체력바 (+ 차례 화살표: 잠수함마다 하나씩 있고, 지금 차례인 잠수함(.active)만 보임 — 14차)
    rs.subs.forEach(function (s) {
      var active = s.id === rs.turn.activeId;
      html += '<div class="sub ' + s.side + ' face-' + s.facing + (active ? ' active' : '') + (s.sunk ? ' sunk' : '') + '" id="sub-' + s.id + '" style="left:' + s.x + 'px;top:' + s.y + 'px">' +
        '<div class="tag">' +
          '<div class="turnarrow" aria-label="차례"></div>' +
          (s.sunk ? '<div class="sunkmark">격침</div>' : '') +
          '<div class="name">' + s.name + '</div>' +
          '<div class="minihp"><i style="width:' + s.hp + '%"></i></div>' +
        '</div>' +
        '<div class="body">' + subSvg(s.id, toneOf(s)) + '</div>' +
      '</div>';
    });
    worldThings.innerHTML = html;
  }

  /* =========================================================
     2. 카메라 — 세계의 어느 부분을 화면에 보여 줄지
        cam.x, cam.y = 화면 왼쪽 위 모서리가 보는 세계 좌표
     ========================================================= */
  // follow = 카메라가 움직이는 잠수함을 따라갈지 (바다를 손으로 밀면 꺼지고, 조이스틱을 잡으면 다시 켜짐)
  // manual = 직접 둘러봤음 (바다 끌기·화살표 키). 켜져 있으면 키보드(WASD)로 움직여도 카메라를 잠수함으로 안 끌고 옴
  //          조이스틱을 잡거나 어뢰가 끝나 카메라가 내 잠수함으로 돌아올 때 꺼짐 (move.js, torpedo.js)
  var cam = { x: 0, y: 0, zoom: 1, viewW: 0, viewH: 0, follow: false, panning: false, manual: false };

  function measureCamera() {
    cam.viewW = seaView.clientWidth;
    cam.viewH = seaView.clientHeight;
    // 화면에 맵의 가로 절반·세로 1/1.4 넘게는 안 보이도록 배율을 정함
    cam.zoom = Math.max(
      cam.viewW / (C.world.w * C.world.viewMaxW),
      cam.viewH / (C.world.h * C.world.viewMaxH)
    );
    document.documentElement.style.setProperty('--inv-zoom', (1 / cam.zoom).toFixed(4));
  }

  // 맵 밖이 보이지 않게 카메라 위치를 가둠
  function clampCamera() {
    var maxX = C.world.w - cam.viewW / cam.zoom;
    var maxY = C.world.h - cam.viewH / cam.zoom;
    cam.x = Math.min(Math.max(cam.x, 0), Math.max(maxX, 0));
    cam.y = Math.min(Math.max(cam.y, 0), Math.max(maxY, 0));
  }

  function applyCamera() {
    clampCamera();
    world.style.transform = 'translate(' + (-cam.x * cam.zoom).toFixed(2) + 'px,' + (-cam.y * cam.zoom).toFixed(2) + 'px) scale(' + cam.zoom + ')';
  }

  // 세계 좌표 (x, y)를 화면 가운데에 오게 함 (나중에 턴이 넘어올 때 부드럽게 옮기는 데 씀)
  function focusOn(x, y) {
    cam.x = x - cam.viewW / cam.zoom / 2;
    cam.y = y - cam.viewH / cam.zoom / 2;
    applyCamera();
  }
  function focusOnSub(id) {
    var s = getSub(id);
    if (s) focusOn(s.x, s.y);
  }

  /* ---------- 바다를 손가락으로 끌면 화면이 움직임 (둘러보기만) ----------
     조이스틱은 바다 창문 밖(HUD)에 있어서 조이스틱 손가락은 여기로 안 옴.
     조이스틱을 누른 채 다른 손가락으로 바다를 밀어도 됨 (첫 손가락이 아니어도 받음) */
  function enablePanning() {
    var drag = null;
    seaView.addEventListener('pointerdown', function (e) {
      if (drag) return;                                        // 바다는 한 손가락만
      if (e.pointerType === 'mouse' && e.button !== 0) return; // 마우스는 왼쪽 버튼만
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      seaView.setPointerCapture(e.pointerId);
      seaView.classList.add('dragging');
      cam.follow = false;     // 직접 둘러보는 중엔 카메라가 잠수함을 쫓지 않음
      cam.manual = true;      // 직접 둘러봤음 → WASD 로 움직여도 안 끌고 옴 (조이스틱은 다시 따라감)
      cam.panning = true;
    });
    seaView.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      cam.x = drag.cx - (e.clientX - drag.x) / cam.zoom;
      cam.y = drag.cy - (e.clientY - drag.y) / cam.zoom;
      applyCamera();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      cam.panning = false;
      seaView.classList.remove('dragging');
    }
    seaView.addEventListener('pointerup', end);
    seaView.addEventListener('pointercancel', end);
  }

  /* =========================================================
     3. 계기판 채우기
     ========================================================= */
  function buildDashboard() {
    $('timerNum').textContent = Math.ceil(rs.turn.limit / 1000);   // 한 차례 시간 (config.js turn.timeLimit). 줄어드는 건 turn.js
    setDelayNum(0);                        // (2026-10-28) DLY = 내 줄 서기 점수 (판 시작 = 0000). 차례 동안 오르는 건 turn.js
    setPadDist(null);                      // 터지는 거리 (판 구석) — 아직 안 정함 「--」
    $('mapName').textContent = C.mapName;

    // 아이템 4칸 (계기판 시간·DLY 칸 바로 위 가로 한 줄)
    $('items').innerHTML = C.items.map(function (it, i) {
      if (!it.type) return '<button class="slot" data-i="' + i + '" aria-label="빈 칸">' + ITEM_EMPTY + '</button>';
      return '<button class="slot full' + (it.selected ? ' sel' : '') + '" data-i="' + i + '" aria-label="' + ITEM_NAMES[it.type] + '">' +
        ITEM_ICONS[it.type] + '<i>' + it.count + '</i></button>';
    }).join('');
    // (12차) 칸을 누르면(또는 PC 키 1~4) 그 칸이 「골라짐」 = 노란 테두리. 아이템 쓰기는 아직 없음
    $('items').addEventListener('click', function (e) {
      var b = e.target.closest('.slot');
      if (b) selectItem(+b.getAttribute('data-i'));
    });

    setCurrent(rs.current.dir, rs.current.strength);         // 조류는 심판 상태에서 (같은 주사위)

    // 내 잠수함 얼굴 창
    var me = getSub(mySubId);

    // 이동 / 에너지 (세로 통)
    setMoveGauge(me ? me.move : C.movement.gaugeStart);
    setEnergyGauge(me ? me.hp : C.energy);

    $('faceWin').innerHTML = holoSvg();
    $('faceName').textContent = C.character.name;

    buildPad(me ? me.facing : 'right');
  }

  // 아이템 칸 고르기 (0~3). 빈 칸은 못 고름. 고른 칸만 노란 테두리
  function selectItem(i) {
    var it = C.items[i];
    if (!it || !it.type) return;
    C.items.forEach(function (x, k) { x.selected = k === i; });
    Array.prototype.forEach.call($('items').children, function (el, k) { el.classList.toggle('sel', k === i); });
  }

  /* ---------- 궤도 판 ----------
     잠수함이 오른쪽을 보면 왼쪽→오른쪽, 왼쪽을 보면 판 전체가 좌우 반전
     판 모양(한계선·눈금)을 새로 그리는 건 여기, 점·곡선·게이지만 바꿀 땐 drawPadCurve / setFireGauge */
  // 가로 거리 칸(잠수함 쪽 끝 = 0, 판 끝 = pad.span 40) → 판 위 % 자리. 잠수함이 왼쪽을 보면 뒤집음
  function u2p(u) { return u / C.pad.span * 100; }
  function padFx(u) { var x = u2p(u); return state.pad.facing === 'left' ? 100 - x : x; }
  // 거리 칸 → 맵(세계) 거리 (config.js pad.worldPerUnit: 1칸 = 맵 48, 판 전체 40칸 = 맵 가로 1920). 어뢰 날아가기에서 씀
  function unitsToWorld(u) { return u * C.pad.worldPerUnit; }

  function buildPad(facing) {
    state.pad.facing = facing;
    var L = facing === 'left', fx = padFx;
    var ch = C.character, lim = ch.limit, P = C.pad, h = '';
    var box = function (l, r, t, b, cls) {   // 판 % 좌표로 네모 하나
      return '<span class="' + cls + '" style="left:' + l + '%;width:' + (r - l) + '%;top:' + t + '%;height:' + (b - t) + '%"></span>';
    };

    // 점이 있는 세로 줄 (점선) — 점의 가로 자리는 캐릭터마다 고정
    state.pad.points.forEach(function (p) { h += '<span class="pcol" style="left:' + fx(p[0]) + '%"></span>'; });

    // 노란 한계 상자 (4면) + 바깥 어둡게. 위·아래 = 발사 각도, 왼쪽 = 최소 거리, 오른쪽 = 최대 거리
    var bx0 = Math.min(fx(lim.left), fx(lim.right)), bx1 = Math.max(fx(lim.left), fx(lim.right));   // 거리 칸 → 판 %
    h += box(0, 100, 0, lim.top, 'limzone') + box(0, 100, lim.bottom, 100, 'limzone');
    h += box(0, bx0, lim.top, lim.bottom, 'limzone') + box(bx1, 100, lim.top, lim.bottom, 'limzone');
    // 상자가 판 끝에 딱 붙어 있으면(limit.left = 0) 그쪽 테두리를 판 안쪽으로 들여 그려서 잘리지 않게
    h += box(bx0, bx1, lim.top, lim.bottom, 'limbox' + (bx0 <= 0 ? ' edge-l' : '') + (bx1 >= 100 ? ' edge-r' : ''));
    // (「○○ 한계」 글씨는 형님 지시로 뺌 2026-10-27)

    // 곡선 (청록 빛 선 = 넓고 흐린 빛 + 가는 밝은 선 두 겹. pad.js 가 점을 끌 때마다 drawPadCurve 로 다시 그림. 판 밖으로 나간 부분은 잘림)
    h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<path id="padCurveGlow" d="" fill="none" stroke="rgba(62,232,255,.25)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<path id="padCurve" d="" fill="none" stroke="#7ff0ff" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';

    // 거리 게이지 (가운데 주황 막대): 잠수함 쪽 끝에 붙어서 시작, 상자 오른쪽 변(최대 거리)까지만
    var gEnd = 100 - u2p(lim.right);
    var gStyle = L ? 'right:0;left:' + gEnd + '%' : 'left:0;right:' + gEnd + '%';
    h += '<div class="fgauge' + (L ? ' rtl' : '') + '" id="fGauge" style="' + gStyle + '" aria-hidden="true"><i></i><b></b></div>';

    // 점 3개 (작은 × 표시. 위치는 drawPadCurve 가 넣음)
    state.pad.points.forEach(function (p, i) { h += '<span class="cp" data-i="' + i + '"></span>'; });
    $('padScreen').innerHTML = h;
    drawPadCurve();
    setFireGauge(state.pad.fill);

    // 거리 눈금 (판 안 맨 아래에 겹친 띠) — 잠수함 쪽 끝 = 0. 1칸마다 작은 금, 3칸마다 큰 금 + 숫자 3, 6, 9 … 39 (판 모눈 세로줄과 같은 자리)
    var s = '';
    for (var u = 1; u < P.span; u++) {
      var big = u % P.labelEvery === 0;
      s += '<span class="tick' + (big ? ' major' : '') + '" style="left:' + fx(u) + '%"></span>';
      if (big) s += '<span class="num" style="left:' + fx(u) + '%">' + u + '</span>';
    }
    $('padScale').innerHTML = s;
    $('padDist').classList.toggle('rtl', L);   // 터지는 거리 숫자 = 잠수함 반대쪽 위 구석 (왼쪽을 보면 왼쪽 구석)
  }

  /* ---------- (2026-10-28) 계기판 DLY = 내 줄 서기 DELAY 점수, 4자리 (0000 → 0180 → 2340) ----------
     9999 를 넘으면 9999 로 보여 줌 (1초 = 10점이라 20초를 다 써도 한 차례 200점 → 50번 넘게 다 써야 넘음. 진짜 점수는 심판이 그대로 들고 있음) */
  function fmtDelay(v) { return ('000' + Math.min(9999, Math.max(0, Math.round(v || 0)))).slice(-4); }
  var shownDelay = null;
  function setDelayNum(v) {
    var s = fmtDelay(v);
    if (s !== shownDelay) { shownDelay = s; $('delayNum').textContent = s; }
  }
  // 터지는 거리 숫자 (궤도 판 구석). null = 「--」 (아직 안 정함)
  function setPadDist(v) { $('padDistNum').textContent = v == null ? '--' : Math.round(v); }

  /* ---------- 곡선 계산 ----------
     출발 = 판의 잠수함 쪽 끝, 세로 가운데(= 내 잠수함 높이) → 점1 → 점2 → 점3 을 「정확히」 지나는 부드러운 곡선.
     계산 자체는 심판(rules.js curveSpline / curveY)에 있음 — 판에 그리는 곡선과 어뢰가 나는 길이 늘 같도록 한 곳에서만 계산
     가로 x 는 「거리 칸」(잠수함 쪽 끝 = 0), 세로 y 는 판 높이 % (왼쪽을 볼 때 뒤집는 건 그릴 때만) */
  function curveSpline() { return R.curveSpline(state.pad.points); }
  function padCurveY(x, sp) { return R.curveY(sp || curveSpline(), x); }

  // 점 자리 + 곡선 다시 그리기
  function drawPadCurve() {
    var pts = state.pad.points, sp = curveSpline(), d = '';
    var xEnd = sp.k[sp.k.length - 1][0];                        // 맨 끝 핀 가로 = 곡선 끝
    for (var x = 0; ; x += 0.2) {                               // 0.2칸마다 한 점씩 이어 그림
      if (x > xEnd) x = xEnd;
      var y = Math.min(Math.max(padCurveY(x, sp), -400), 500);  // 판 밖은 어차피 잘려서 안 보임
      d += (x ? ' L' : 'M') + padFx(x).toFixed(2) + ' ' + y.toFixed(2);
      if (x >= xEnd) break;
    }
    var path = $('padCurve'), glow = $('padCurveGlow');
    if (path) path.setAttribute('d', d);
    if (glow) glow.setAttribute('d', d);
    Array.prototype.forEach.call($('padScreen').querySelectorAll('.cp'), function (el) {
      var p = pts[+el.getAttribute('data-i')];
      el.style.left = padFx(p[0]) + '%';
      el.style.top = p[1] + '%';
      el.classList.toggle('sel', +el.getAttribute('data-i') === state.pad.sel);   // 골라 둔 점 = 노란 빛 테두리
    });
    // (2026-10-31) 점마다 ▲▼ 버튼(pad.js 가 만듦): 가로 자리 = 그 점 가로 자리 (판 끝에선 버튼이 판 밖으로 안 나가게 css 가 막음)
    Array.prototype.forEach.call(document.querySelectorAll('.pinbtn'), function (el) {
      var p = pts[+el.getAttribute('data-i')];
      if (p) el.style.setProperty('--px', padFx(p[0]) + '%');
    });
  }

  // 거리 게이지 (0~1, 1 = 거리 한계선까지 꽉). 흰 표시 = 멈춘 자리
  function setFireGauge(v) {
    state.pad.fill = v;
    var g = $('fGauge');
    if (!g) return;
    var L = state.pad.facing === 'left', k = v.toFixed(4);
    var i = g.querySelector('i'), b = g.querySelector('b');
    i.style.cssText = (L ? 'right:1px;' : 'left:1px;') + 'width:calc((100% - 2px) * ' + k + ')';
    b.style.left = L ? 'calc(100% - ' + (v * 100).toFixed(2) + '%)' : (v * 100).toFixed(2) + '%';
  }

  // 게이지 찬 정도(0~1) → 거리 칸 (0 = 잠수함 쪽 끝, 1 = 최대 거리 limit.right). 판 안 눈금 숫자와 그대로 같음
  function gaugeToDistance(v) {
    return v * C.character.limit.right;
  }

  // 판 크기에 맞추기: ① 모눈 가로줄 간격 = 1칸 폭(정사각형 모눈) ② 판이 좁으면 눈금 숫자 글씨를 작게 (3칸마다 숫자는 그대로)
  function fitScaleLabels() {
    var scr = $('padScreen'), el = $('padScale');
    var cell = scr.clientWidth / C.pad.span;
    if (cell > 0) scr.style.setProperty('--cell', cell.toFixed(3) + 'px');
    el.classList.toggle('tight', el.clientWidth / C.pad.span * C.pad.labelEvery < 20);
  }

  /* ---------- 조류 표시: 화살표 4방향(화면 기준, 잠수함이 돌아봐도 그대로) + 세기 단계 숫자 + 5칸 막대 ---------- */
  var FLOW_TURN = { right: 0, down: 90, left: 180, up: 270 };
  function setCurrent(dir, level) {
    level = clamp(Math.round(level || 0), 0, 5);
    var arrow = $('flowArrow');
    arrow.style.transform = 'rotate(' + (FLOW_TURN[dir] || 0) + 'deg)';
    arrow.style.visibility = level ? '' : 'hidden';            // 세기 0 = 조류 없음 → 화살표 숨김
    $('flowLevel').textContent = level;
    Array.prototype.forEach.call($('flowSegs').children, function (seg, i) { seg.classList.toggle('on', i < level); });
    $('flowBox').setAttribute('aria-label', '조류 ' + ({ right: '오른쪽', left: '왼쪽', up: '위', down: '아래' }[dir] || '') + ' ' + level + '단계');
  }

  /* ---------- 움직일 때 쓰는 화면 바꾸기 (move.js 가 부름) ---------- */
  // 이동 게이지 (0~1): 세로 마디 막대 아래에서 위로 참 (통 안쪽 여백 2px씩 빼고). 20% 이하면 빨갛게 깜빡 (경고)
  function setMoveGauge(v) {
    var mv = $('moveBar');
    mv.style.height = 'calc((100% - 4px) * ' + v.toFixed(4) + ')';
    mv.classList.toggle('low', v <= 0.2);
  }
  // 에너지 게이지 (0~100): 세로 마디 막대 높이 + 위 숫자
  function setEnergyGauge(hp) {
    $('energyBar').style.height = 'calc((100% - 4px) * ' + (hp / 100).toFixed(4) + ')';
    $('energyNum').textContent = hp;
  }
  // 잠수함 그림을 지금 좌표(심판 상태)로 옮김 (이름·체력바·화살표는 잠수함에 붙어 있어 같이 움직임)
  function placeSub(id) {
    var s = getSub(id), el = $('sub-' + id);
    if (!s || !el) return;
    el.style.left = s.x.toFixed(2) + 'px';
    el.style.top = s.y.toFixed(2) + 'px';
  }
  // 잠수함이 바라보는 쪽(심판 상태)을 화면에 반영 + 내 잠수함이면 궤도 판도 좌우 반전
  function showFacing(id) {
    var s = getSub(id), el = $('sub-' + id), v = shown[id];
    if (!s || !v || v.facing === s.facing) return;
    var facing = v.facing = s.facing;
    if (el) {
      el.classList.remove('face-left', 'face-right');
      el.classList.add('face-' + facing);
    }
    if (s.side === 'me') { buildPad(facing); fitScaleLabels(); }
  }

  /* ---------- 보이는 체력 바꾸기 (torpedo.js 가 어뢰 재생 중 「맞는 순간」에 부름) ----------
     진짜 체력은 심판이 발사 순간 이미 계산해 둠. 여기는 화면에 보이는 숫자만 바꿈
     머리 위 노란 체력바 + (내 잠수함이면) 계기판 에너지 게이지·숫자를 같이 바꿈.
     0 이 되면 「격침」: 잠수함이 회색으로 + 머리 위에 「격침」 글씨 (아직 게임 끝내기는 없음) */
  function setSubHp(id, hp) {
    var s = shown[id], el = $('sub-' + id);
    if (!s) return;
    s.hp = clamp(Math.round(hp), 0, 100);
    if (el) {
      var bar = el.querySelector('.minihp i');
      if (bar) bar.style.width = s.hp + '%';
      if (s.hp <= 0 && !el.classList.contains('sunk')) {
        el.classList.add('sunk');
        var mark = document.createElement('div');
        mark.className = 'sunkmark';
        mark.textContent = '격침';
        el.querySelector('.tag').appendChild(mark);
      }
    }
    if (id === mySubId) {
      setEnergyGauge(s.hp);
    }
  }

  /* =========================================================
     주문서 창구 — 모든 행동은 여기 한 곳으로
       조이스틱·궤도 판·발사 버튼·턴 넘기기(그리고 나중에 키보드·컴퓨터 상대·인터넷 상대)는
       쪽지만 만들어서 Game.submit(쪽지) 로 냄 → 심판(rules.js)이 규칙대로 처리 → 결과를 화면 담당에게 알려 줌
       화면 담당은 Game.onResult('move' | 'fire' | 'endTurn', 함수) 로 「이 결과가 오면 이렇게 그려 줘」를 등록해 둠
       나중에 서버가 생기면: 쪽지는 서버로 보내고, 서버가 돌려준 결과로 똑같이 그리면 됨
     ========================================================= */
  var reactions = {};
  function onResult(type, fn) { (reactions[type] = reactions[type] || []).push(fn); }
  function submit(action) {
    if (action && action.at == null) action.at = Math.round(matchNow());   // (14차) 판 시계 찍기 (심판은 이 숫자로만 시간 판단)
    var res = R.apply(rs, action, C);
    if (!res.ok) return res;                                    // 규칙에 안 맞는 쪽지는 무시 (화면도 그대로)
    (reactions[res.type] || []).forEach(function (fn) { fn(res, action); });
    return res;
  }

  // 이동 결과 → 잠수함 그림 옮기기 + 바라보는 쪽 + (내 잠수함이면) 이동 게이지
  onResult('move', function (res) {
    showFacing(res.subId);
    if (res.moved > 0) placeSub(res.subId);
    if (res.subId === mySubId) setMoveGauge(res.move);
  });
  // (14차) 차례가 바뀜 (턴 넘기기·시간 끝) → 새 차례 잠수함 머리 위 화살표 + 조류(새로 굴린 값) + 거리 게이지·거리 숫자 처음으로
  //   (2026-10-28) DLY 칸 = 내 쌓인 점수 (지우지 않음 — turn.js 가 0.1초마다 맞춰 줌)
  //   + 내 이동 게이지 (심판이 새 차례 잠수함 게이지를 가득 채움). 카메라·번쩍·「상대 차례」 표시는 turn.js
  function onTurnChange(res) {
    markActive(res.activeId);
    setCurrent(rs.current.dir, rs.current.strength);
    var me = getSub(mySubId);
    if (me) setMoveGauge(me.move);
    setFireGauge(0);                                            // 지난 턴에 쏜 거리 게이지 비우기
    state.shot = null;
    setPadDist(null);
    if (me) setDelayNum(me.delay);
  }
  onResult('endTurn', onTurnChange);
  onResult('timeout', onTurnChange);
  // 차례 화살표: 지금 차례 잠수함에만 .active (화살표가 통통 튐)
  function markActive(id) {
    rs.subs.forEach(function (s) {
      var el = $('sub-' + s.id);
      if (el) el.classList.toggle('active', s.id === id);
    });
  }

  /* ---------- 유리 계기판 모양 (D2) ----------
     계기판 = 유리판 한 장: 양옆은 낮고(--dash-h), 궤도 판 칸(▲▼ 띠 포함)만 --dash-rise 만큼 솟음. 솟은 칸 양옆은 사선 어깨
     꼭짓점 (유리판 왼쪽 위 = 0,0 · 솟은 높이 R · 어깨 폭 s = R × 0.7 · 판 칸 양옆 6px 바깥 x1·x2):
       (0,R) → (x1-s,R) → (x1,0) → (x2,0) → (x2+s,R) → (W,R) → (W,H) → (0,H)
     유리 바탕(.bgl)은 이 모양으로 자르고(clip-path), 위 외곽선은 청록 빛 선(흐린 넓은 빛 + 가는 선 + 솟은 칸 위 흰 반사)
     턴 시작 번쩍(buildTurnFlash)도 같은 꼭짓점을 씀 → 모양이 늘 같음. 화면 크기가 바뀌면 onResize 가 다시 계산 */
  function frameGeom() {
    var fr = $('dashFrame'), pad = $('dash').querySelector('.pad');
    var fb = fr.getBoundingClientRect(), pb = pad.getBoundingClientRect();
    var W = fr.clientWidth, H = fr.clientHeight, R = H - $('dash').clientHeight;
    var x1 = pb.left - fb.left - 6, x2 = pb.right - fb.left + 6, s = R * 0.7;
    return { W: W, H: H, R: R, x1: x1, x2: x2, s: s };
  }
  // 위 외곽선 (왼쪽 끝 → 어깨 → 솟은 칸 윗변 → 어깨 → 오른쪽 끝). dy = 선 굵기만큼 안쪽으로 내림
  function frameOutline(g, dy) {
    var f = function (v) { return v.toFixed(1); }, y = g.R + dy, t = dy;
    return 'M0 ' + f(y) + ' L' + f(g.x1 - g.s) + ' ' + f(y) + ' L' + f(g.x1) + ' ' + f(t) +
      ' L' + f(g.x2) + ' ' + f(t) + ' L' + f(g.x2 + g.s) + ' ' + f(y) + ' L' + f(g.W) + ' ' + f(y);
  }
  function buildFrame() {
    var g = frameGeom(), fr = $('dashFrame');
    if (!g.W) return;
    var pts = [[0, g.R], [g.x1 - g.s, g.R], [g.x1, 0], [g.x2, 0], [g.x2 + g.s, g.R], [g.W, g.R], [g.W, g.H], [0, g.H]];
    fr.style.setProperty('--shape', 'polygon(' + pts.map(function (p) { return p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px'; }).join(',') + ')');
    var d = frameOutline(g, 0.5);
    $('frameLine').innerHTML =
      '<defs><linearGradient id="frameGrad" x1="0" x2="1"><stop offset="0" stop-color="#3ee8ff" stop-opacity=".25"/><stop offset=".5" stop-color="#3ee8ff"/><stop offset="1" stop-color="#3ee8ff" stop-opacity=".25"/></linearGradient></defs>' +
      '<path d="' + d + '" fill="none" stroke="#3ee8ff" stroke-opacity=".35" stroke-width="6" style="filter:blur(3px)"/>' +
      '<path d="' + d + '" fill="none" stroke="url(#frameGrad)" stroke-width="1.5"/>' +
      '<path d="M' + (g.x1 + 10).toFixed(1) + ' 3 L' + (g.x2 - 10).toFixed(1) + ' 3" stroke="rgba(255,255,255,.18)" stroke-width="1"/>';
  }

  /* ---------- 턴 시작 연출: 계기판 외곽선 번쩍 ----------
     (12차) 계기판 진짜 모양대로 선을 그려서 번쩍 → (D2) 유리판 모양(사선 어깨 + 솟은 칸)을 그대로 따라감 (frameGeom)
       청록 선 = 유리판 위 외곽선 / 안쪽 청록 빛 = 같은 모양 안쪽으로만 번짐 (바깥 바다 쪽으로는 안 번짐)
     번쩍 SVG 는 유리판(.frame)과 같은 자리·크기 (style.css .turnflash-svg) → 같은 좌표를 씀 */
  var flashSvg = null;
  function buildTurnFlash() {
    var dash = $('dash');
    if (!flashSvg) {
      flashSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      flashSvg.setAttribute('class', 'turnflash-svg');
      flashSvg.setAttribute('aria-hidden', 'true');
      flashSvg.innerHTML =
        '<defs><clipPath id="tfClip"><path id="tfShape"/></clipPath>' +
        '<filter id="tfBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
        '<g clip-path="url(#tfClip)"><path id="tfGlow" fill="none" stroke="rgba(62,232,255,.85)" stroke-width="16" filter="url(#tfBlur)"/></g>' +
        '<path id="tfLine" fill="none" stroke="#8ff4ff" stroke-width="3" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px #3ee8ff)"/>';
      dash.appendChild(flashSvg);
    }
    var g = frameGeom();
    var outline = frameOutline(g, 1.5);
    var shape = frameOutline(g, 0) + ' L' + g.W.toFixed(1) + ' ' + g.H.toFixed(1) + ' L0 ' + g.H.toFixed(1) + ' Z';   // 유리판 전체 모양 (빛이 안쪽으로만 번지게 자르는 틀)
    flashSvg.querySelector('#tfLine').setAttribute('d', outline);
    flashSvg.querySelector('#tfShape').setAttribute('d', shape);
    flashSvg.querySelector('#tfGlow').setAttribute('d', shape);        // 빛은 둘레 전체 안쪽
  }

  /* ---------- 링 시계 (D2): 청록 호 길이 = 남은 시간 비율 (1 = 가득, 0 = 다 됨). 흰 점 = 호 끝 ----------
     숫자는 turn.js 가 그대로 넣고, 이 호는 turn.js tick(0.1초마다)이 같이 부름 */
  var CLOCK_LEN = 2 * Math.PI * 25;                                     // 링 둘레 (반지름 25)
  function setClock(frac) {
    frac = clamp(frac || 0, 0, 1);
    var arc = $('clockArc'), dot = $('clockDot');
    if (arc) arc.style.strokeDasharray = (CLOCK_LEN * frac).toFixed(2) + ' ' + CLOCK_LEN.toFixed(2);
    if (dot) {
      dot.style.transform = 'rotate(' + (360 * frac).toFixed(1) + 'deg)';
      dot.style.opacity = frac > 0 ? '' : '0';
    }
  }
  function playTurnStart() {
    var dash = $('dash');
    buildTurnFlash();
    dash.classList.remove('turnflash');
    void dash.offsetWidth;            // 애니메이션 다시 시작하게
    dash.classList.add('turnflash');
    setTimeout(function () { dash.classList.remove('turnflash'); }, 1500);
  }

  /* ---------- 다시 하기 (14차): 판 끝 화면의 「다시 하기」 → 새 판 ----------
     심판 상태를 새로 만들어 「같은 그릇(rs)」에 갈아 끼움 (다른 파일들이 Game.rs 를 들고 있어서 그릇은 그대로 둠)
     → 바다 그림·계기판 값·판 시계를 처음으로. 다른 파일(turn.js·minimap.js 등)은 onRestart 로 각자 처음으로 돌아감
     seed = 새 주사위 번호 (안 주면 지금 번호 + 1 → 조류 순서가 지난 판과 달라짐) */
  var restartFns = [];
  function onRestart(fn) { restartFns.push(fn); }
  function restart(seed) {
    var fresh = R.createState(C, seed == null ? (rs.seed + 1) >>> 0 : seed);
    Object.keys(rs).forEach(function (k) { delete rs[k]; });
    Object.keys(fresh).forEach(function (k) { rs[k] = fresh[k]; });
    clock0 = performance.now();
    shown = {};
    rs.subs.forEach(function (s) { shown[s.id] = { hp: s.hp, facing: s.facing }; });
    state.busy = false;
    state.shot = null;
    buildWorld();
    var me = getSub(mySubId);
    setCurrent(rs.current.dir, rs.current.strength);
    setMoveGauge(me ? me.move : C.movement.gaugeStart);
    setEnergyGauge(me ? me.hp : C.energy);
    $('timerNum').textContent = Math.ceil(rs.turn.limit / 1000);
    setClock(1);
    setDelayNum(0);                   // 새 판 = 점수 전부 0
    setPadDist(null);
    state.pad.fill = 0;
    buildPad(me ? me.facing : 'right');
    fitScaleLabels();
    cam.follow = false; cam.manual = false;
    focusOnSub(rs.turn.activeId);
    restartFns.forEach(function (fn) { fn(); });
  }

  /* =========================================================
     4. 시작
     ========================================================= */
  function onResize() {
    // 화면 크기가 바뀌어도 보던 곳의 가운데를 유지
    var cx = cam.x + cam.viewW / cam.zoom / 2, cy = cam.y + cam.viewH / cam.zoom / 2;
    measureCamera();
    if (cam.viewW && cam.viewH) focusOn(cx, cy);
    fitScaleLabels();
    buildFrame();                     // 유리 계기판 모양도 새 크기에 맞게
    if (flashSvg) buildTurnFlash();   // 번쩍 테두리도 새 크기에 맞게
  }

  function init() {
    buildWorld();
    buildDashboard();
    measureCamera();
    focusOnSub(C.cameraOn);
    fitScaleLabels();
    buildFrame();
    // 글꼴이 늦게 와서 부품 폭이 바뀌어도 유리판 모양이 맞게 한 번 더 (D2)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { buildFrame(); if (flashSvg) buildTurnFlash(); });
    enablePanning();
    // 첫 차례 연출(번쩍·화살표·카메라)은 turn.js 가 함 (14차)

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 300); });

    // 폰에서 누르는 순간 버튼 모양이 바뀌게 (아이폰은 이게 있어야 :active가 작동)
    document.addEventListener('touchstart', function () {}, { passive: true });
    // 두 손가락 확대·길게 누르기 메뉴 막기
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // 다음 단계에서 쓸 기능을 밖에서 부를 수 있게 열어 둠
  window.Game = {
    rs: rs, submit: submit, onResult: onResult,
    mySubId: mySubId, isMyTurn: isMyTurn, canAct: canAct, canFire: canFire, matchNow: matchNow, restart: restart, onRestart: onRestart, markActive: markActive,
    cam: cam, state: state, getSub: getSub,
    applyCamera: applyCamera, focusOn: focusOn, focusOnSub: focusOnSub, playTurnStart: playTurnStart, setClock: setClock,
    setMoveGauge: setMoveGauge, placeSub: placeSub, showFacing: showFacing,
    copyPoints: copyPoints, defaultPoints: defaultPoints, padFx: padFx, u2p: u2p, unitsToWorld: unitsToWorld, padCurveY: padCurveY, curveSpline: curveSpline, setSubHp: setSubHp, setCurrent: setCurrent, selectItem: selectItem, drawPadCurve: drawPadCurve, setFireGauge: setFireGauge, gaugeToDistance: gaugeToDistance,
    setDelayNum: setDelayNum, fmtDelay: fmtDelay, setPadDist: setPadDist
  };

  init();
})();
