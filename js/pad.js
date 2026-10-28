/* =========================================================
   심해 포격전(가칭) — 궤도 판 점 끌기 + ▲▼ 미세조정
   1) 점 3개를 손가락으로 잡고 위아래로 끌면 점이 따라오고 곡선이 바로 다시 그려짐
      (가로 자리는 캐릭터마다 고정, 세로는 노란 상자 위·아래 변 안에서만.
       곡선은 점 3개를 정확히 지나고, 상자 밖으로 나갈 수 있음)
   2) 점을 누르면(끌기 시작해도) 그 점이 「골라짐」 → 노랗게 빛남. 처음엔 가운데 점(점2)
   3) 판 오른쪽 옆 ▲ / ▼ : 골라 둔 점을 한 번에 딱 한 칸(config.js pad.nudgeStep)씩 위·아래로.
      꾹 누르고 있으면 0.35초 뒤부터 0.08초마다 계속 움직임. 노란 상자 위·아래 변에서 멈춤
   4) ↺(다시) 버튼: 점을 캐릭터 기본 모양으로 되돌림 (골라 둔 점은 그대로)
   조이스틱을 누른 채 다른 손가락으로 점을 끌어도 됨. 판 위에서 끌어도 바다 화면은 안 움직임
   (12차) 키보드도 같은 한 칸 계산(nudge)을 씀: Ins/Del·Home/End·PgUp/PgDn = 점마다 따로 ▲▼(꾹 누르면 계속, 키보드는 더 빠름), F1 = ↺
          (keys.js 가 Game.padKeys 를 부름)
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var screen = document.getElementById('padScreen');
  var drag = null;   // 지금 끌고 있는 점 { id: 손가락 번호, i: 몇 번째 점, dy: 잡은 자리와 점 가운데 차이(px) }

  // 노란 상자 위·아래 변 안에 가둠
  function clampY(y) {
    var lim = C.character.limit;
    return Math.min(Math.max(y, lim.top), lim.bottom);
  }

  // 손가락 자리에서 가장 가까운 점 찾기 (손가락 범위 grabRadius 안에 있을 때만)
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

  screen.addEventListener('pointerdown', function (e) {
    if (drag) return;                                          // 점은 한 번에 하나만
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var r = screen.getBoundingClientRect();
    var i = pickPoint(e, r);
    if (i < 0) return;                                         // 점 근처가 아니면 아무것도 안 함
    e.preventDefault();
    var py = r.top + G.state.pad.points[i][1] / 100 * r.height;
    drag = { id: e.pointerId, i: i, dy: e.clientY - py };      // 잡은 자리 차이를 기억 → 톡 누르기만 하면 점이 안 움직임
    screen.setPointerCapture(e.pointerId);                     // 손가락이 판 밖으로 나가도 계속 받음
    selectPin(i);                                              // 누른 점 = 골라 둔 점 (▲▼ 대상)
    setHeld(i, true);
  });

  screen.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var r = screen.getBoundingClientRect();
    var y = (e.clientY - drag.dy - r.top) / r.height * 100;
    G.state.pad.points[drag.i][1] = clampY(y);
    G.drawPadCurve();
    setHeld(drag.i, true);                                     // 잠수함이 돌아봐서 판을 새로 그렸어도 잡은 표시 유지
  });

  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    setHeld(drag.i, false);
    drag = null;
  }
  screen.addEventListener('pointerup', release);
  screen.addEventListener('pointercancel', release);
  screen.addEventListener('lostpointercapture', release);

  // 점 고르기 (판에서 점을 누르거나, 키보드 1·2·3)
  function selectPin(i) {
    if (!G.state.pad.points[i]) return;
    G.state.pad.sel = i;
    G.drawPadCurve();
  }

  /* ---------- ▲▼ 미세조정: 골라 둔 점을 한 칸씩 ---------- */
  // dir = -1 (▲ 위로) / +1 (▼ 아래로). 화면 위쪽이 세로 0% 라서 위로 = 숫자 작아짐
  //   i = 몇 번째 점 (안 주면 골라 둔 점 — ▲▼ 버튼)
  function nudge(dir, i) {
    var p = G.state.pad.points[i === undefined ? G.state.pad.sel : i];
    if (!p) return;
    var y = Math.round((p[1] + dir * C.pad.nudgeStep) * 1000) / 1000;   // 소수 찌꺼기 없이 딱 한 칸
    p[1] = clampY(y);
    G.drawPadCurve();
  }

  // ▲ 또는 ▼ 하나 = 「꾹 누르기」 담당 하나. start(누른 것) / stop(누른 것) 은 버튼(손가락·마우스)과 키보드(Q·E)가 같이 씀
  //   누른 것 = 손가락 번호, 키보드는 'key'
  function setupNudge(btn, dir) {
    var hold = null;   // { id: 누른 것, t: 타이머 }
    function start(id) {
      if (hold) return false;
      btn.classList.add('held');                                      // 키로 눌러도 버튼이 눌린 모양
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
      btn.classList.remove('held');
    }
    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (start(e.pointerId)) btn.setPointerCapture(e.pointerId);
    });
    function stopPointer(e) { stop(e.pointerId); }
    btn.addEventListener('pointerup', stopPointer);
    btn.addEventListener('pointercancel', stopPointer);
    btn.addEventListener('lostpointercapture', stopPointer);
    return { start: start, stop: stop };
  }
  var nudgeUp = setupNudge(document.getElementById('btnNudgeUp'), -1);
  var nudgeDown = setupNudge(document.getElementById('btnNudgeDown'), 1);

  /* ---------- (12차 보강) PC 점 키: 점마다 따로 꾹 누르기 ----------
     Insert·Home·PageUp / Delete·End·PageDown 은 「그 점」을 바로 움직임 (골라 둔 점이 아니라)
     → 점마다 꾹 누르기 담당이 따로 있어서, 점1 ▲ 와 점3 ▼ 를 같이 누르면 둘 다 동시에 움직이고, 하나를 떼도 다른 하나는 계속
     빠르기는 키보드 전용 값(config.js pad.keyRepeatDelay·keyRepeatEvery). 한 번 누를 때 한 칸(nudgeStep)은 버튼과 같음
     폰 ▲▼ 버튼은 위 setupNudge 그대로 (골라 둔 점, 0.35초 뒤 0.08초마다) */
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

  // 키보드(keys.js)가 쓰는 것 — 화면 버튼과 똑같은 코드
  //   pinStart(점, 방향, 첫칸?) / pinStop(점) / pinStopAll() = 점마다 따로 꾹 누르기 (점 키 전용)
  G.padKeys = { select: selectPin, up: nudgeUp, down: nudgeDown, reset: resetPins,
                pinStart: pinHoldStart, pinStop: pinHoldStop, pinStopAll: pinHoldStopAll };
})();
