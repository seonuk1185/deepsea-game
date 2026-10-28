/* =========================================================
   심해 포격전(가칭) — 발사 버튼 꾹 누르기 → 터지는 거리 정하기
   (2026-10-28) 정확히는 「날아가는 시간」: 조류가 없으면 판 눈금 거리 그대로에서 터지고, 순풍이면 더 멀리·역풍이면 짧게 (심판 rules.js)
   (예전엔 이 거리를 DELAY 라고 불렀지만, 원작의 DELAY 는 줄 서기 점수였음 → 계기판 DLY 칸은 이제 줄 서기 점수)
   1) 발사를 누르고 있는 동안: 궤도 판 가운데 주황 게이지가 잠수함 쪽 끝에서 차오름
   2) 손을 떼면 멈춤 → 흰 표시가 멈춘 자리 = 터지는 거리. 궤도 판 위 구석 「DIST」 에 거리 칸 숫자(0 ~ 최대 거리, 반올림)
      (2026-10-28) 누르는 동안에도 숫자가 같이 올라감. 차례가 바뀔 때 「--」 로
      끝(노란 한계선 = 최대 거리)까지 차면 손을 안 떼도 그 자리에서 저절로 결정 (뒤에 손을 떼도 아무 일 없음)
   3) 정해지면 바로 「발사 주문서」를 냄 (Game.submit → 심판 rules.js → 재생 torpedo.js). 어뢰가 날아가는 동안은 발사 버튼이 잠김
   4) (12차) 키보드 스페이스도 똑같이: 누르기·떼기를 holdStart / holdRelease 한 곳에서 처리 → 버튼과 키가 같은 코드를 씀
   5) (14차) 내 차례이고 이번 차례에 아직 안 쐈을 때만 (Game.canFire). 한 차례에 한 발
      차례가 바뀌면(턴 넘기기 등) 누르고 있던 것은 안 쏘고 원래대로 (abort — turn.js 가 부름)
   6) (2026-10-28 형님 결정) 시계가 0 이 되기 전에 누르기 시작했으면 시간 끝이 끊지 않음
      → 떼거나 끝까지 찰 때까지 그대로 차오르고, 쏜 쪽지에 「누르기 시작한 시각(holdAt)」을 담아 보냄 → 심판이 받아 줌
      그동안 turn.js 는 시간 끝 쪽지를 안 냄 (Game.fireHold.isHolding). 0 이 된 뒤에 누르기 시작하면 안 됨
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var btn = document.getElementById('btnFire');

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
    G.setPadDist(G.gaugeToDistance(v));                        // 누르는 동안 거리 숫자도 같이 올라감
    requestAnimationFrame(frame);
  }

  /* ---------- 누르기 시작 / 떼기 / 끊김 — 발사 버튼(손가락·마우스)과 스페이스 키가 같이 씀 ----------
     id = 누른 것 이름 (손가락 번호, 키보드는 'key'). 시작했으면 true */
  function holdStart(id) {
    if (hold) return false;                                    // 한 번에 하나만 (손가락 하나 또는 키 하나)
    if (!G.canFire()) return false;                            // 상대 차례·이미 쏨·어뢰가 날아가는 중엔 못 쏨 (한 차례에 한 발)
    var now = Math.round(G.matchNow());
    if (now >= G.rs.turn.deadline) return false;               // 시계가 0 이 된 뒤엔 새로 누를 수 없음
    hold = { id: id, t0: performance.now(), at: now, before: G.state.pad.fill, beforeDist: G.state.shot ? G.state.shot.distance : null };   // at = 누르기 시작한 판 시계 (쪽지 holdAt)
    btn.classList.add('held');                                 // 키로 눌러도 버튼이 눌린 모양
    G.setFireGauge(0);
    G.setPadDist(0);
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
    var holdAt = hold ? hold.at : null;
    hold = null;
    btn.classList.remove('held');
    G.setFireGauge(v);

    if (!G.canFire()) { G.setFireGauge(0); G.setPadDist(null); return; }   // 누르는 사이 차례가 끝났으면 안 쏨
    var dist = G.gaugeToDistance(v);
    G.state.shot = {
      gauge: v,
      distance: dist,
      worldX: G.unitsToWorld(dist)                              // 거리 칸 → 맵 거리 (1칸 = config.js pad.worldPerUnit)
    };
    G.setPadDist(dist);                                        // 판 구석 거리 숫자 (쪽지에 담는 숫자와 같음, 반올림)
    console.log('[발사 거리 결정]', G.state.shot);
    // 어뢰 발사! = 「발사 주문서」를 냄: 지금 궤도 판 점 모양 + 판 구석 거리 숫자와 같은 숫자(반올림한 거리 칸)
    //   → 심판(rules.js)이 한 발 전체를 계산 → torpedo.js 가 그 결과를 재생
    //   holdAt = 누르기 시작한 시각 → 마감 직전에 눌러 마감 뒤에 떼도 심판이 받아 줌 (2026-10-28)
    G.submit({ type: 'fire', subId: G.mySubId, points: G.copyPoints(G.state.pad.points), distance: Math.round(dist), holdAt: holdAt });
  }
  // 누르고 있던 것이 누구든 안 쏘고 원래대로 (차례가 바뀌었을 때·다시 하기)
  function abort() {
    if (!hold) return;
    hold = null;
    btn.classList.remove('held');
    G.setFireGauge(0);
    G.setPadDist(null);
  }
  // 전화가 오는 등 브라우저가 중간에 끊으면 = 결정하지 않고 원래대로 (키보드는 다른 창으로 넘어갔을 때)
  function holdCancel(id) {
    if (!hold || hold.id !== id) return;
    G.setFireGauge(hold.before);
    G.setPadDist(hold.beforeDist);
    hold = null;
    btn.classList.remove('held');
  }
  function cancel(e) { holdCancel(e.pointerId); }
  btn.addEventListener('pointerup', decide);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('lostpointercapture', cancel);         // pointerup 뒤에 오면 이미 끝난 상태라 아무 일 없음

  // 키보드(keys.js)가 쓰는 것: 스페이스 누름 = holdStart('key'), 뗌 = holdRelease('key')
  //   isHolding = 지금 누르고 있나 (turn.js 가 시간 끝 쪽지를 미룰 때 봄)
  G.fireHold = { start: holdStart, release: holdRelease, cancel: holdCancel, abort: abort,
                 isHolding: function () { return !!hold; } };
})();
