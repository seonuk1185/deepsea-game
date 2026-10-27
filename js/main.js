/* =========================================================
   심해 포격전(가칭) — 게임 화면 (5단계 1번: 움직이지 않는 화면)
   하는 일: 설정값(config.js)대로 화면을 그림 + 카메라 + 바다 끌어서 둘러보기
   아직 없는 것: 이동·조준·발사·턴 진행 (다음 단계)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

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
    C.subs.forEach(function (s) {
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
  var cam = { x: 0, y: 0, zoom: 1, viewW: 0, viewH: 0 };

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
    var s = C.subs.filter(function (v) { return v.id === id; })[0];
    if (s) focusOn(s.x, s.y);
  }

  /* ---------- 바다를 손가락으로 끌면 화면이 움직임 (둘러보기만) ---------- */
  function enablePanning() {
    var drag = null;
    seaView.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      seaView.setPointerCapture(e.pointerId);
      seaView.classList.add('dragging');
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
    $('delayNum').textContent = C.delay;
    $('mapName').textContent = C.mapName;

    // 아이템 4칸
    $('items').innerHTML = C.items.map(function (it) {
      if (!it.type) return '<button class="slot" aria-label="빈 칸"></button>';
      return '<button class="slot full' + (it.selected ? ' sel' : '') + '" aria-label="' + ITEM_NAMES[it.type] + '">' +
        ITEM_ICONS[it.type] + '<i>' + it.count + '</i></button>';
    }).join('');

    // 조류: 화살표 방향 + 세기 막대
    $('flowArrow').style.transform = 'rotate(' + C.current.dir + 'deg)';
    $('flowBar').style.width = Math.round(C.current.strength * 100) + '%';

    // 이동 / 에너지
    var mv = $('moveBar');
    mv.style.width = 'calc((100% - 6px) * ' + C.move + ')';
    mv.classList.toggle('low', C.move <= 0.2);
    $('energyBar').style.width = 'calc((100% - 6px) * ' + C.energy / 100 + ')';
    $('energyNum').textContent = C.energy;

    // 내 잠수함 얼굴 창
    var me = C.subs.filter(function (s) { return s.side === 'me'; })[0];
    $('faceWin').innerHTML = subSvg(me ? me.color : 'yellow', false);
    $('faceName').textContent = C.character.name;

    buildPad(me ? me.facing : 'right');
  }

  /* ---------- 궤도 판 ----------
     잠수함이 오른쪽을 보면 왼쪽→오른쪽, 왼쪽을 보면 판 전체가 좌우 반전 */
  function buildPad(facing) {
    var L = facing === 'left';
    var fx = function (x) { return L ? 100 - x : x; };   // 가로 위치 뒤집기
    var ch = C.character, P = C.pad, h = '';

    // 곡선(임시 모양): 잠수함 쪽 끝 가운데에서 출발, 조절점보다 조금 더 크게 휨 → 한계선 밖으로 나갈 수 있음
    var amp = function (y) { return 50 + (y - 50) * P.curveGain; };
    var pts = [[0, 50]];
    P.points.forEach(function (p) { pts.push([p[0], amp(p[1])]); });
    var last = pts[pts.length - 1];
    pts.push([100, 50 + (last[1] - 50) * 0.4]);
    h += '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="' +
      smoothPath(pts.map(function (p) { return [fx(p[0]), p[1]]; })) +
      '" fill="none" stroke="#58F07A" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>';

    // 거리 게이지 (가운데 주황 막대): 잠수함 쪽 끝에 붙어서 시작, 거리 한계선까지만
    var fill = (P.distFill * 100).toFixed(1) + '%';
    var gStyle = L ? 'right:0;left:' + (100 - ch.maxDist) + '%' : 'left:0;right:' + (100 - ch.maxDist) + '%';
    var iStyle = L ? 'right:1px;width:calc((100% - 2px) * ' + P.distFill + ')' : 'left:1px;width:calc((100% - 2px) * ' + P.distFill + ')';
    var bStyle = 'left:' + (L ? 'calc(100% - ' + fill + ')' : fill);
    h += '<div class="fgauge' + (L ? ' rtl' : '') + '" style="' + gStyle + '" aria-hidden="true"><i style="' + iStyle + '"></i><b style="' + bStyle + '"></b></div>';

    // 한계선: 위·아래 = 발사 각도, 세로 = 최대 거리. 바깥은 어둡게. (조절점에만 적용)
    h += '<span class="limzone" style="left:0;right:0;top:0;height:' + ch.angleTop + '%"></span>';
    h += '<span class="limzone" style="left:0;right:0;top:' + ch.angleBottom + '%;bottom:0"></span>';
    h += L ? '<span class="limzone" style="left:0;width:' + (100 - ch.maxDist) + '%;top:0;bottom:0"></span>'
           : '<span class="limzone" style="left:' + ch.maxDist + '%;right:0;top:0;bottom:0"></span>';
    h += '<span class="lim" style="top:' + ch.angleTop + '%"></span>';
    h += '<span class="lim" style="top:' + ch.angleBottom + '%"></span>';
    h += '<span class="limv" style="left:' + fx(ch.maxDist) + '%"></span>';
    h += '<span class="limtag" style="' + (L ? 'right:6px' : 'left:6px') + '">' + ch.name + ' 한계</span>';

    // 조절점 3개
    P.points.forEach(function (p) {
      h += '<span class="cp" style="left:' + fx(p[0]) + '%;top:' + p[1] + '%"></span>';
    });
    $('padScreen').innerHTML = h;

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

  // 판이 좁으면 눈금 숫자를 하나 걸러 보여 줌 (글자 겹침 방지)
  function fitScaleLabels() {
    var el = $('padScale');
    var tight = el.clientWidth / C.pad.scale.count < 24;
    Array.prototype.forEach.call(el.querySelectorAll('.num'), function (n) {
      n.style.visibility = (tight && n.getAttribute('data-i') % 2 === 1) ? 'hidden' : '';
    });
  }

  // 점들을 부드럽게 잇는 곡선 (캣멀롬 → 베지어)
  function smoothPath(p) {
    var d = 'M' + p[0][0] + ' ' + p[0][1];
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) +
           ',' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) +
           ',' + p2[0] + ' ' + p2[1];
    }
    return d;
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
  window.Game = { cam: cam, focusOn: focusOn, focusOnSub: focusOnSub, playTurnStart: playTurnStart };

  init();
})();
