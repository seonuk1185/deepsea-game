/* =========================================================
   심해 포격전(가칭) — 발사 버튼 꾹 누르기 → 터지는 거리(DELAY) 정하기
   1) 발사를 누르고 있는 동안: 궤도 판 가운데 주황 게이지가 잠수함 쪽 끝에서 차오름
   2) 손을 떼면 멈춤 → 흰 표시가 멈춘 자리 = 터지는 거리. 왼쪽 위 DELAY 칸에 거리 칸 숫자(0 ~ 최대 거리, 반올림)
      끝(노란 한계선 = 최대 거리)까지 차면 손을 안 떼도 그 자리에서 저절로 결정 (뒤에 손을 떼도 아무 일 없음)
   3) 정해지면 바로 「발사 주문서」를 냄 (Game.submit → 심판 rules.js → 재생 torpedo.js). 어뢰가 날아가는 동안은 발사 버튼이 잠김
   4) (12차) 키보드 스페이스도 똑같이: 누르기·떼기를 holdStart / holdRelease 한 곳에서 처리 → 버튼과 키가 같은 코드를 씀
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var btn = document.getElementById('btnFire');
  var delayNum = document.getElementById('delayNum');

  var hold = null;      // 누르고 있는 동안 { id: 누른 것(손가락 번호, 키보드는 'key'), t0: 누른 시각 }
  G.state.shot = null;  // 정해진 결과 { gauge: 0~1, distance: 거리 칸(0 ~ limit.right, 판 아래 눈금과 같음), worldX: 맵에서 갈 거리 }

  // 누른 시간 → 게이지 (0 → 1 까지 차고 멈춤)
  function gaugeAt(sec) {
    return Math.min(1, sec / C.fire.sweepTime);
  }

  function frame(t) {
    if (!hold) return;
    var v = gaugeAt((t - hold.t0) / 1000);
    if (v >= 1) { shoot(1); return; }                          // 끝까지 참 → 손을 안 떼도 최대 거리로 자동 발사
    G.setFireGauge(v);
    requestAnimationFrame(frame);
  }

  /* ---------- 누르기 시작 / 떼기 / 끊김 — 발사 버튼(손가락·마우스)과 스페이스 키가 같이 씀 ----------
     id = 누른 것 이름 (손가락 번호, 키보드는 'key'). 시작했으면 true */
  function holdStart(id) {
    if (hold) return false;                                    // 한 번에 하나만 (손가락 하나 또는 키 하나)
    if (G.state.busy) return false;                            // 어뢰가 날아가는 중엔 못 쏨 (한 번에 한 발)
    hold = { id: id, t0: performance.now(), before: G.state.pad.fill };
    btn.classList.add('held');                                 // 키로 눌러도 버튼이 눌린 모양
    G.setFireGauge(0);
    requestAnimationFrame(frame);
    return true;
  }
  // 뗐을 때 = 결정 (자동 발사 뒤라 hold 가 비어 있으면 아무 일 없음 → 두 번 안 쏨)
  function holdRelease(id) {
    if (!hold || hold.id !== id) return;
    shoot(gaugeAt((performance.now() - hold.t0) / 1000));
  }

  btn.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (!holdStart(e.pointerId)) return;
    btn.setPointerCapture(e.pointerId);                        // 손가락이 버튼 밖으로 미끄러져도 떼기 전까진 계속
  });
  function decide(e) { holdRelease(e.pointerId); }
  // 거리 확정 + 어뢰 발사 (떼거나, 끝까지 차거나)
  function shoot(v) {
    hold = null;
    btn.classList.remove('held');
    G.setFireGauge(v);

    var dist = G.gaugeToDistance(v);
    G.state.shot = {
      gauge: v,
      distance: dist,
      worldX: G.unitsToWorld(dist)                              // 거리 칸 → 맵 거리 (1칸 = config.js pad.worldPerUnit)
    };
    delayNum.textContent = Math.round(dist);
    console.log('[발사 거리 결정]', G.state.shot);
    // 어뢰 발사! = 「발사 주문서」를 냄: 지금 궤도 판 점 모양 + 화면 DELAY 칸과 같은 숫자(반올림한 거리 칸)
    //   → 심판(rules.js)이 한 발 전체를 계산 → torpedo.js 가 그 결과를 재생
    G.submit({ type: 'fire', subId: C.activeSubId, points: G.copyPoints(G.state.pad.points), distance: Math.round(dist) });
  }
  // 전화가 오는 등 브라우저가 중간에 끊으면 = 결정하지 않고 원래대로 (키보드는 다른 창으로 넘어갔을 때)
  function holdCancel(id) {
    if (!hold || hold.id !== id) return;
    G.setFireGauge(hold.before);
    hold = null;
    btn.classList.remove('held');
  }
  function cancel(e) { holdCancel(e.pointerId); }
  btn.addEventListener('pointerup', decide);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('lostpointercapture', cancel);         // pointerup 뒤에 오면 이미 끝난 상태라 아무 일 없음

  // 키보드(keys.js)가 쓰는 것: 스페이스 누름 = holdStart('key'), 뗌 = holdRelease('key')
  G.fireHold = { start: holdStart, release: holdRelease, cancel: holdCancel };
})();
