/* =========================================================
   심해 포격전(가칭) — 차례 진행 화면 (14차, 3단계 계획서 ⑨-②)
   진짜 차례 규칙(누구 차례·마감 시각·한 차례 한 발·이동 게이지 채우기·조류 굴리기·판 끝)은 전부 심판(rules.js)이 정함
   이 파일은 「보여 주기」 + 「때가 되면 쪽지 내기」만 함:
   1) 20초 시계: 심판이 적어 둔 마감 시각(turn.deadline)까지 남은 초를 계기판 큰 숫자에 보여 줌
      0 이 되면 「시간 끝(timeout)」 쪽지를 냄 → 심판이 마감 시각이 지났는지 검사하고 다음 차례로 (rules.js 맨 위 「턴 시계」 설명)
      쏘면 그 차례 시계는 멈춤 (심판 turn.fired) → 숫자도 그 자리에 멈춤
   2) 어뢰 재생이 끝나면(torpedo.js → Game.afterShot) 쏜 잠수함의 「턴 넘기기」 쪽지를 냄 (판이 끝났으면 승리/패배 화면)
   3) 차례가 바뀔 때마다: 카메라를 차례 잠수함으로, 내 차례면 계기판 번쩍(playTurnStart), 상대 차례면 「상대 차례」 작은 표시
      + 내 조작 잠금 표시(조이스틱·발사·턴 넘기기 흐리게. 궤도 판 점은 상대 차례에도 미리 맞춰 둘 수 있음)
   4) 상대 차례 대신 해 주기 = 「컴퓨터 상대 자리」 (Game.bots). 지금은 임시로 아무것도 안 하고 2초 뒤 턴 넘기기 쪽지만 냄
      ③ 단계에서 진짜 컴퓨터 상대가 이 자리에 같은 모양(쪽지를 돌려주는 함수)으로 들어오면 됨
   5) 판 끝: 승리 / 패배 / 비김 + 「다시 하기」 (Game.restart = 새 판, 새 주사위 번호)
   main.js·move.js·fire.js·torpedo.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game, rs = G.rs;
  var T = C.turn || {};
  var $ = function (id) { return document.getElementById(id); };
  var gameEl = $('game'), timerNum = $('timerNum'), turnTag = $('turnTag');
  var overBox = $('overBox');

  /* ---------- 컴퓨터 상대 자리 (Game.bots) ----------
     bots[잠수함 id] (없으면 bots.default) = function (심판 상태, 판 시계, 잠수함 id) → 낼 쪽지 하나 또는 null
     시계가 돌 때마다(0.1초쯤) 불림. 쪽지를 돌려주면 이 파일이 Game.submit 으로 냄 (사람이 내는 쪽지와 똑같은 창구)
     (임시) 기다리기만 하다가 enemyPassDelay(2초) 뒤에 턴 넘기기 */
  function placeholderBot(state, now, id) {
    if (now - state.turn.startAt >= (T.enemyPassDelay != null ? T.enemyPassDelay : 2) * 1000) return { type: 'endTurn', subId: id };
    return null;
  }
  G.bots = G.bots || {};
  if (!G.bots.default) G.bots.default = placeholderBot;

  /* ---------- 시계 + 컴퓨터 상대 자리 — 0.1초마다 ----------
     (requestAnimationFrame 대신 setInterval: 탭이 느려져도 시간 끝은 제때 오게. 시계 숫자는 0.1초면 충분) */
  var shownSec = null, waitingEnd = false;
  function tick() {
    if (rs.over || waitingEnd) return;
    var t = rs.turn, now = G.matchNow();
    var left = t.fired ? t.deadline - t.firedAt : t.deadline - now;   // 쏜 뒤엔 그 자리에 멈춤
    var sec = Math.max(0, Math.ceil(left / 1000));
    if (sec !== shownSec) { shownSec = sec; timerNum.textContent = sec; }

    if (t.fired || G.state.busy) return;                          // 어뢰 차례 = 시계 멈춤, 재생 끝나면 afterShot 이 넘김
    if (now >= t.deadline) {                                      // 시간 끝 → 쪽지 (심판이 마감 시각 지났는지 다시 검사)
      G.submit({ type: 'timeout', subId: t.activeId, at: Math.max(Math.round(now), t.deadline) });
      return;
    }
    if (t.activeId !== G.mySubId) {                               // 상대(또는 이 화면이 조종 안 하는 잠수함) 차례
      var bot = G.bots[t.activeId] || G.bots.default;
      var slip = bot && bot(rs, now, t.activeId);
      if (slip) G.submit(slip);
    }
  }
  setInterval(tick, 100);

  /* ---------- 어뢰 재생 끝 (torpedo.js 가 부름) → 턴 넘기기 쪽지 또는 판 끝 화면 ---------- */
  G.afterShot = function () {
    waitingEnd = true;
    setTimeout(function () {
      waitingEnd = false;
      if (rs.over) { showOver(); return; }
      if (rs.turn.fired) G.submit({ type: 'endTurn', subId: rs.turn.activeId });
    }, (T.fireEndDelay || 0) * 1000);
  };

  /* ---------- 차례가 바뀜 (턴 넘기기·시간 끝 결과) → 연출 ---------- */
  function presentTurn() {
    shownSec = null;
    G.fireHold.abort();                                           // 누르고 있던 발사는 안 쏘고 원래대로
    G.cam.follow = true;                                          // 카메라 = 차례 잠수함으로 (move.js 따라가기)
    G.cam.manual = false;
    if (G.isMyTurn()) G.playTurnStart();                          // 내 차례: 계기판 번쩍 (+ 머리 위 화살표는 main.js markActive)
    updateLock();
    tick();
  }
  G.onResult('endTurn', presentTurn);
  G.onResult('timeout', presentTurn);
  G.onResult('fire', function () { updateLock(); });

  // 잠금 표시 + 「상대 차례」 표시 (0.1초마다 확인해도 되지만 바뀔 때만 부름 + 안전하게 0.25초마다 한 번)
  function updateLock() {
    gameEl.classList.toggle('locked', !G.isMyTurn() || rs.turn.fired);
    var t = rs.turn, a = G.getSub(t.activeId), me = G.getSub(G.mySubId);
    var other = !rs.over && a && t.activeId !== G.mySubId;
    if (other) {
      var friend = me && a.team === me.team;
      turnTag.innerHTML = '<b>' + (friend ? '우리 편 차례' : '상대 차례') + '</b> ' + a.name;
      turnTag.classList.toggle('friend', !!friend);
    }
    turnTag.hidden = !other;
  }
  setInterval(updateLock, 250);

  /* ---------- 판 끝: 승리 / 패배 / 비김 + 다시 하기 ---------- */
  function showOver() {
    var me = G.getSub(G.mySubId), w = rs.over ? rs.over.winner : null;
    var kind = w == null ? 'draw' : (me && w === me.team ? 'win' : 'lose');
    $('overTitle').textContent = { win: '승리!', lose: '패배', draw: '비김' }[kind];
    $('overText').textContent = { win: '상대 잠수함을 모두 격침했어요.', lose: '내 잠수함이 격침됐어요.', draw: '모두 격침됐어요.' }[kind];
    overBox.className = 'over ' + kind;
    overBox.hidden = false;
    timerNum.textContent = '--';
    G.markActive(null);                                           // 차례 화살표도 끔
    updateLock();
  }
  $('btnAgain').addEventListener('click', function () {
    overBox.hidden = true;
    G.restart();                                                  // 새 판 (새 주사위 번호) — main.js
  });
  G.onRestart(function () { waitingEnd = false; overBox.hidden = true; presentTurn(); });

  G.turnUi = { tick: tick, showOver: showOver, presentTurn: presentTurn };
  presentTurn();                                                  // 첫 차례 연출
})();
