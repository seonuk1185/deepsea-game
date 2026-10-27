/* =========================================================
   심해 포격전(가칭) — 게임 화면
   하는 일: 설정값(config.js)대로 화면을 그림 + 카메라 + 바다 끌어서 둘러보기
   잠수함 이동(조이스틱)은 move.js 가 맡음
   궤도 판 점 끌기는 pad.js, 발사 꾹 누르기(거리 정하기)는 fire.js
   아직 없는 것: 어뢰 날아가기·턴 진행 (다음 단계)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 지금 게임 상태 (설정값을 복사해서 시작, 게임 중에 바뀜) ---------- */
  var state = {
    subs: C.subs.map(function (s) { var o = {}; for (var k in s) o[k] = s[k]; return o; }),
    move: C.movement.gaugeStart,     // 이동 게이지 (0~1)
    // 궤도 판: 조절점 3개 [가로%, 세로%] (캐릭터 기본 모양에서 시작) + 거리 게이지 찬 정도 (0~1)
    //         + sel = ▲▼ 미세조정으로 움직일 「골라 둔 점」 번호 (0~2, 처음엔 가운데)
    pad: { points: defaultPoints(), fill: 0, facing: 'right', sel: C.pad.defaultSelected || 0 }
  };
  function copyPoints(list) { return list.map(function (p) { return [p[0], p[1]]; }); }
  // 캐릭터 기본 점 모양 (설정값이 노란 상자 밖이면 상자 안으로 넣어서)
  function defaultPoints() {
    var lim = C.character.limit;
    return C.character.padPoints.map(function (p) {
      return [clamp(p[0], lim.left, lim.right), clamp(p[1], lim.top, lim.bottom)];
    });
  }
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function getSub(id) { return state.subs.filter(function (v) { return v.id === id; })[0]; }

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

    // 잠수함 + 머리 위 이름·체력바 (+ 차례 화살표)
    state.subs.forEach(function (s) {
      var active = s.id === C.activeSubId;
      html += '<div class="sub ' + s.side + ' face-' + s.facing + '" id="sub-' + s.id + '" style="left:' + s.x + 'px;top:' + s.y + 'px">' +
        '<div class="tag">' +
          (active ? '<div class="turnarrow" aria-label="차례"></div>' : '') +
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
  var cam = { x: 0, y: 0, zoom: 1, viewW: 0, viewH: 0, follow: false, panning: false };

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
    $('timerNum').textContent = C.timer;
    $('delayNum').textContent = '--';      // 아직 거리를 안 정함 (발사 꾹 누르고 떼면 숫자가 들어감)
    $('mapName').textContent = C.mapName;

    // 아이템 4칸
    $('items').innerHTML = C.items.map(function (it) {
      if (!it.type) return '<button class="slot" aria-label="빈 칸"></button>';
      return '<button class="slot full' + (it.selected ? ' sel' : '') + '" aria-label="' + ITEM_NAMES[it.type] + '">' +
        ITEM_ICONS[it.type] + '<i>' + it.count + '</i></button>';
    }).join('');

    setCurrent(C.current.dir, C.current.strength);

    // 이동 / 에너지
    setMoveGauge(state.move);
    $('energyBar').style.width = 'calc((100% - 6px) * ' + C.energy / 100 + ')';
    $('energyNum').textContent = C.energy;

    // 내 잠수함 얼굴 창
    var me = state.subs.filter(function (s) { return s.side === 'me'; })[0];
    $('faceWin').innerHTML = subSvg(me ? me.color : 'yellow', false);
    $('faceName').textContent = C.character.name;

    buildPad(me ? me.facing : 'right');
  }

  /* ---------- 궤도 판 ----------
     잠수함이 오른쪽을 보면 왼쪽→오른쪽, 왼쪽을 보면 판 전체가 좌우 반전
     판 모양(한계선·눈금)을 새로 그리는 건 여기, 점·곡선·게이지만 바꿀 땐 drawPadCurve / setFireGauge */
  function padFx(x) { return state.pad.facing === 'left' ? 100 - x : x; }   // 가로 위치 뒤집기

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
    var bx0 = Math.min(fx(lim.left), fx(lim.right)), bx1 = Math.max(fx(lim.left), fx(lim.right));
    h += box(0, 100, 0, lim.top, 'limzone') + box(0, 100, lim.bottom, 100, 'limzone');
    h += box(0, bx0, lim.top, lim.bottom, 'limzone') + box(bx1, 100, lim.top, lim.bottom, 'limzone');
    // 상자가 판 끝에 딱 붙어 있으면(limit.left = 0) 그쪽 테두리를 판 안쪽으로 들여 그려서 잘리지 않게
    h += box(bx0, bx1, lim.top, lim.bottom, 'limbox' + (bx0 <= 0 ? ' edge-l' : '') + (bx1 >= 100 ? ' edge-r' : ''));
    // (「○○ 한계」 글씨는 형님 지시로 뺌 2026-10-27)

    // 곡선 (파란 선. pad.js 가 점을 끌 때마다 drawPadCurve 로 다시 그림. 판 밖으로 나간 부분은 잘림)
    h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path id="padCurve" d="" ' +
      'fill="none" stroke="#4FB6FF" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';

    // 거리 게이지 (가운데 주황 막대): 잠수함 쪽 끝에 붙어서 시작, 상자 오른쪽 변(최대 거리)까지만
    var gStyle = L ? 'right:0;left:' + (100 - lim.right) + '%' : 'left:0;right:' + (100 - lim.right) + '%';
    h += '<div class="fgauge' + (L ? ' rtl' : '') + '" id="fGauge" style="' + gStyle + '" aria-hidden="true"><i></i><b></b></div>';

    // 점 3개 (작은 × 표시. 위치는 drawPadCurve 가 넣음)
    state.pad.points.forEach(function (p, i) { h += '<span class="cp" data-i="' + i + '"></span>'; });
    $('padScreen').innerHTML = h;
    drawPadCurve();
    setFireGauge(state.pad.fill);

    // 아래 거리 눈금 (9, 12, 15 …) — 잠수함 쪽에서부터
    var S = P.scale, s = '';
    for (var i = 0; i < S.count; i++) {
      var pos = (i + 0.5) / S.count * 100;
      s += '<span class="tick major" style="left:' + fx(pos) + '%"></span>';
      if (i < S.count - 1) s += '<span class="tick" style="left:' + fx(pos + 50 / S.count) + '%"></span>';
      s += '<span class="num" data-i="' + i + '" style="left:' + fx(pos) + '%">' + (S.from + S.step * i) + '</span>';
    }
    $('padScale').innerHTML = s;
  }

  /* ---------- 곡선 계산 ----------
     출발 = 판의 잠수함 쪽 끝, 세로 가운데(= 내 잠수함 높이) → 점1 → 점2 → 점3 을 「정확히」 지나는 부드러운 곡선
     (자연 3차 스플라인: 점마다 꺾이지 않고 매끈하게 이어짐). 점3 뒤로는 그 기울기 그대로 판 끝까지 쭉 이어짐.
     가로 x 는 「잠수함 쪽 끝 = 0」 기준 (왼쪽을 볼 때 뒤집는 건 그릴 때만). 어뢰 날아가기에서도 이 함수를 씀 */
  function curveSpline() {
    var k = [[0, 50]];
    state.pad.points.forEach(function (p) {
      var x = Math.max(p[0], k[k.length - 1][0] + 0.5);       // 가로가 겹치면 계산이 안 되므로 살짝 띄움
      k.push([x, p[1]]);
    });
    var n = k.length - 1, M = [], c = [], d = [], i;
    M[0] = M[n] = 0;                                            // 양 끝은 휘는 정도 0 (자연 스플라인)
    // 가운데 점들의 휘는 정도 구하기 (세 줄짜리 연립방정식)
    c[0] = 0; d[0] = 0;
    for (i = 1; i < n; i++) {
      var h0 = k[i][0] - k[i - 1][0], h1 = k[i + 1][0] - k[i][0];
      var rhs = 6 * ((k[i + 1][1] - k[i][1]) / h1 - (k[i][1] - k[i - 1][1]) / h0);
      var den = 2 * (h0 + h1) - h0 * c[i - 1];
      c[i] = h1 / den;
      d[i] = (rhs - h0 * d[i - 1]) / den;
    }
    for (i = n - 1; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
    return { k: k, M: M };
  }
  function padCurveY(x, sp) {
    sp = sp || curveSpline();
    var k = sp.k, M = sp.M, n = k.length - 1, i = 0;
    var seg = function (i) { return k[i + 1][0] - k[i][0]; };
    if (x >= k[n][0]) {                                         // 점3 뒤: 그 자리 기울기대로 곧게
      var hl = seg(n - 1);
      var slope = (k[n][1] - k[n - 1][1]) / hl + hl * (M[n - 1] + 2 * M[n]) / 6;
      return k[n][1] + slope * (x - k[n][0]);
    }
    while (i < n - 1 && x > k[i + 1][0]) i++;
    var h = seg(i), t = x - k[i][0];
    var b = (k[i + 1][1] - k[i][1]) / h - h * (2 * M[i] + M[i + 1]) / 6;
    return k[i][1] + b * t + M[i] / 2 * t * t + (M[i + 1] - M[i]) / (6 * h) * t * t * t;
  }

  // 점 자리 + 곡선 다시 그리기
  function drawPadCurve() {
    var pts = state.pad.points, sp = curveSpline(), d = '';
    for (var x = 0; x <= 100.001; x += 0.5) {
      var y = Math.min(Math.max(padCurveY(x, sp), -400), 500);  // 판 밖은 어차피 잘려서 안 보임
      d += (x ? ' L' : 'M') + padFx(x).toFixed(2) + ' ' + y.toFixed(2);
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

  // 게이지 찬 정도 → 판 아래 눈금 숫자로 읽은 거리 (눈금 i번 = 판의 (i+0.5)/개수 자리 = from + step×i)
  function gaugeToDistance(v) {
    var S = C.pad.scale, pct = v * C.character.limit.right / 100;        // 판 가로 위치 (0~1, 잠수함 쪽 끝 = 0)
    return S.from + S.step * (pct * S.count - 0.5);
  }

  // 판이 좁으면 눈금 숫자를 하나 걸러 보여 줌 (글자 겹침 방지)
  function fitScaleLabels() {
    var el = $('padScale');
    var tight = el.clientWidth / C.pad.scale.count < 24;
    Array.prototype.forEach.call(el.querySelectorAll('.num'), function (n) {
      n.style.visibility = (tight && n.getAttribute('data-i') % 2 === 1) ? 'hidden' : '';
    });
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
  // 이동 게이지 막대 (0~1). 20% 이하면 노란색
  function setMoveGauge(v) {
    var mv = $('moveBar');
    mv.style.width = 'calc((100% - 6px) * ' + v.toFixed(4) + ')';
    mv.classList.toggle('low', v <= 0.2);
  }
  // 잠수함 그림을 지금 좌표로 옮김 (이름·체력바·화살표는 잠수함에 붙어 있어 같이 움직임)
  function placeSub(id) {
    var s = getSub(id), el = $('sub-' + id);
    if (!s || !el) return;
    el.style.left = s.x.toFixed(2) + 'px';
    el.style.top = s.y.toFixed(2) + 'px';
  }
  // 잠수함이 바라보는 쪽 바꾸기 + 내 잠수함이면 궤도 판도 좌우 반전
  function setFacing(id, facing) {
    var s = getSub(id), el = $('sub-' + id);
    if (!s || s.facing === facing) return;
    s.facing = facing;
    if (el) {
      el.classList.remove('face-left', 'face-right');
      el.classList.add('face-' + facing);
    }
    if (s.side === 'me') { buildPad(facing); fitScaleLabels(); }
  }

  /* ---------- 턴 시작 연출: 계기판 테두리 번쩍 ---------- */
  function playTurnStart() {
    var dash = $('dash');
    dash.classList.remove('turnflash');
    void dash.offsetWidth;            // 애니메이션 다시 시작하게
    dash.classList.add('turnflash');
    setTimeout(function () { dash.classList.remove('turnflash'); }, 1500);
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
  }

  function init() {
    buildWorld();
    buildDashboard();
    measureCamera();
    focusOnSub(C.cameraOn);
    fitScaleLabels();
    enablePanning();
    playTurnStart();

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
    cam: cam, state: state, getSub: getSub,
    applyCamera: applyCamera, focusOn: focusOn, focusOnSub: focusOnSub, playTurnStart: playTurnStart,
    setMoveGauge: setMoveGauge, placeSub: placeSub, setFacing: setFacing,
    copyPoints: copyPoints, defaultPoints: defaultPoints, padFx: padFx, padCurveY: padCurveY, setCurrent: setCurrent, drawPadCurve: drawPadCurve, setFireGauge: setFireGauge, gaugeToDistance: gaugeToDistance
  };

  init();
})();
