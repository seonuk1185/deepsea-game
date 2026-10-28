/* =========================================================
   심해 포격전(가칭) — 차례 진행 화면 (14차, 3단계 계획서 ⑨-②)
   진짜 차례 규칙(누구 차례·마감 시각·한 차례 한 발·이동 게이지 채우기·조류 굴리기·판 끝)은 전부 심판(rules.js)이 정함
   이 파일은 「보여 주기」 + 「때가 되면 쪽지 내기」만 함:
   1) 20초 시계: 심판이 적어 둔 마감 시각(turn.deadline)까지 남은 초를 계기판 큰 숫자에 보여 줌
      0 이 되면 「시간 끝(timeout)」 쪽지를 냄 → 심판이 마감 시각이 지났는지 검사하고 다음 차례로 (rules.js 맨 위 「턴 시계」 설명)
      (2026-10-28 형님 결정) 쏴도, 어뢰가 날아가는 동안에도 시계는 계속 줄어듦 (멈추지 않음)
   2) (2026-10-28) 쏜 뒤에도 차례는 저절로 안 넘어감: 재생이 끝나면 게이지·시간이 남은 만큼 다시 움직일 수 있고,
      차례는 시간 끝 / 턴 넘기기(Tab·버튼) 로만 넘어감. 어뢰 재생이 끝났을 때(Game.afterShot) 하는 일:
        - 판이 끝났으면(그 한 발로 격침) → 시간·게이지가 남았어도 바로 승리/패배 화면
        - 날아가는 동안 시계가 0 이 됐으면 → 지금 시간 끝 쪽지 (아래 「정한 것」)
        - 내 어뢰에 내가 격침됐는데 판은 안 끝났으면(팀전) → 움직일 수 없으니 바로 턴 넘기기
      ※ 정한 것: 어뢰가 날아가는 중에 시계가 0 이 되면 재생을 끊지 않고 끝까지 보여 준 뒤 넘김
        (도중에 끊으면 데미지·격침이 보이기도 전에 화면이 상대 차례로 휙 넘어가서 헷갈림)
        그 시간 끝 쪽지의 at = 재생이 끝난 시각 (마감보다 늦음). 심판은 at 이 마감 뒤인지만 보니까 받아 줌 → 같은 기록이면 늘 같은 결과
      ※ (2026-10-28 형님 결정) 0 이 되기 전에 발사를 누르기 시작했으면 시간 끝이 끊지 않음 → 누르고 있는 동안은 시간 끝 쪽지를 미룸
        (쏘면 위 「날아가는 중」과 같이 재생이 끝난 뒤 넘어감, 판단은 심판 rules.js holdInTime)
   3) 차례가 바뀔 때마다: 카메라를 차례 잠수함으로, 내 차례면 계기판 번쩍(playTurnStart), 상대 차례면 「상대 차례」 작은 표시
      + 내 조작 잠금 표시(조이스틱·발사·턴 넘기기 흐리게. 궤도 판 점은 상대 차례에도 미리 맞춰 둘 수 있음)
      + 이미 쏜 차례면 발사 버튼만 흐리게 (.fired)
   4) 상대 차례 대신 해 주기 = 「컴퓨터 상대 자리」 (Game.bots). (③) 진짜 컴퓨터 상대 = bot.js 가 이 자리에 들어옴
      컴퓨터 상대도 사람과 같은 쪽지만 냄 → 나중에 인터넷 상대·서버 쪽 컴퓨터 상대로 바꿔 끼우기만 하면 됨
      「상대 차례」 표시에 지금 하는 일(생각하는 중·움직이는 중·조준하는 중)을 붙임
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
     bots[잠수함 id] (없으면 bots.default) = function (심판 상태, 판 시계, 잠수함 id) → 낼 쪽지 하나 / 쪽지 묶음(배열) / null
     (③) 화면마다(requestAnimationFrame) + 시계가 돌 때마다(0.1초) 불림 → 이동을 조이스틱처럼 화면마다 부드럽게 낼 수 있게
       (탭이 느려져 화면이 드물게 그려져도 0.1초 시계로는 계속 불림 — 컴퓨터 상대는 지난번부터 지난 시간만큼 걸음을 냄)
     쪽지를 돌려주면 이 파일이 Game.submit 으로 냄 (사람이 내는 쪽지와 똑같은 창구)
     안 부르는 때: 판 끝·판 끝 화면 기다리는 중·어뢰를 보여 주는 중·시간 끝(그때는 시간 끝 쪽지가 먼저)
     진짜 컴퓨터 상대는 bot.js (이 파일 다음에 불러서 bots.default 에 들어감). 없으면 상대는 시간 끝에 넘어감 */
  G.bots = G.bots || {};
  function botFor(id) { return G.bots[id] || G.bots.default || null; }
  function runBot(now) {
    var t = rs.turn;
    if (overShown || rs.over || waitingOver || G.state.busy) return;
    if (t.activeId === G.mySubId || now >= t.deadline) return;
    var bot = botFor(t.activeId);
    var out = bot && bot(rs, now, t.activeId);
    if (!out) return;
    (Array.isArray(out) ? out : [out]).forEach(function (slip) { if (slip) G.submit(slip); });
  }
  function botFrame() {
    runBot(G.matchNow());
    requestAnimationFrame(botFrame);
  }

  /* ---------- 시계 + 컴퓨터 상대 자리 — 0.1초마다 ----------
     (requestAnimationFrame 대신 setInterval: 탭이 느려져도 시간 끝은 제때 오게. 시계 숫자는 0.1초면 충분) */
  var shownSec = null, overShown = false, waitingOver = false;
  function tick() {
    if (overShown) return;
    var t = rs.turn, now = G.matchNow();
    var sec = Math.max(0, Math.ceil((t.deadline - now) / 1000));   // 쏜 뒤에도·어뢰가 날아가는 중에도 계속 줄어듦 (2026-10-28)
    if (sec !== shownSec) { shownSec = sec; timerNum.textContent = sec; }
    G.setClock((t.deadline - now) / t.limit);                     // (D2) 링 시계 호 = 남은 시간 비율 (0.1초마다 부드럽게 줄어듦)

    if (rs.over || waitingOver) return;                           // 판을 끝낸 어뢰를 보여 주는 중 → 재생이 끝나면 afterShot 이 판 끝 화면
    if (G.state.busy) return;                                     // 어뢰가 날아가는 중엔 쪽지 안 냄 (시간이 끝나도 재생이 끝난 뒤에 넘김)
    if (now >= t.deadline) {                                      // 시간 끝 → 쪽지 (심판이 마감 시각 지났는지 다시 검사)
      if (G.fireHold.isHolding()) return;                         // 0 전에 누르기 시작한 발사는 끊지 않음 (떼면 쏘고, 재생 끝나면 넘김)
      G.submit({ type: 'timeout', subId: t.activeId, at: Math.max(Math.round(now), t.deadline) });
      return;
    }
    runBot(now);                                                  // 상대(또는 이 화면이 조종 안 하는 잠수함) 차례 → 컴퓨터 상대
  }
  setInterval(tick, 100);
  requestAnimationFrame(botFrame);

  /* ---------- 어뢰 재생 끝 (torpedo.js 가 부름) → 판 끝 화면 / (날아가는 중 시간이 끝났으면) 시간 끝 쪽지 ----------
     (2026-10-28) 예전처럼 저절로 턴 넘기기 쪽지를 내지 않음 → 시간·게이지가 남았으면 다시 움직일 수 있음 */
  G.afterShot = function () {
    if (rs.over) {                                                // 이 한 발로 판이 끝남 → 시간·게이지가 남았어도 바로 판 끝 화면
      waitingOver = true;
      setTimeout(function () { waitingOver = false; showOver(); }, (T.fireEndDelay || 0) * 1000);
      return;
    }
    var a = G.getSub(rs.turn.activeId);
    if (a && a.sunk) {                                            // 내 어뢰에 내가 격침됨(팀전에서 판은 계속) → 움직일 수 없으니 바로 넘김
      G.submit({ type: 'endTurn', subId: a.id });
      return;
    }
    updateLock();
    tick();                                                       // 날아가는 중에 시간이 끝났으면 여기서 바로 시간 끝 쪽지
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
    gameEl.classList.toggle('locked', !G.isMyTurn());
    gameEl.classList.toggle('fired', G.isMyTurn() && rs.turn.fired);   // 쏜 뒤엔 발사 버튼만 흐리게 (이동·턴 넘기기는 됨, 2026-10-28)
    var t = rs.turn, a = G.getSub(t.activeId), me = G.getSub(G.mySubId);
    var other = !rs.over && a && t.activeId !== G.mySubId;
    if (other) {
      var friend = me && a.team === me.team;
      var bot = botFor(a.id), doing = bot && bot.status ? bot.status(rs, a.id) : '';   // (③) 컴퓨터 상대가 지금 하는 일
      turnTag.innerHTML = '<b>' + (friend ? '우리 편 차례' : '상대 차례') + '</b> ' + a.name + (doing ? ' · ' + doing : '');
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
    overShown = true;
    timerNum.textContent = '--';
    G.setClock(0);                                                // 링 시계도 비움
    G.markActive(null);                                          // 차례 화살표도 끔
    updateLock();
  }
  $('btnAgain').addEventListener('click', function () {
    overBox.hidden = true;
    G.restart();                                                  // 새 판 (새 주사위 번호) — main.js
  });
  G.onRestart(function () { overShown = false; waitingOver = false; overBox.hidden = true; presentTurn(); });

  G.turnUi = { tick: tick, showOver: showOver, presentTurn: presentTurn };
  presentTurn();                                                  // 첫 차례 연출
})();
