/* =========================================================
   심해 포격전(가칭) — 발사 버튼 꾹 누르기 → 터지는 거리(DELAY) 정하기
   1) 발사를 누르고 있는 동안: 궤도 판 가운데 주황 게이지가 잠수함 쪽 끝에서 차오르고,
      거리 한계선에 닿으면 다시 내려오고… 왔다 갔다 반복
   2) 손을 떼면 멈춤 → 흰 표시가 멈춘 자리 = 터지는 거리. 왼쪽 위 DELAY 칸에 거리 칸 숫자(0 ~ 최대 거리, 반올림)
   3) 지금은 어뢰가 아직 안 날아감 (다음 단계). 결과만 기록 + 확인용 글씨
   main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var btn = document.getElementById('btnFire');
  var delayNum = document.getElementById('delayNum');

  var hold = null;      // 누르고 있는 동안 { id: 손가락 번호, t0: 누른 시각 }
  G.state.shot = null;  // 정해진 결과 { gauge: 0~1, distance: 거리 칸(0 ~ limit.right, 판 아래 눈금과 같음), worldX: 맵에서 갈 거리 }

  // 누른 시간 → 게이지 (0 → 1 → 0 → 1 … 왕복)
  function gaugeAt(sec) {
    var k = (sec / C.fire.sweepTime) % 2;
    return k <= 1 ? k : 2 - k;
  }

  function frame(t) {
    if (!hold) return;
    G.setFireGauge(gaugeAt((t - hold.t0) / 1000));
    requestAnimationFrame(frame);
  }

  btn.addEventListener('pointerdown', function (e) {
    if (hold) return;                                          // 한 손가락만
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    hold = { id: e.pointerId, t0: performance.now(), before: G.state.pad.fill };
    btn.setPointerCapture(e.pointerId);                        // 손가락이 버튼 밖으로 미끄러져도 떼기 전까진 계속
    btn.classList.add('held');
    G.setFireGauge(0);
    requestAnimationFrame(frame);
  });

  // 뗐을 때 = 결정
  function decide(e) {
    if (!hold || e.pointerId !== hold.id) return;
    var v = gaugeAt((performance.now() - hold.t0) / 1000);
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
    showToast('거리 ' + Math.round(dist) + ' 결정');            // ※ 임시 (확인용)
  }
  // 전화가 오는 등 브라우저가 중간에 끊으면 = 결정하지 않고 원래대로
  function cancel(e) {
    if (!hold || e.pointerId !== hold.id) return;
    G.setFireGauge(hold.before);
    hold = null;
    btn.classList.remove('held');
  }
  btn.addEventListener('pointerup', decide);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('lostpointercapture', cancel);         // pointerup 뒤에 오면 이미 끝난 상태라 아무 일 없음

  /* ---------- ※ 임시: 화면 가운데 위에 「거리 27 결정」 잠깐 띄우기 (어뢰 날아가기를 만들면 지움) ---------- */
  var toast = null, toastTimer = 0;
  function showToast(text) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast-temp';
      document.querySelector('.hud').appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, C.fire.toastTime * 1000);
  }
})();
