/* =========================================================
   심해 포격전(가칭) — 궤도 판 조작: 손가락 세로 칸 3개 (20차) + 마우스 점 끌기 + ▲▼ 한 칸 계산
   1) (20차, 2026-10-31) 손가락(터치·펜): 판을 세로 칸 3개로 나눔 — 핀마다 한 칸.
      칸 경계 = 이웃한 두 핀 가로 자리의 한가운데 (첫 칸은 판 왼쪽 끝부터, 마지막 칸은 판 오른쪽 끝까지).
      핀 가로 자리(padFx)로 매번 계산 → 캐릭터마다 핀 가로가 달라도, 잠수함이 왼쪽을 봐서 판이 뒤집혀도 저절로 맞음
      a. 밀기: 칸 아무 데나 누르고 위·아래로 밀면 그 칸 핀이 「손가락이 간 만큼」 따라 움직임 (손가락이 핀 위에 있을 필요 없음 → 핀이 안 가려짐)
         손가락 config.js pad.colSwipePx(2.5px)마다 핀 1칸(판 높이 1%). 손을 떼고 다시 밀면 이어서 움직임
      b. 톡: 안 밀고 짧게 떼면 한 칸(nudgeStep) — 누른 자리가 「지금 핀 높이보다 위」면 ▲, 「아래」면 ▼
         (핀 높이 ±colDead px 안을 누르면 방향 없음 = 핀만 골라짐)
      c. 꾹: 안 밀고 0.35초(nudgeDelay) 넘게 누르고 있으면 그 방향으로 0.08초(nudgeRepeat)마다 계속 (예전 ▲▼ 버튼과 같은 빠르기)
         꾹 누르다가 밀면 그때부터 밀기로 바뀜
      d. 칸을 만지면 그 핀이 골라짐 (앰버 빛)
      e. 핀 바로 위를 눌러도 똑같이 「밀기」 (따로 「핀 잡기」 없음 — 밀기 비율이 판 높이와 비슷해서 핀을 잡고 끄는 느낌과 거의 같고, 겹치는 규칙이 없음)
      칸을 만지는 동안: 그 칸에 아주 흐린 청록 띠 + 핀 옆 작은 앰버 ▲/▼ (움직일 방향)
      칸마다 손가락 하나씩 → 두 손가락으로 두 핀을 동시에 움직일 수 있음
   2) 마우스(PC): 예전 그대로 — 핀(동그라미) 근처를 잡고 위아래로 끌기 (잡은 점이 골라짐)
   3) 모든 핀 움직임은 state.pad.points 세로 값 + 노란 상자 위·아래 변 안에 가둠(clampY) 한 곳으로만 → 발사 쪽지·심판·온라인 그대로
   4) ↺(다시) 버튼: 점을 캐릭터 기본 모양으로 되돌림 (골라 둔 점은 그대로)
   조이스틱을 누른 채 다른 손가락으로 판을 만져도 됨. 판 위에서 밀어도 바다 화면은 안 움직임
   (12차) 키보드도 같은 한 칸 계산(nudge)을 씀: Ins/Del·Home/End·PgUp/PgDn = 점마다 따로 ▲▼(꾹 누르면 계속, 키보드는 더 빠름), F1 = ↺
          (keys.js 가 Game.padKeys 를 부름)
   (18차의 점마다 ▲▼ 탭과 탭 전용 줄은 20차에 없앰 — 폰에서 누르기 어렵고 아래 탭이 화면 맨 끝이라 잘 안 눌렸음)
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var screen = document.getElementById('padScreen');
  var padMain = screen.parentNode;
  var drag = null;   // 마우스로 끌고 있는 점 { id: 포인터 번호, i: 몇 번째 점, dy: 잡은 자리와 점 가운데 차이(px) }

  // 노란 상자 위·아래 변 안에 가둠
  function clampY(y) {
    var lim = C.character.limit;
    return Math.min(Math.max(y, lim.top), lim.bottom);
  }
  // 점 i 를 세로 y(판 높이 %)로 — 모든 핀 움직임이 지나는 한 곳 (소수 찌꺼기 없이 + 노란 상자 안)
  function setPinY(i, y) {
    var p = G.state.pad.points[i];
    if (!p) return;
    p[1] = clampY(Math.round(y * 1000) / 1000);
    G.drawPadCurve();
  }

  /* ---------- 마우스: 핀 근처를 잡고 끌기 (예전 그대로) ---------- */
  // 마우스 자리에서 가장 가까운 점 찾기 (grabRadius 안에 있을 때만)
  function pickPoint(e, r) {
    var best = -1, bestD = C.pad.grabRadius;
    G.state.pad.points.forEach(function (p, i) {
      var px = r.left + G.padFx(p[0]) / 100 * r.width;
      var py = r.top + p[1] / 100 * r.height;
      var d = Math.sqrt((e.clientX - px) * (e.clientX - px) + (e.clientY - py) * (e.clientY - py));
      if (d <= bestD) { best = i; bestD = d; }
    });
    return best;
  }

  function setHeld(i, on) {
    var el = screen.querySelector('.cp[data-i="' + i + '"]');
    if (el) el.classList.toggle('held', on);
  }

  /* ---------- (20차) 손가락 세로 칸 ---------- */
  // 칸 i 의 왼쪽·오른쪽 끝 (판 %). 화면 왼쪽부터 핀 순서대로 놓고, 이웃 핀과의 한가운데가 경계
  function colBounds(i) {
    var xs = G.state.pad.points.map(function (p) { return G.padFx(p[0]); });
    var x = xs[i], l = 0, r = 100;
    xs.forEach(function (o, j) {
      if (j === i) return;
      if (o < x) l = Math.max(l, (o + x) / 2);
      else if (o > x) r = Math.min(r, (o + x) / 2);
    });
    return [l, r];
  }
  // 손가락 가로 자리(판 %)가 들어 있는 칸 = 가로로 가장 가까운 핀 (= 한가운데 경계로 나눈 것과 같음)
  function colAt(xPct) {
    var best = 0, bestD = Infinity;
    G.state.pad.points.forEach(function (p, i) {
      var d = Math.abs(G.padFx(p[0]) - xPct);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  var touches = {};   // [손가락 번호] = { id, i: 칸(점), y0: 누른 높이, lastY, mode: 'wait'|'hold'|'swipe', dir: 톡·꾹 방향, show: 표시할 방향, t: 타이머 }
  function touchOn(i) {
    for (var k in touches) if (touches[k].i === i) return touches[k];
    return null;
  }

  // 흐린 띠 + ▲/▼ 표시 (칸마다 하나씩, 만질 때만 보임)
  var UP_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l5 7H1z" fill="#ffcf4a"/></svg>';
  var DN_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L1 3h10z" fill="#ffcf4a"/></svg>';
  var bands = [], hints = [];
  G.state.pad.points.forEach(function (p, i) {
    var b = document.createElement('span');
    b.className = 'pcolband'; b.setAttribute('data-i', i); b.setAttribute('aria-hidden', 'true');
    var h = document.createElement('span');
    h.className = 'pchint'; h.setAttribute('data-i', i); h.setAttribute('aria-hidden', 'true');
    padMain.appendChild(b); padMain.appendChild(h);
    bands.push(b); hints.push(h);
  });
  // main.js drawPadCurve 가 그릴 때마다 부름 → 핀이 움직이거나 판이 뒤집혀도 띠·표시가 따라감
  function drawCols() {
    G.state.pad.points.forEach(function (p, i) {
      var t = touchOn(i), b = bands[i], h = hints[i];
      if (!b) return;
      b.classList.toggle('on', !!t);
      h.classList.toggle('on', !!(t && t.show));
      if (!t) return;
      var lr = colBounds(i);
      b.style.left = lr[0] + '%';
      b.style.width = (lr[1] - lr[0]) + '%';
      if (!t.show) return;
      if (h._dir !== t.show) { h.innerHTML = t.show < 0 ? UP_SVG : DN_SVG; h._dir = t.show; }
      h.style.left = G.padFx(p[0]) + '%';
      // 핀(지름 12px) 바로 위·아래 — ▲ 는 핀 위, ▼ 는 핀 아래
      h.style.top = t.show < 0 ? 'calc(' + p[1] + '% - 19px)' : 'calc(' + p[1] + '% + 10px)';
    });
  }
  G.padColsDraw = drawCols;

  function stopTimer(t) { clearTimeout(t.t); clearInterval(t.t); t.t = 0; }

  function touchStart(e) {
    var r = screen.getBoundingClientRect();
    var i = colAt((e.clientX - r.left) / r.width * 100);
    if (touchOn(i)) return;                                    // 칸마다 손가락 하나
    e.preventDefault();
    screen.setPointerCapture(e.pointerId);                     // 손가락이 판 밖(바다)으로 나가도 계속 받음
    var pinY = r.top + G.state.pad.points[i][1] / 100 * r.height;
    var d = e.clientY - pinY;
    var dir = Math.abs(d) <= C.pad.colDead ? 0 : (d < 0 ? -1 : 1);   // 핀보다 위 = ▲(-1), 아래 = ▼(+1)
    var t = { id: e.pointerId, i: i, y0: e.clientY, lastY: e.clientY, mode: 'wait', dir: dir, show: dir, t: 0 };
    touches[e.pointerId] = t;
    t.t = setTimeout(function () {                             // 꾹: 안 밀고 nudgeDelay 넘게 → 그 방향으로 계속
      if (touches[t.id] !== t || t.mode !== 'wait' || !t.dir) return;
      t.mode = 'hold';
      nudge(t.dir, t.i);
      t.t = setInterval(function () { nudge(t.dir, t.i); }, C.pad.nudgeRepeat);
    }, C.pad.nudgeDelay);
    selectPin(i);                                              // 만진 칸 핀 = 골라 둔 점 (앰버 빛). 띠·표시도 여기서 그려짐
  }

  function touchMove(e) {
    var t = touches[e.pointerId];
    if (!t) return;
    if (t.mode !== 'swipe') {
      var moved = e.clientY - t.y0;
      if (Math.abs(moved) <= C.pad.colSlop) return;            // 아직 톡·꾹
      stopTimer(t);
      t.mode = 'swipe';
      t.lastY = t.y0 + (moved < 0 ? -1 : 1) * C.pad.colSlop;    // 흔들림 범위만큼은 빼고 시작 → 밀기 시작할 때 핀이 툭 튀지 않음
    }
    var dy = e.clientY - t.lastY;
    t.lastY = e.clientY;
    if (!dy) return;
    t.show = dy < 0 ? -1 : 1;                                  // 표시 = 지금 미는 방향
    // 손가락이 간 만큼 (colSwipePx px = 1칸). 끝에 닿은 뒤 더 밀어도 쌓이지 않음 → 되돌리면 바로 움직임
    setPinY(t.i, G.state.pad.points[t.i][1] + dy / C.pad.colSwipePx);
  }

  function touchEnd(e) {
    var t = touches[e.pointerId];
    if (!t) return;
    stopTimer(t);
    delete touches[e.pointerId];
    if (e.type === 'pointerup' && t.mode === 'wait' && t.dir) nudge(t.dir, t.i);   // 톡 = 한 칸
    else G.drawPadCurve();                                     // 띠·표시 끄기
  }

  /* ---------- 판에 닿는 포인터: 마우스 = 핀 끌기 / 손가락·펜 = 세로 칸 ---------- */
  screen.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse') { touchStart(e); return; }
    if (drag || e.button !== 0) return;                        // 점은 한 번에 하나만
    var r = screen.getBoundingClientRect();
    var i = pickPoint(e, r);
    if (i < 0) return;                                         // 점 근처가 아니면 아무것도 안 함
    e.preventDefault();
    var py = r.top + G.state.pad.points[i][1] / 100 * r.height;
    drag = { id: e.pointerId, i: i, dy: e.clientY - py };      // 잡은 자리 차이를 기억 → 톡 누르기만 하면 점이 안 움직임
    screen.setPointerCapture(e.pointerId);
    selectPin(i);                                              // 누른 점 = 골라 둔 점
    setHeld(i, true);
  });

  screen.addEventListener('pointermove', function (e) {
    if (touches[e.pointerId]) { touchMove(e); return; }
    if (!drag || e.pointerId !== drag.id) return;
    var r = screen.getBoundingClientRect();
    setPinY(drag.i, (e.clientY - drag.dy - r.top) / r.height * 100);
    setHeld(drag.i, true);                                     // 잠수함이 돌아봐서 판을 새로 그렸어도 잡은 표시 유지
  });

  function release(e) {
    if (touches[e.pointerId]) { touchEnd(e); return; }
    if (!drag || e.pointerId !== drag.id) return;
    setHeld(drag.i, false);
    drag = null;
  }
  screen.addEventListener('pointerup', release);
  screen.addEventListener('pointercancel', release);
  screen.addEventListener('lostpointercapture', release);

  // 점 고르기 (판을 만지거나, 키보드 1·2·3)
  function selectPin(i) {
    if (!G.state.pad.points[i]) return;
    G.state.pad.sel = i;
    G.drawPadCurve();
  }

  /* ---------- ▲▼ 한 칸: 톡·꾹·키보드가 같이 씀 ---------- */
  // dir = -1 (▲ 위로) / +1 (▼ 아래로). 화면 위쪽이 세로 0% 라서 위로 = 숫자 작아짐
  //   i = 몇 번째 점 (안 주면 골라 둔 점 — 키보드 예비 키)
  function nudge(dir, i) {
    if (i === undefined) i = G.state.pad.sel;
    var p = G.state.pad.points[i];
    if (!p) return;
    setPinY(i, p[1] + dir * C.pad.nudgeStep);
  }

  // 키보드 예비 키(고른 점 ▲▼ — config.js keys nudgeUp·nudgeDown) 「꾹 누르기」 담당. start(누른 것) / stop(누른 것)
  function setupNudge(dir) {
    var hold = null;   // { id: 누른 것, t: 타이머 }
    function start(id) {
      if (hold) return false;
      hold = { id: id, t: 0 };
      nudge(dir);                                                     // 누르는 순간 한 칸
      hold.t = setTimeout(function () {                               // 꾹 누르고 있으면 계속
        if (!hold) return;
        hold.t = setInterval(function () { nudge(dir); }, C.pad.nudgeRepeat);
      }, C.pad.nudgeDelay);
      return true;
    }
    function stop(id) {
      if (!hold || hold.id !== id) return;
      clearTimeout(hold.t); clearInterval(hold.t);
      hold = null;
    }
    return { start: start, stop: stop };
  }
  var nudgeUp = setupNudge(-1);
  var nudgeDown = setupNudge(1);

  /* ---------- (12차 보강) PC 점 키: 점마다 따로 꾹 누르기 ----------
     Insert·Home·PageUp / Delete·End·PageDown 은 「그 점」을 바로 움직임 (골라 둔 점이 아니라)
     → 점마다 꾹 누르기 담당이 따로 있어서, 점1 ▲ 와 점3 ▼ 를 같이 누르면 둘 다 동시에 움직이고, 하나를 떼도 다른 하나는 계속
     빠르기는 키보드 전용 값(config.js pad.keyRepeatDelay·keyRepeatEvery). 한 번 누를 때 한 칸(nudgeStep)은 톡과 같음 */
  var pinHolds = [];   // [몇 번째 점] = { dir: -1/+1, t: 타이머 }
  // first = true 면 누르는 순간 한 칸 움직이고 시작, false 면 한 칸 없이 기다렸다가 계속 (같은 점 반대 키를 뗐을 때 남은 쪽 이어가기용)
  function pinHoldStart(i, dir, first) {
    if (!G.state.pad.points[i]) return;
    pinHoldStop(i);
    var h = { dir: dir, t: 0 };
    pinHolds[i] = h;
    if (first !== false) nudge(dir, i);
    h.t = setTimeout(function () {
      if (pinHolds[i] !== h) return;
      h.t = setInterval(function () { nudge(dir, i); }, C.pad.keyRepeatEvery);
    }, C.pad.keyRepeatDelay);
  }
  function pinHoldStop(i) {
    var h = pinHolds[i];
    if (!h) return;
    clearTimeout(h.t); clearInterval(h.t);
    pinHolds[i] = null;
  }
  function pinHoldStopAll() {
    for (var i = 0; i < pinHolds.length; i++) pinHoldStop(i);
  }

  /* ---------- ↺ 다시: 캐릭터 기본 모양으로 ---------- */
  function resetPins() {
    G.state.pad.points = G.defaultPoints();
    if (drag) { drag = null; }
    G.drawPadCurve();
  }
  document.getElementById('btnPadReset').addEventListener('click', resetPins);

  // 키보드(keys.js)가 쓰는 것 — 톡·꾹과 똑같은 한 칸 계산
  //   pinStart(점, 방향, 첫칸?) / pinStop(점) / pinStopAll() = 점마다 따로 꾹 누르기 (점 키 전용)
  G.padKeys = { select: selectPin, up: nudgeUp, down: nudgeDown, reset: resetPins,
                pinStart: pinHoldStart, pinStop: pinHoldStop, pinStopAll: pinHoldStopAll };
})();
