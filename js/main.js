/* =========================================================
   심해 포격전(가칭) — 게임 화면
   하는 일: 설정값(config.js)대로 화면을 그림 + 카메라 + 바다 끌어서 둘러보기
           + 「주문서 창구」 Game.submit — 모든 행동 쪽지를 받아 심판(rules.js)에게 넘기고, 결과대로 화면을 바꿈
   진짜 게임 상태(잠수함 자리·체력·조류·차례)는 심판(rules.js)이 들고 있음. 이 파일은 그걸 「보여 주기」만 함
   잠수함 이동(조이스틱)은 move.js 가 맡음
   궤도 판 점 끌기는 pad.js, 발사 꾹 누르기(거리 정하기)는 fire.js, 어뢰 재생(날아가기·폭발·데미지 숫자)은 torpedo.js
   (14차) 차례 진행(20초 시계·상대 차례·판 끝)은 turn.js, 미니맵은 minimap.js. 여기는 「내 차례인가」 도우미 + 다시 하기(restart)
   아직 없는 것: 컴퓨터 상대 (다음 단계 ③ — 지금은 상대가 2초 뒤 턴만 넘김)
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

  /* ---------- 잠수함 임시 그림 (색만 다름) ---------- */
  var SUB_COLORS = {
    yellow: { tower: '#E0A800', hull: '#FFC21A', line: '#7A5500', glass: '#BDEBFF' },
    red:    { tower: '#C23B44', hull: '#E5545D', line: '#5E1016', glass: '#FFD9DB' }
  };
  function subSvg(color, withTail) {
    var k = SUB_COLORS[color] || SUB_COLORS.yellow;
    return '<svg viewBox="0 0 76 44" aria-hidden="true">' +
      '<rect x="30" y="2" width="16" height="14" rx="4" fill="' + k.tower + '"/>' +
      '<ellipse cx="38" cy="26" rx="30" ry="14" fill="' + k.hull + '" stroke="' + k.line + '" stroke-width="2"/>' +
      '<circle cx="50" cy="25" r="6" fill="' + k.glass + '" stroke="' + k.line + '" stroke-width="2"/>' +
      (withTail ? '<path d="M8 26 L0 18 L0 34 Z" fill="' + k.tower + '"/>' : '') +
      '</svg>';
  }

  /* ---------- 아이템 아이콘 ---------- */
  var ITEM_ICONS = {
    double: '<svg viewBox="0 0 26 26"><g fill="#1A0A00"><rect x="3" y="6" width="16" height="5" rx="2.5"/><path d="M19 6l5 2.5-5 2.5z"/><rect x="3" y="15" width="16" height="5" rx="2.5"/><path d="M19 15l5 2.5-5 2.5z"/></g></svg>',
    shield: '<svg viewBox="0 0 26 26"><path d="M13 3l8 3v6c0 5-3.5 8.5-8 10.5C8.5 20.5 5 17 5 12V6z" fill="#1A0A00"/></svg>',
    move:   '<svg viewBox="0 0 26 26"><g fill="none" stroke="#1A0A00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h18M8 9l-4 4 4 4M18 9l4 4-4 4"/></g></svg>'
  };
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
      html += '<div class="crate" style="left:' + c.x + 'px;top:' + c.y + 'px">?</div>';
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
        '<div class="body">' + subSvg(s.color, true) + '</div>' +
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
    $('delayNum').textContent = '--';      // 아직 거리를 안 정함 (발사 꾹 누르고 떼면 숫자가 들어감)
    $('mapName').textContent = C.mapName;

    // 아이템 4칸 (계기판 시간·DELAY 칸 바로 위 가로 한 줄)
    $('items').innerHTML = C.items.map(function (it, i) {
      if (!it.type) return '<button class="slot" data-i="' + i + '" aria-label="빈 칸"></button>';
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

    $('faceWin').innerHTML = subSvg(me ? me.color : 'yellow', false);
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

    // 곡선 (파란 선. pad.js 가 점을 끌 때마다 drawPadCurve 로 다시 그림. 판 밖으로 나간 부분은 잘림)
    h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path id="padCurve" d="" ' +
      'fill="none" stroke="#4FB6FF" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';

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
  }

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
    var path = $('padCurve');
    if (path) path.setAttribute('d', d);
    Array.prototype.forEach.call($('padScreen').querySelectorAll('.cp'), function (el) {
      var p = pts[+el.getAttribute('data-i')];
      el.style.left = padFx(p[0]) + '%';
      el.style.top = p[1] + '%';
      el.classList.toggle('sel', +el.getAttribute('data-i') === state.pad.sel);   // 골라 둔 점 = 노란 빛 테두리
    });
    var tag = $('nudgeTag');                                     // ▲▼ 사이 작은 글씨 「핀2」 (조준핀 = 궤도 점)
    if (tag) tag.textContent = '핀' + (state.pad.sel + 1);
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
  // 이동 게이지 (0~1): 세로 통 아래에서 위로 참 (통 안쪽 여백 3px씩 빼고). 20% 이하면 노란색
  function setMoveGauge(v) {
    var mv = $('moveBar');
    mv.style.height = 'calc((100% - 6px) * ' + v.toFixed(4) + ')';
    mv.classList.toggle('low', v <= 0.2);
  }
  // 에너지 게이지 (0~100): 세로 통 높이 + 위 숫자
  function setEnergyGauge(hp) {
    $('energyBar').style.height = 'calc((100% - 6px) * ' + (hp / 100).toFixed(4) + ')';
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
  // (14차) 차례가 바뀜 (턴 넘기기·시간 끝) → 새 차례 잠수함 머리 위 화살표 + 조류(새로 굴린 값) + 거리 게이지·DELAY 처음으로
  //   + 내 이동 게이지 (심판이 새 차례 잠수함 게이지를 가득 채움). 카메라·번쩍·「상대 차례」 표시는 turn.js
  function onTurnChange(res) {
    markActive(res.activeId);
    setCurrent(rs.current.dir, rs.current.strength);
    var me = getSub(mySubId);
    if (me) setMoveGauge(me.move);
    setFireGauge(0);                                            // 지난 턴에 쏜 거리 게이지 비우기
    state.shot = null;
    $('delayNum').textContent = '--';
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

  /* ---------- 턴 시작 연출: 계기판 테두리 번쩍 ----------
     (12차) 계기판은 가운데(궤도 판 칸)만 위로 솟은 모양이라, 예전처럼 네모 테두리를 번쩍이면
     솟은 칸 위로 옛날 평평한 줄이 지나가고 솟은 칸 옆·위는 안 번쩍였음 → 실제 모양대로 선을 그려서 번쩍이게 함
       노란 선 = 양옆 낮은 칸 윗변 → 솟은 칸 왼쪽 옆 → 둥근 윗변 → 오른쪽 옆 → 낮은 칸 윗변
       안쪽 노란 빛 = 같은 모양 안쪽으로만 번짐 (바깥 바다 쪽으로는 안 번짐)
     솟은 칸 금속판(.pad::before) 자리는 style.css 와 같은 숫자로 계산: 판 칸 양옆 6px 바깥, 맨 위 = 계기판 위 - 솟은 높이, 위 모서리 둥글기 14px */
  var flashSvg = null;
  function buildTurnFlash() {
    var dash = $('dash'), pad = dash.querySelector('.pad');
    if (!flashSvg) {
      flashSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      flashSvg.setAttribute('class', 'turnflash-svg');
      flashSvg.setAttribute('aria-hidden', 'true');
      flashSvg.innerHTML =
        '<defs><clipPath id="tfClip"><path id="tfShape"/></clipPath>' +
        '<filter id="tfBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
        '<g clip-path="url(#tfClip)"><path id="tfGlow" fill="none" stroke="rgba(255,210,63,.8)" stroke-width="16" filter="url(#tfBlur)"/></g>' +
        '<path id="tfLine" fill="none" stroke="#FFD23F" stroke-width="3" stroke-linejoin="round"/>';
      dash.appendChild(flashSvg);
    }
    var d = dash.getBoundingClientRect(), p = pad.getBoundingClientRect();
    var ox = d.left + dash.clientLeft, oy = d.top + dash.clientTop;    // 계기판 안쪽 왼쪽 위 = (0, 0)
    var W = dash.clientWidth, H = dash.clientHeight;
    var low = -dash.clientTop + 1.5;                                    // 낮은 칸 윗변 (밝은 테두리 줄 위에 겹침)
    var top = p.top - 7 - oy + 1.5;                                     // 솟은 칸 윗변
    var xa = p.left - 6 - ox + 1.5, xb = p.right + 6 - ox - 1.5;        // 솟은 칸 왼쪽·오른쪽 옆
    var r = 12.5;                                                       // 둥근 모서리 (14 - 선 굵기 절반)
    var f = function (v) { return v.toFixed(1); };
    var outline = 'M0 ' + f(low) + ' L' + f(xa) + ' ' + f(low) + ' L' + f(xa) + ' ' + f(top + r) +
      ' A' + r + ' ' + r + ' 0 0 1 ' + f(xa + r) + ' ' + f(top) + ' L' + f(xb - r) + ' ' + f(top) +
      ' A' + r + ' ' + r + ' 0 0 1 ' + f(xb) + ' ' + f(top + r) + ' L' + f(xb) + ' ' + f(low) + ' L' + f(W) + ' ' + f(low);
    var shape = outline + ' L' + f(W) + ' ' + f(H) + ' L0 ' + f(H) + ' Z';   // 계기판 전체 모양 (빛이 안쪽으로만 번지게 자르는 틀)
    flashSvg.querySelector('#tfLine').setAttribute('d', outline);
    flashSvg.querySelector('#tfShape').setAttribute('d', shape);
    flashSvg.querySelector('#tfGlow').setAttribute('d', shape);        // 빛은 둘레 전체(옛날처럼 네 변 안쪽) — 모양만 새것
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
    $('delayNum').textContent = '--';
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
    if (flashSvg) buildTurnFlash();   // 번쩍 테두리도 새 크기에 맞게
  }

  function init() {
    buildWorld();
    buildDashboard();
    measureCamera();
    focusOnSub(C.cameraOn);
    fitScaleLabels();
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
    applyCamera: applyCamera, focusOn: focusOn, focusOnSub: focusOnSub, playTurnStart: playTurnStart,
    setMoveGauge: setMoveGauge, placeSub: placeSub, showFacing: showFacing,
    copyPoints: copyPoints, defaultPoints: defaultPoints, padFx: padFx, u2p: u2p, unitsToWorld: unitsToWorld, padCurveY: padCurveY, curveSpline: curveSpline, setSubHp: setSubHp, setCurrent: setCurrent, selectItem: selectItem, drawPadCurve: drawPadCurve, setFireGauge: setFireGauge, gaugeToDistance: gaugeToDistance
  };

  init();
})();
