/* =========================================================
   심해 포격전(가칭) — 조이스틱으로 내 잠수함 움직이기
   1) 조이스틱: 손잡이를 잡고 끌면 손가락을 따라감(동그라미 안까지만), 놓으면 가운데로 돌아감
   2) 이동: 미는 방향·세기대로 「이동 주문서」를 냄 → 심판(rules.js)이 옮기고, 간 거리만큼 이동 게이지를 깎음
   3) 카메라: 잠수함이 움직이면 화면이 부드럽게 따라감 (바다를 손으로 밀면 잠깐 멈춤)
   4) 턴 넘기기 버튼 → 「턴 넘기기 주문서」
   5) (12차) 키보드 WASD 도 여기로: keys.js 가 「지금 누른 방향」만 알려 주면(Game.setMoveKeys)
      조이스틱과 똑같은 걸음 계산을 거쳐 똑같은 이동 쪽지가 나감 (계산은 한 곳에만 있음)
   6) (12차) 키보드 화살표 = 화면(바다) 둘러보기: 손가락으로 바다를 미는 것과 같음 (잠수함 따라가기 멈춤, Game.setPanKeys)
   이 파일은 잠수함 자리·게이지를 직접 바꾸지 않음 (쪽지만 냄)
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
        쪽지 내는 방식: 한 화면마다 「이만큼 가고 싶어요」 걸음 하나짜리 이동 쪽지를 바로 냄
          → 심판이 그 자리에서 옮겨 주고, 화면은 심판이 정한 자리로 그림. 그래서 부드럽고, 화면·심판 자리가 어긋날 일이 없음
          (예전 조이스틱과 계산이 한 걸음 한 걸음 똑같아서, 벽에 막히며 미끄러질 때도 게이지가 똑같이 줄어듦)
          온라인 때는 이 걸음들을 0.1초쯤 모아 쪽지 한 장(steps 여러 개)으로 보내면 됨 — 쪽지 모양은 이미 그렇게 되어 있음
     ========================================================= */
  var meId = C.activeSubId;   // 이 화면이 조종하는 잠수함 (지금은 늘 내 잠수함)

  // 키보드로 누르고 있는 방향 (-1 / 0 / 1). keys.js 가 Game.setMoveKeys 로 넣어 줌. 둘 다 누르면 대각선
  var keyDir = { x: 0, y: 0 };
  function setMoveKeys(x, y) {
    keyDir.x = x; keyDir.y = y;
    if (x || y) G.cam.follow = true;                          // 키로 움직이기 시작하면 카메라가 다시 따라감 (조이스틱 잡을 때와 같음)
  }

  // 화살표 키로 둘러보는 방향 (-1 / 0 / 1). keys.js 가 Game.setPanKeys 로 넣어 줌
  var panDir = { x: 0, y: 0 };
  function setPanKeys(x, y) {
    panDir.x = x; panDir.y = y;
    if (x || y) G.cam.follow = false;                         // 바다를 손으로 밀 때처럼 잠수함 따라가기를 멈춤 (WASD·조이스틱을 잡으면 다시 따라감)
  }

  // 지금 움직이고 싶은 방향·세기 하나로 모으기 (조이스틱이든 키보드든 여기서 같은 모양이 됨)
  //   키보드를 누르고 있으면 키보드가 먼저: 늘 끝까지 민 것과 같음(세기 1). 대각선도 빠르기는 같게(길이 1로 맞춤)
  //   아니면 조이스틱 값: 가운데 조금은 무시하고, 그 바깥을 0~1로 다시 펼침
  function readInput() {
    if (keyDir.x || keyDir.y) {
      var kl = Math.sqrt(keyDir.x * keyDir.x + keyDir.y * keyDir.y);
      return { x: keyDir.x / kl, y: keyDir.y / kl, power: 1 };
    }
    var len = Math.sqrt(stick.x * stick.x + stick.y * stick.y);
    if (len <= M.deadZone) return { x: 0, y: 0, power: 0 };
    var power = Math.min(1, (len - M.deadZone) / (1 - M.deadZone));
    return { x: stick.x / len, y: stick.y / len, power: power };
  }

  function step(dt) {
    var s = G.getSub(meId);           // 심판이 들고 있는 내 잠수함 (읽기만)
    if (!s) return;
    var inp = readInput();          // 조이스틱 또는 키보드

    // G.state.busy = 어뢰를 보여 주는 중 (torpedo.js) → 그동안은 못 움직임. 게이지가 바닥이면 쪽지를 안 냄
    if (inp.power > 0 && s.move > 0 && !G.state.busy) {
      // 바라보는 쪽: 좌우로 충분히 밀었을 때만 돌아봄 (거의 위아래로만 밀면 그대로)
      var hx = inp.x * inp.power, facing = s.facing;
      if (hx > M.faceThreshold) facing = 'right';
      else if (hx < -M.faceThreshold) facing = 'left';

      // 이번 화면에 가고 싶은 걸음 (방향 × 세기 × 빠르기 × 시간). 게이지·맵 끝 계산은 심판이 함
      var want = M.speed * inp.power * dt;
      G.submit({ type: 'move', subId: meId, steps: [[inp.x * want, inp.y * want]], facing: facing });
    }

    var cam = G.cam;
    // 화살표 키로 둘러보기: 누르고 있는 동안 화면이 그쪽으로 부드럽게 미끄러짐 (맵 끝에서는 applyCamera 가 막음)
    if ((panDir.x || panDir.y) && cam.zoom) {
      var pl = Math.sqrt(panDir.x * panDir.x + panDir.y * panDir.y);
      var pv = M.keyPanSpeed * dt / cam.zoom / pl;              // 화면 px/초 → 맵 거리 (대각선도 같은 빠르기)
      cam.follow = false;
      cam.x += panDir.x * pv; cam.y += panDir.y * pv;
      G.applyCamera();
    }

    // 카메라 따라가기: 잠수함이 화면 가운데 오도록 부드럽게 (바다를 직접 밀고 있으면 안 함)
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

  /* ---------- 턴 넘기기 버튼 → 「턴 넘기기 주문서」 ----------
     (임시) 지금은 심판이 이동 게이지만 다시 가득 채우고, 화면이 거리 게이지·DELAY 를 처음으로 (main.js onResult('endTurn'))
     턴 진행(②)을 만들면 심판이 여기서 다음 차례로 넘김 */
  function endTurn() {
    G.submit({ type: 'endTurn', subId: meId });
  }
  document.getElementById('btnSkip').addEventListener('click', endTurn);

  // 확인용으로 밖에서 볼 수 있게 + 키보드(keys.js)가 쓰는 것
  G.stick = stick;
  G.keyDir = keyDir;
  G.setMoveKeys = setMoveKeys;   // WASD → 이동 (위 readInput 으로 들어감)
  G.setPanKeys = setPanKeys;     // 화살표 → 화면 둘러보기
  G.endTurn = endTurn;           // Enter / T → 턴 넘기기 (버튼 누른 것과 똑같음)
})();
