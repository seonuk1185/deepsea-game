/* =========================================================
   심해 포격전(가칭) — 조이스틱으로 내 잠수함 움직이기
   1) 조이스틱: 손잡이를 잡고 끌면 손가락을 따라감(동그라미 안까지만), 놓으면 가운데로 돌아감
   2) 이동: 미는 방향·세기대로 잠수함이 움직이고, 간 거리만큼 이동 게이지가 줄어듦
   3) 카메라: 잠수함이 움직이면 화면이 부드럽게 따라감 (바다를 손으로 밀면 잠깐 멈춤)
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var M = C.movement;
  var joyEl = document.getElementById('joy');
  var knob = joyEl.querySelector('i');

  /* =========================================================
     1. 조이스틱
        stick.x, stick.y = 미는 방향과 세기 (-1 ~ 1). 가운데 = 0, 0
     ========================================================= */
  var stick = { id: null, x: 0, y: 0, cx: 0, cy: 0, maxR: 1 };

  function stickMove(e) {
    var dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > stick.maxR) { dx *= stick.maxR / d; dy *= stick.maxR / d; }   // 동그라미 밖으로 못 나감
    knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    stick.x = dx / stick.maxR;
    stick.y = dy / stick.maxR;
  }

  joyEl.addEventListener('pointerdown', function (e) {
    if (stick.id !== null) return;                            // 조이스틱은 한 손가락만
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    var r = joyEl.getBoundingClientRect();
    stick.id = e.pointerId;
    stick.cx = r.left + r.width / 2;
    stick.cy = r.top + r.height / 2;
    stick.maxR = r.width / 2 * C.joystick.knobTravel;
    joyEl.setPointerCapture(e.pointerId);                     // 손가락이 동그라미 밖으로 나가도 계속 받음
    joyEl.classList.add('held');
    G.cam.follow = true;                                      // 조이스틱을 잡으면 카메라가 다시 따라감
    stickMove(e);
  });
  joyEl.addEventListener('pointermove', function (e) {
    if (e.pointerId === stick.id) stickMove(e);
  });
  function stickRelease(e) {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.x = stick.y = 0;
    knob.style.transform = '';                                // 가운데로 스르륵 (style.css 의 transition)
    joyEl.classList.remove('held');
  }
  joyEl.addEventListener('pointerup', stickRelease);
  joyEl.addEventListener('pointercancel', stickRelease);
  joyEl.addEventListener('lostpointercapture', stickRelease);

  /* =========================================================
     2. 이동 — 매 화면(1초에 약 60번)마다 조금씩
     ========================================================= */
  var meId = C.activeSubId;

  // 조이스틱 값 → 실제로 쓸 방향·세기 (가운데 조금은 무시하고, 그 바깥을 0~1로 다시 펼침)
  function readStick() {
    var len = Math.sqrt(stick.x * stick.x + stick.y * stick.y);
    if (len <= M.deadZone) return { x: 0, y: 0, power: 0 };
    var power = Math.min(1, (len - M.deadZone) / (1 - M.deadZone));
    return { x: stick.x / len, y: stick.y / len, power: power };
  }

  function step(dt) {
    var s = G.getSub(meId);
    if (!s) return;
    var st = G.state, inp = readStick();

    if (inp.power > 0 && st.move > 0) {
      // 바라보는 쪽: 좌우로 충분히 밀었을 때만 돌아봄 (거의 위아래로만 밀면 그대로)
      var hx = inp.x * inp.power;
      if (hx > M.faceThreshold) G.setFacing(meId, 'right');
      else if (hx < -M.faceThreshold) G.setFacing(meId, 'left');

      // 갈 거리 (게이지가 남은 만큼까지만)
      var want = M.speed * inp.power * dt;
      var left = st.move * C.character.moveDistance;
      var dist = Math.min(want, left);

      // 맵 안에 가두기 (잠수함 크기 + 여백)
      var ox = s.x, oy = s.y;
      var minX = M.subHalfW + M.marginX, maxX = C.world.w - M.subHalfW - M.marginX;
      var minY = M.subHalfH + M.marginTop, maxY = C.world.h - M.subHalfH - M.marginBottom;
      s.x = Math.min(Math.max(s.x + inp.x * dist, minX), maxX);
      s.y = Math.min(Math.max(s.y + inp.y * dist, minY), maxY);

      // 실제로 움직인 거리만큼 게이지 줄임 (벽에 막혀 못 가면 안 줄어듦)
      var moved = Math.sqrt((s.x - ox) * (s.x - ox) + (s.y - oy) * (s.y - oy));
      if (moved > 0) {
        st.move = Math.max(0, st.move - moved / C.character.moveDistance);
        if (st.move < 1e-6) st.move = 0;
        G.placeSub(meId);
        G.setMoveGauge(st.move);
      }
    }

    // 카메라 따라가기: 잠수함이 화면 가운데 오도록 부드럽게 (바다를 직접 밀고 있으면 안 함)
    var cam = G.cam;
    if (cam.follow && !cam.panning && cam.viewW) {
      var tx = s.x - cam.viewW / cam.zoom / 2, ty = s.y - cam.viewH / cam.zoom / 2;
      var k = 1 - Math.exp(-M.cameraFollow * dt);
      var nx = cam.x + (tx - cam.x) * k, ny = cam.y + (ty - cam.y) * k;
      if (Math.abs(nx - cam.x) > 0.01 || Math.abs(ny - cam.y) > 0.01) {
        cam.x = nx; cam.y = ny;
        G.applyCamera();          // 맵 끝에서는 applyCamera 가 더 못 가게 막음
      }
    }
  }

  var last = 0;
  function frame(t) {
    var dt = last ? Math.min((t - last) / 1000, 0.05) : 0;   // 탭을 갔다 오면 한 번에 휙 가지 않게 최대 0.05초
    last = t;
    if (dt > 0) step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- 임시: 턴 넘기기 버튼을 누르면 이동 게이지가 다시 가득 ----------
     (턴 진행을 만들면 이 부분은 지우고, 내 턴이 시작될 때 게이지를 채우게 바꿈) */
  document.getElementById('btnSkip').addEventListener('click', function () {
    G.state.move = M.gaugeStart;
    G.setMoveGauge(G.state.move);
  });

  // 확인용으로 밖에서 볼 수 있게
  G.stick = stick;
})();
