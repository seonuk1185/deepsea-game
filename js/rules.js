/* =========================================================
   심해 포격전(가칭) — 심판 (게임 규칙)
   쉽게 설명하면: 이 파일은 「심판」입니다. 화면은 전혀 모르고, 숫자만 봅니다.
     - 진짜 게임 상태(잠수함 자리·바라보는 쪽·체력·팀·격침, 조류, 차례 순서)를 들고 있음
     - 플레이어의 행동은 전부 「주문서(쪽지)」로만 받음 → 규칙대로 결과를 계산해서 돌려줌
     - 어뢰 한 발은 쏘는 순간 처음부터 끝까지 한 번에 계산 (날아가는 길·스침·폭발·데미지·격침)
       화면(torpedo.js)은 이 결과를 받아서 「다시 보여 주기(재생)」만 함
   왜 이렇게 나눴나: 나중에 온라인 대전을 만들 때 이 심판 파일을 그대로 서버로 옮기면 되고,
     키보드·컴퓨터 상대·인터넷 상대도 같은 주문서만 내면 똑같이 움직이게 하려고 (3단계 계획서 ⑨)
   지키는 약속: 화면(document)·애니메이션 시계(requestAnimationFrame)·현재 시각(performance.now)·Math.random 을 안 씀.
     → 같은 시작 상태 + 같은 주사위 번호(seed) + 같은 주문서 순서 = 어느 컴퓨터에서나 똑같은 결과
   숫자 설정은 전부 config.js 에서 받아 씀 (이 파일에 직접 숫자를 박지 않음)
   config.js 다음, main.js 앞에 불러야 함. (컴퓨터에서 node 로 따로 돌려 볼 수도 있음)

   ── 주문서(쪽지) 모양 ──  (그냥 글자로 바꿔서 인터넷으로 보낼 수 있는 모양)
     이동:      { type: 'move',    subId: 'me', steps: [[dx, dy], ...], facing: 'left' | 'right' }
                  steps = 가고 싶은 만큼의 작은 걸음들 (맵 단위). 한 걸음은 조이스틱 한 화면(최대 0.05초)만큼
                  심판이 한 걸음씩 「게이지 남은 만큼만, 맵 안으로만」 옮기고 실제로 간 거리만큼 게이지를 깎음
     발사:      { type: 'fire',    subId: 'me', points: [[가로 칸, 세로 %], x3], distance: 거리 칸(0 ~ 최대 거리), holdAt: 누르기 시작한 판 시계 }
                  distance (2026-10-28) = 「조류가 없을 때 터지는 거리」 = 날아가는 시간. 순풍이면 더 멀리, 역풍이면 짧게 터짐 (아래 6)
                  holdAt (2026-10-28) = 발사 버튼·스페이스를 누르기 시작한 시각. 마감 전에 누르기 시작했으면 마감 뒤에 떼도 받아 줌 (아래 「턴 시계」)
     턴 넘기기: { type: 'endTurn', subId: 'me' }
     시간 끝:   { type: 'timeout', subId: 지금 차례 }   (14차) 20초가 다 됐을 때 화면이 냄
     모든 쪽지에는 at = 「판 시계」(판 시작부터 지난 1/1000초)가 붙음 (화면 창구 Game.submit 이 찍어 줌)

   ── 턴 시계 (14차) — 왜 이렇게 했나 ──
     심판은 시계를 「보지」 않음 (performance.now 를 안 씀). 대신 차례마다 「마감 시각」(turn.deadline = 시작 at + 20초)을 숫자로 적어 둠
     화면은 자기 시계로 「마감까지 남은 초」를 계기판에 보여 주기만 하고, 0 이 되면 「시간 끝(timeout)」 쪽지를 냄
     심판은 그 쪽지의 at 이 마감 시각을 지났는지만 검사 → 지났으면 다음 차례로. 마감 뒤에 온 이동·발사 쪽지는 거절
     → 어느 컴퓨터든 같은 쪽지 기록(at 포함)이면 똑같은 순간에 차례가 넘어감. 온라인 때는 서버가 at 을 찍고 timeout 도 서버가 냄
     (2026-10-28 형님 결정) 쏴도 시계는 계속 감 (멈추지 않음). 쏜 뒤에도 게이지·시간이 남아 있으면 이동 가능, 발사는 한 차례 한 발 그대로
       → 쏜 뒤 차례가 넘어가는 때도 똑같이 「시간 끝」 또는 「턴 넘기기」 쪽지뿐 (어뢰 재생이 끝났다고 저절로 넘기지 않음)
       어뢰가 날아가는 중에 마감이 지나면: 화면이 재생을 끝까지 보여 준 뒤 「시간 끝」 쪽지를 냄 (그 쪽지의 at = 재생이 끝난 시각, 마감보다 늦음)
       심판은 at 이 마감 뒤인지만 보니까 늦게 와도 받아 줌 → 다음 차례 시작 시각 = 그 at (쪽지에 적혀 있으니 다시 돌려도 똑같음)
     (2026-10-28 형님 결정) 마감 전에 발사를 누르기 시작했으면 시간 끝이 끊지 않음: 손을 뗄 때(또는 끝까지 차서 자동 발사) 쏜 것을 받아 줌
       판단은 쪽지에 적힌 숫자로만: holdAt(누르기 시작) 이 마감 전이고, at - holdAt 이 「게이지 한 번 차는 시간(fire.sweepTime) + 조금(fire.holdSlackMs)」 이하일 때
       → 그보다 길면 거절 (게이지는 sweepTime 이면 저절로 쏘니까 그 이상 누르고 있을 수 없음 = 온라인 때 「마감 뒤에 쏘려고 holdAt 을 속인」 쪽지 막기)
       마감 뒤에 누르기 시작한 발사(holdAt 이 마감 뒤)는 안 됨

   ── 줄 서기 (DELAY) — 2026-10-28 형님 결정 (원작·건바운드 방식) ──
     잠수함마다 DELAY 점수가 있음. 판 시작 때 전부 0, 판 끝까지 「쌓이기만」 함 (차례가 와도 안 지움)
     차례가 끝날 때 그 차례에 쓴 시간만큼 더함: 1초 = 10점 (config.js delay.perSecond). 쓴 시간 = 끝낸 쪽지 at − 차례 시작 at
       시간 끝(timeout)은 늘 「한 차례 시간 전부」(20초 = 200점). 턴 넘기기도 한 차례 시간보다 많이는 안 셈
       (나중에 아이템·이동에 점수를 더 붙일 자리 = config.js delay.cost — 지금은 전부 0)
     다음 차례 = 살아 있는 잠수함 중 DELAY 가 「가장 낮은」 잠수함 (한 바퀴 순서 없음, 차례가 끝날 때마다 바로 정함 → pickNext)
       빨리 끝내면 점수가 덜 쌓여서 내 차례가 또 올 수 있음 (연속 차례)
       점수가 같으면: 지난 차례를 「더 먼저」 끝낸 잠수함 (오래 기다린 쪽) → 아직 한 번도 안 한 잠수함이 먼저 → 그래도 같으면 config.js turnOrder 순서
     안전장치: 같은 잠수함은 연속 2번까지 (config.js delay.maxConsecutive). 3번째가 될 차례면 그다음 낮은 잠수함이 함

   ── 조류 바뀌는 때 (21차, 2026-10-31 형님 결정: 차례마다 새로 굴리면 너무 어려움) ──
     조류는 「판 시간」 30초(config.js current.changeEvery)마다 바뀜. 판 시간 = 쪽지의 at (판 시계, 첫 차례 시작 = 0)
       차례는 앞 차례가 끝난 at 에서 바로 시작하니까 at = 「차례마다 (끝 at − 시작 at) 를 더한 값」과 똑같음 (빈틈 없음)
       심판은 performance.now 를 안 보고, 쪽지에 적힌 at 으로만 「언제 바뀌나」를 정함 → 같은 쪽지 기록이면 같은 조류
     조준 중엔 안 바뀜: 30초가 지났는데 지금 차례 잠수함이 아직 안 쐈으면 → 쏠 때까지 그대로 (쏜 어뢰는 옛 조류로 날아감)
       쏜 어뢰의 재생(날아가기 + 터진 자리 머묾 = end.t + torpedo.holdTime, 맵 밖이면 holdTime 의 절반)이 끝나는 판 시각 = shotDoneAt
       바뀌는 판 시각 = max(30초 표시, shotDoneAt)  — 표시 전에 이미 쐈어도 어뢰가 아직 날고 있으면 다 터진 뒤
       안 쏘고 차례가 끝나면(턴 넘기기·시간 끝) → 그 차례가 끝나는 at 에 바뀜 (다음 차례는 새 조류로 시작)
     다음 표시 = 「실제로 바뀐 판 시각 + 30초」 (늦게 바뀌었으면 그만큼 뒤로 밀림 → 바뀐 뒤엔 늘 30초를 온전히 씀)
     바뀌는 모양 = 조금씩, 방향과 세기를 따로 (형님 결정):
       세기: 0 ~ 5 에서 1칸 또는 2칸(current.maxStep) 오르거나 내림 (같은 주사위). 0·5 에서 멈춤 (넘어가거나 돌아가지 않음)
       방향: 그대로 / 시계 방향 90° / 반시계 방향 90° 중 하나 (확률 = current.turnChances, 기본 1/3씩). 한 번에 180° 뒤집기는 없음
       세기 0(잔잔)에서 바뀔 때는 방향을 4가지 중 주사위로 새로 (0 = 방향이 없으니까)
       current.stayChance 확률로 그대로 (기본 0)
     다음 조류는 「미리」 굴려 둠 (state.nextCurrent): 판 시작 때와 바뀔 때마다 그다음 값을 바로 굴려 적어 둠
       → 화면이 「다음 ▲3」처럼 다음 값을 보여 줄 수 있고(바뀌는 때는 안 보여 줌), 바뀔 때는 current = nextCurrent 그대로
     첫 차례 조류는 예전처럼 주사위 (current.firstRandom). 옛 「차례마다 새로 굴림」= turn.rollCurrent: true (어려운 모드)
     화면은 syncCurrent(상태, 판 시계) 로 「때가 지난 변경」을 처리만 시킴 — 바뀌는 판 시각은 쪽지 기록으로 정해져 있어서
       언제 불러도(몇 번 불러도) 결과가 같음. 「언제」 바뀌는지는 화면에 안 보여 줌 (형님 결정: 다음 값만)
   ========================================================= */
(function (root) {
  'use strict';

  /* =========================================================
     1. 같은 주사위 (번호를 넣으면 늘 같은 순서로 나오는 가짜 주사위 = mulberry32)
        상태 안에 「지금 주사위 번호(rng)」를 숫자 하나로 들고 있음 → 글자로 저장·전송 가능
        운에 맡기는 것(조류 등)은 전부 여기서만 굴림. 같은 번호에서 시작하면 두 컴퓨터가 같은 눈이 나옴
     ========================================================= */
  function random(state) {
    var a = (state.rng = (state.rng + 0x6D2B79F5) >>> 0);
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;     // 0 이상 1 미만
  }
  // 정수 주사위: lo ~ hi 중 하나
  function randomInt(state, lo, hi) { return lo + Math.floor(random(state) * (hi - lo + 1)); }

  // 조류 새로 굴리기 (방향 4가지 + 세기 0~5). (14차) 차례가 바뀔 때마다 여기서 굴림
  //   (2단계 게임규칙: 「매 턴 방향·세기 무작위」, 형님 확정) → 같은 주사위라 모든 컴퓨터에서 같은 조류
  //   (2026-10-28 형님 결정) 첫 차례도 무작위 (주사위 번호가 다르면 첫 조류도 다름). (21차) 그 뒤는 매 차례가 아니라 30초마다 stepCurrent (어려운 모드만 매 차례 여기서)
  var CURRENT_DIRS = ['left', 'right', 'up', 'down'];
  function rollCurrent(state, C) {
    var K = currentRules(C || {});
    state.current = { dir: CURRENT_DIRS[randomInt(state, 0, 3)], strength: randomInt(state, K.min, K.max) };
    return state.current;
  }
  // (21차) 조류 규칙 묶음 (config.js current / turn.rollCurrent)
  //   hard = 옛 어려운 모드(차례마다 새로 굴림), every = 몇 1/1000초마다 바뀌나 (0 = 안 바뀜), stay = 그대로 머물 확률, maxStep = 한 번에 최대 몇 칸
  function currentRules(C) {
    var K = C.current || {}, T = C.turn || {}, TC = K.turnChances || {};
    var min = Math.min(Math.max(Math.round(K.min != null ? K.min : 0), 0), 5);
    var max = Math.min(Math.max(Math.round(K.max != null ? K.max : 5), Math.max(min, 1)), 5);
    var maxStep = Math.min(Math.max(Math.round(K.maxStep != null ? K.maxStep : 2), 1), max);
    var ch = [TC.stay != null ? +TC.stay : 1, TC.cw != null ? +TC.cw : 1, TC.ccw != null ? +TC.ccw : 1].map(function (v) { return v > 0 ? v : 0; });
    if (!(ch[0] + ch[1] + ch[2] > 0)) ch = [1, 0, 0];
    return { hard: T.rollCurrent === true, every: Math.max(0, Math.round((K.changeEvery != null ? K.changeEvery : 30) * 1000)),
             stay: +K.stayChance || 0, min: min, max: max, maxStep: maxStep, turn: ch, firstRandom: K.firstRandom !== false };
  }
  // (21차) 조류 바꾸기 — 두 부분으로 나눠 둠 (따로 바꿔 끼우기 쉽게). 주사위 굴리는 순서: ① 방향 → ② 세기
  //   ① 방향 규칙: 세기 0 이면 4가지 중 새로, 아니면 그대로 / 시계 90° / 반시계 90° (turnChances). 180° 는 없음
  var CW = { up: 'right', right: 'down', down: 'left', left: 'up' }, CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
  function currentDirStep(state, cur, K) {
    if (!(cur.strength > 0) || !CW[cur.dir]) return CURRENT_DIRS[randomInt(state, 0, 3)];
    var ch = K.turn, r = random(state) * (ch[0] + ch[1] + ch[2]);
    if (r < ch[0]) return cur.dir;
    return r < ch[0] + ch[1] ? CW[cur.dir] : CCW[cur.dir];
  }
  //   ② 세기 규칙: 1 ~ maxStep 칸 오르거나 내림 (크기·위아래 둘 다 주사위) → min ~ max(0 ~ 5) 에서 멈춤
  function currentStrengthStep(state, s, K) {
    var size = randomInt(state, 1, K.maxStep), sign = random(state) < 0.5 ? -1 : 1;
    return Math.min(Math.max(s + sign * size, K.min), K.max);
  }
  // 다음 조류 미리 굴리기 (판 시작 때 + 바뀔 때마다). 시간으로 안 바뀌는 설정(어려운 모드·changeEvery 0)이면 null
  function rollNextCurrent(state, C) {
    var K = currentRules(C), cur = state.current;
    if (K.hard || !K.every) { state.nextCurrent = null; return null; }
    if (K.stay > 0 && random(state) < K.stay) state.nextCurrent = { dir: cur.dir, strength: cur.strength };
    else {
      var d = currentDirStep(state, cur, K);                     // ① 방향
      state.nextCurrent = { dir: d, strength: currentStrengthStep(state, cur.strength, K) };   // ② 세기
    }
    return state.nextCurrent;
  }
  // 조류 한 번 바꾸기 (판 시각 when 에): 지금 = 미리 굴려 둔 다음 값 → 그다음 값을 또 미리 굴림
  function stepCurrent(state, when, C) {
    var K = currentRules(C), cc = state.currentClock, cur = state.current;
    var from = { dir: cur.dir, strength: cur.strength };
    var to = state.nextCurrent || rollNextCurrent(state, C) || from;
    state.current = { dir: to.dir, strength: to.strength };
    cc.changes++;
    cc.lastAt = when;
    cc.nextAt = when + K.every;                          // 다음 표시 = 실제로 바뀐 때 + 30초
    cc.history.push({ at: when, from: from, to: { dir: to.dir, strength: to.strength } });
    rollNextCurrent(state, C);
    return state.current;
  }
  // (21차) 판 시각 at 까지 「때가 된」 조류 변경 처리. 쏘고 재생이 끝난 뒤(max(표시, shotDoneAt))에만 — 안 쐈으면 기다림
  //   돌려줌: 이번에 바뀌었으면 마지막 변경 기록, 아니면 null. 화면이 언제 불러도 바뀌는 판 시각은 같음 (쪽지 기록으로 정해짐)
  function syncCurrent(state, at, C) {
    var K = currentRules(C), cc = state.currentClock, t = state.turn, out = null;
    if (K.hard || !cc || cc.nextAt == null || at == null || !isFinite(at) || state.over) return null;
    while (t.fired && t.shotDoneAt != null) {
      var when = Math.max(cc.nextAt, t.shotDoneAt);
      if (when > at) break;
      stepCurrent(state, when, C);
      out = cc.history[cc.history.length - 1];
    }
    return out;
  }
  // (21차) 쏜 어뢰의 화면 재생 길이 (1/1000초) = 날아간 시간 + 터진 자리 머묾 (torpedo.js 와 같은 계산)
  function shotPlayMs(shot, C) {
    var T = C.torpedo || {}, hold = T.holdTime || 0;
    return Math.round((shot.end.t + (shot.end.kind === 'out' ? hold / 2 : hold)) * 1000);
  }

  /* =========================================================
     2. 처음 상태 만들기
     ========================================================= */
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  // config = window.GAME_CONFIG, seed = 주사위 시작 번호 (온라인 때는 서버가 정해서 모두에게 똑같이 나눠 줌)
  // (19차) picks = 캐릭터 고르기 쪽지 묶음 [{ type:'pick', subId, charId }] (없어도 됨). 고른 캐릭터는 잠수함에 이름표처럼 적어 두기만 함
  //   (지금은 판 규칙·숫자에 안 씀 — 모두 config.js character 그대로). 온라인 때는 서버가 모두의 쪽지를 모아 같은 판을 만듦
  function createState(config, seed, picks) {
    var C = config;
    if (seed == null) seed = C.seed || 1;
    var pickOf = {};
    (picks || []).forEach(function (p) { if (p && p.type === 'pick') pickOf[p.subId] = p.charId; });
    var subs = C.subs.map(function (s) {
      var o = copy(s);
      o.charId = pickOf[s.id] || null;             // (19차) 고른 캐릭터 (컴퓨터 상대처럼 안 고른 잠수함은 null)
      o.team = s.team || s.id;                     // 팀 이름 (같은 팀끼리 한 편). 개인전이면 잠수함마다 다른 팀
      o.hp = clamp(Math.round(s.hp), 0, 100);
      o.sunk = o.hp <= 0;                          // 격침됐나
      o.move = C.movement.gaugeStart;              // 이동 게이지 (0~1). 잠수함마다 따로
      o.delay = 0;                                 // (2026-10-28) 줄 서기 DELAY 점수 — 판 끝까지 쌓이기만 함
      o.lastTurn = -1;                             // 마지막으로 차례를 끝낸 턴 번호 (점수가 같을 때 「먼저 끝낸 쪽」 가리기. -1 = 아직 안 함)
      return o;
    });
    // 처음 순서: config.js turnOrder 가 있으면 그 순서, 없으면 잠수함 적힌 순서 (지금은 나 → 상대, 팀전이면 팀이 번갈아 적혀 있음)
    //   (2026-10-28) 이제 차례는 DELAY 가 낮은 순서로 정해지고, 이 순서는 「점수도 같고 둘 다 아직 안 했을 때」 가리는 데만 씀
    var order = (C.turnOrder || subs.map(function (s) { return s.id; })).slice();
    var active = C.activeSubId || order[0];
    var state = {
      seed: seed >>> 0,
      picks: (picks || []).slice(),               // (19차) 판을 만든 캐릭터 고르기 쪽지 (같은 seed + 같은 picks + 같은 쪽지 = 같은 판)
      rng: seed >>> 0,                             // 지금 주사위 번호 (굴릴 때마다 바뀜)
      subs: subs,
      current: { dir: C.current.dir, strength: clamp(Math.round(C.current.strength || 0), currentRules(C).min, currentRules(C).max) },
      // (21차) 조류 시계: nextAt = 다음 30초 표시(판 시각), changes = 바뀐 횟수, history = 바뀐 기록 [{ at, from, to }]
      //   어려운 모드(turn.rollCurrent: true)나 changeEvery 0 이면 nextAt = null (시간으로는 안 바뀜)
      currentClock: { nextAt: (currentRules(C).hard || !currentRules(C).every) ? null : currentRules(C).every, changes: 0, lastAt: 0, history: [] },
      // 차례 정보 (14차): 순서표·지금 몇 번째·지금 차례 잠수함·턴 번호
      //   + 시계(limit = 한 차례 시간, startAt·deadline = 시작·마감 시각, 전부 판 시계 1/1000초) + 남은 발사 수·쐈나(쏜 시각)
      //   (2026-10-28) number = 판 시작부터 몇 번째 차례인가 (차례마다 +1), streak = 지금 잠수함이 연속 몇 번째 차례인가,
      //   extraDelay = 이번 차례에 시간 말고 더 붙을 DELAY 점수 (config.js delay.cost, 지금은 0)
      turn: { order: order, index: Math.max(0, order.indexOf(active)), activeId: active, number: 1, streak: 1,
              limit: turnLimitMs(C), startAt: 0, deadline: 0, shotsLeft: 0, fired: false, firedAt: null, shotDoneAt: null, extraDelay: 0 },
      over: null,                                  // 판 끝 = { winner: 이긴 팀 이름 (모두 격침이면 null = 비김), at }
      nextCurrent: null,                           // (21차) 다음에 바뀔 조류 (미리 굴려 둠). 어려운 모드면 null
      log: []                                      // 받은 주문서 기록 (같은 seed 로 처음부터 다시 돌리면 똑같은 판이 나옴)
    };
    beginTurn(state, 0, C, true);                  // 첫 차례 시작 (판 시계 0). (2026-10-28) 첫 차례도 조류를 주사위로 굴림
    rollNextCurrent(state, C);                     // (21차) 다음 조류 미리 굴려 둠 (state.nextCurrent, 화면 「다음 ▲3」)
    return state;
  }

  // 한 차례 시간 (1/1000초) = config.js turn.timeLimit (초). 2단계 게임규칙 「제한시간 20초, 다 되면 자동으로 턴 넘김」
  function turnLimitMs(C) { return Math.round(((C.turn && C.turn.timeLimit) || 20) * 1000); }

  function getSub(state, id) {
    for (var i = 0; i < state.subs.length; i++) if (state.subs[i].id === id) return state.subs[i];
    return null;
  }

  /* =========================================================
     3. 차례 진행 (14차)
        nextTurn: (2026-10-28) 「살아 있는」 잠수함 중 DELAY 가 가장 낮은 잠수함으로 넘김 (줄 서기, 맨 위 설명. 격침된 잠수함은 빠짐)
                  1:1·개인전·팀전 모두 같은 방법. 예전 「순서표대로 번갈아」는 없어짐
        beginTurn: 차례 시작 준비 — 그 잠수함 이동 게이지 가득(2단계 규칙 「매 턴 가득 참」), 마감 시각, 발사 1번
                   조류: 첫 차례만 주사위 (21차). 어려운 모드(turn.rollCurrent: true)면 예전처럼 매 차례 새로 굴림
     ========================================================= */
  function beginTurn(state, at, C, first) {
    var t = state.turn, s = getSub(state, t.activeId), K = currentRules(C);
    if (s) s.move = C.movement.gaugeStart;
    if (K.hard || (first && K.firstRandom)) rollCurrent(state, C);   // (21차) 첫 차례만 주사위 / 어려운 모드 = 매 차례 (옛 2026-10-28 규칙)
    t.limit = turnLimitMs(C);
    t.startAt = at;
    t.deadline = at + t.limit;
    t.shotsLeft = 1;                               // 한 차례에 한 발 (나중에 아이템 「2연발」이 이 숫자를 2로)
    t.fired = false;                               // 다 쐈으면 true → 그 차례엔 발사만 잠김 (이동·시계는 그대로, 2026-10-28)
    t.firedAt = null;
    t.shotDoneAt = null;                           // (21차) 쏜 어뢰 재생이 끝나는 판 시각 (조류 변경을 여기까지 미룸)
    t.extraDelay = 0;
  }
  // 아직 시간이 남았나 (at 이 없는 쪽지는 검사 안 함 — 확인용·옛 기록)
  function inTime(state, at) { return at == null || !(at > state.turn.deadline); }
  // (2026-10-28) 마감 뒤에 온 발사라도: 마감 전에 누르기 시작했고(holdAt), 누른 시간이 게이지 한 번 차는 시간 + 조금 이하면 받아 줌
  //   누른 시간이 그보다 길면 거절 = 게이지는 sweepTime 이면 저절로 쏘니까 그 이상은 있을 수 없음 (온라인 때 holdAt 속이기 막기)
  function holdInTime(state, at, holdAt, C) {
    var t = state.turn;
    if (at == null || holdAt == null || !isFinite(holdAt)) return false;
    if (holdAt > t.deadline || holdAt < t.startAt || holdAt > at) return false;   // 마감 뒤에 누르기 시작 = 안 됨
    var F = C.fire || {};
    var maxHold = Math.round((F.sweepTime || 1.6) * 1000) + (F.holdSlackMs != null ? F.holdSlackMs : 250);
    return at - holdAt <= maxHold;
  }
  /* ---------- 줄 서기 (DELAY) — 2026-10-28 형님 결정 (맨 위 설명) ---------- */
  function delayRules(C) {
    var D = C.delay || {};
    return { perSecond: D.perSecond != null ? D.perSecond : 10, maxConsecutive: D.maxConsecutive || 2, cost: D.cost || {} };
  }
  // 쓴 시간(1/1000초) → DELAY 점수. 1초 = 10점이면 0.1초 = 1점 (반올림 → 늘 정수)
  function delayPoints(ms, C) { return Math.round(Math.max(0, ms) / 1000 * delayRules(C).perSecond); }

  // 줄 세우기 비교: ① DELAY 낮은 쪽 ② 같으면 지난 차례를 먼저 끝낸 쪽(lastTurn 작은 쪽, 한 번도 안 했으면 -1 = 가장 먼저)
  //   ③ 그래도 같으면(둘 다 아직 안 함) config.js turnOrder 순서. → 늘 하나로 정해짐 (같은 쪽지 기록이면 어느 컴퓨터든 같은 순서)
  //   ov = { id, delay, lastTurn } 한 잠수함만 점수를 바꿔 끼워 봄 (화면 미리보기: 「지금 차례 잠수함이 지금 끝내면」). 없으면 진짜 점수
  function queueOrder(state, ov) {
    var order = state.turn.order;
    var rank = function (s) { var i = order.indexOf(s.id); return i < 0 ? order.length : i; };
    var d = function (s) { return ov && ov.id === s.id ? ov.delay : s.delay; };
    var l = function (s) { return ov && ov.id === s.id ? ov.lastTurn : s.lastTurn; };
    return state.subs.filter(function (s) { return !s.sunk; }).sort(function (a, b) {
      if (d(a) !== d(b)) return d(a) - d(b);
      if (l(a) !== l(b)) return l(a) - l(b);
      return rank(a) - rank(b);
    });
  }
  // 줄에서 다음 차례 고르기: 맨 앞. 단, 맨 앞이 지금 잠수함이고 이미 연속 maxConsecutive(2)번 했으면 그다음 사람 (안전장치)
  function pickFrom(list, state, C) {
    var t = state.turn;
    if (!list.length) return null;
    if (list[0].id === t.activeId && t.streak >= delayRules(C).maxConsecutive && list.length > 1) return list[1];
    return list[0];
  }
  // 차례를 끝낸 뒤 다음 차례 정하기 (DELAY 는 apply 에서 먼저 더해 둠). 턴 번호 +1, 연속 횟수 세기
  function nextTurn(state, C) {
    var t = state.turn, s = pickFrom(queueOrder(state), state, C || {});
    if (!s) return null;                           // 살아 있는 잠수함이 없음
    t.streak = s.id === t.activeId ? t.streak + 1 : 1;
    t.number++;
    t.index = Math.max(0, t.order.indexOf(s.id));
    t.activeId = s.id;
    return s.id;
  }
  // 화면용 「다음 차례 줄」 미리보기: now(판 시계)를 주면 지금 차례 잠수함은 「지금 끝내면」 점수로 셈 (쓴 시간 + 덤)
  //   돌려줌: [{ id, delay, next(다음 차례인가), active(지금 차례인가) }, ...] — 다음 차례가 맨 앞, 그 뒤는 DELAY 낮은 순
  //   (그 뒤 차례들은 그때 쓸 시간에 따라 바뀌니까 「지금 점수로 줄 선 모양」일 뿐)
  function queue(state, C, now) {
    var t = state.turn, ov = null, a = getSub(state, t.activeId);
    if (a && now != null && !state.over) ov = { id: a.id, delay: projectedDelay(state, C, now), lastTurn: t.number };
    var list = queueOrder(state, ov), first = pickFrom(list, state, C);
    if (first && list[0] !== first) { list.splice(list.indexOf(first), 1); list.unshift(first); }
    return list.map(function (s) {
      return { id: s.id, delay: ov && ov.id === s.id ? ov.delay : s.delay, next: s === first, active: s.id === t.activeId };
    });
  }
  // 지금 차례 잠수함이 판 시계 now 에 차례를 끝내면 될 DELAY (화면 DLY 칸이 내 차례 동안 실시간으로 올라가게)
  function projectedDelay(state, C, now) {
    var t = state.turn, a = getSub(state, t.activeId);
    if (!a) return 0;
    return a.delay + delayPoints(Math.min(Math.max(0, now - t.startAt), t.limit), C) + Math.round(t.extraDelay || 0);
  }
  // 아직 살아 있는 팀 목록 (나중에 「한 팀만 남으면 끝」 판정에 씀)
  function aliveTeams(state) {
    var seen = {}, list = [];
    state.subs.forEach(function (s) { if (!s.sunk && !seen[s.team]) { seen[s.team] = true; list.push(s.team); } });
    return list;
  }

  /* =========================================================
     4. 궤도 곡선 (궤도 판 화면 main.js 와 어뢰 계산이 같은 곡선을 씀)
        출발 = 잠수함 쪽 끝(가로 0), 세로 가운데(50 %) → 점1 → 점2 → 점3 을 「정확히」 지나는 부드러운 곡선
        (자연 3차 스플라인). 가로 = 거리 칸, 세로 = 판 높이 % (맨 위 0, 맨 아래 100). 곡선은 맨 끝 점에서 끝남
     ========================================================= */
  function curveSpline(points) {
    var k = [[0, 50]];
    points.forEach(function (p) {
      var x = Math.max(p[0], k[k.length - 1][0] + 0.2);       // 가로가 겹치면 계산이 안 되므로 살짝 띄움
      k.push([x, p[1]]);
    });
    var n = k.length - 1, M = [], c = [], d = [], i;
    M[0] = M[n] = 0;                                            // 양 끝은 휘는 정도 0 (자연 스플라인)
    // 가운데 점들의 휘는 정도 구하기 (세 줄짜리 연립방정식)
    c[0] = 0; d[0] = 0;
    for (i = 1; i < n; i++) {
      var h0 = k[i][0] - k[i - 1][0], h1 = k[i + 1][0] - k[i][0];
      var rhs = 6 * ((k[i + 1][1] - k[i][1]) / h1 - (k[i][1] - k[i - 1][1]) / h0);
      var den = 2 * (h0 + h1) - h0 * c[i - 1];
      c[i] = h1 / den;
      d[i] = (rhs - h0 * d[i - 1]) / den;
    }
    for (i = n - 1; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
    return { k: k, M: M };
  }
  // 거리 칸 x 에서의 곡선 높이 (판 높이 %)
  function curveY(sp, x) {
    var k = sp.k, M = sp.M, n = k.length - 1, i = 0;
    var seg = function (i) { return k[i + 1][0] - k[i][0]; };
    if (x >= k[n][0]) {
      // 맨 끝 점 뒤 (2026-10-28): 판에는 곡선이 끝 점에서 끝나지만(그림은 거기까지만), 순풍 조류로 어뢰가 더 멀리 가면
      //   끝 점에서 「마지막 기울기 그대로 곧게」 계속 감 (자연 스플라인 끝은 휘는 정도 0 이라 이게 가장 자연스러운 연장)
      var hn = seg(n - 1);
      var endSlope = (k[n][1] - k[n - 1][1]) / hn + hn * (M[n - 1] + 2 * M[n]) / 6;
      return k[n][1] + endSlope * (x - k[n][0]);
    }
    while (i < n - 1 && x > k[i + 1][0]) i++;
    var h = seg(i), t = x - k[i][0];
    var b = (k[i + 1][1] - k[i][1]) / h - h * (2 * M[i] + M[i + 1]) / 6;
    return k[i][1] + b * t + M[i] / 2 * t * t + (M[i + 1] - M[i]) / (6 * h) * t * t * t;
  }

  // 궤도 점 검사: 가로 = 캐릭터 고정 자리, 세로 = 노란 한계 상자 위·아래 변 안 (화면이 보낸 값이 이상해도 규칙대로)
  function cleanPoints(points, ch) {
    var lim = ch.limit;
    return ch.padPoints.map(function (base, i) {
      var p = points && points[i], y = p ? +p[1] : base[1];
      if (!isFinite(y)) y = base[1];
      return [clamp(base[0], lim.left, lim.right), clamp(y, lim.top, lim.bottom)];
    });
  }

  /* =========================================================
     5. 이동 한 걸음 (조이스틱이 1화면마다 하던 계산을 그대로)
        ① 게이지 남은 만큼까지만 ② 맵 안에 가둠(잠수함 크기 + 여백) ③ 실제로 움직인 거리만큼 게이지 깎음
     ========================================================= */
  function moveStep(sub, dx, dy, C) {
    var M = C.movement, len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0) || sub.move <= 0) return 0;
    var maxLen = M.speed * 0.05;                                // 한 걸음 최대 = 끝까지 민 조이스틱 0.05초어치 (이상하게 큰 걸음 막기)
    var want = Math.min(len, maxLen);
    var dist = Math.min(want, sub.move * C.character.moveDistance);
    var ox = sub.x, oy = sub.y;
    var minX = M.subHalfW + M.marginX, maxX = C.world.w - M.subHalfW - M.marginX;
    var minY = M.subHalfH + M.marginTop, maxY = C.world.h - M.subHalfH - M.marginBottom;
    sub.x = clamp(sub.x + dx / len * dist, minX, maxX);
    sub.y = clamp(sub.y + dy / len * dist, minY, maxY);
    var moved = Math.sqrt((sub.x - ox) * (sub.x - ox) + (sub.y - oy) * (sub.y - oy));
    if (moved > 0) {
      sub.move = Math.max(0, sub.move - moved / C.character.moveDistance);
      if (sub.move < 1e-6) sub.move = 0;
    }
    return moved;
  }

  /* =========================================================
     6. 어뢰 한 발 전체 계산 (화면 없이, 일정한 작은 걸음으로)
        예전엔 화면이 그려질 때마다 조금씩 날리면서 데미지를 줬음 → 컴퓨터 빠르기에 따라 걸음이 달라질 수 있었음
        이제는 쏘는 순간 「맵 simStep(6)씩」 걸음으로 끝까지 한 번에 계산 → 어느 컴퓨터든 같은 결과
        계산 방법(곡선·1칸=맵 48·세로 범위·빠르기·스침·폭발·자기 데미지)은 예전 torpedo.js 와 똑같음
        (2026-10-28 형님 결정) 조류만 바뀜: 게이지 = 날아가는 시간, 왼쪽·오른쪽 조류 = 빠르기(순풍 멀리·역풍 짧게), 위·아래 조류 = 예전처럼 밂
        돌려주는 결과:
          samples = 날아간 길 [[시간(초), x, y], ...] (화면이 이걸 따라 어뢰를 움직임)
          events  = 데미지 목록 [{ t: 몇 초에, id, kind: 'graze'(스침)|'blast'(폭발), dmg, dist, hpAfter }]
          end     = { kind: 'boom'(펑) | 'out'(맵 왼쪽·오른쪽 밖 / 안전장치), t, x, y, u }   sunk = 이번에 격침된 잠수함들
                    (2026-10-28) 맵 위·아래 밖은 'out' 이 아님 — 계속 날아감. 그래서 'boom' 의 y 가 맵 밖(0 미만·600 초과)일 수도 있음
     ========================================================= */
  var CURRENT_VEC = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };   // 조류가 미는 쪽 (화면 기준, 아래가 +)

  function simulateShot(state, shooter, points, distance, C) {
    var T = C.torpedo, M = C.movement, WPU = C.pad.worldPerUnit;
    var STEP = T.simStep || 6;
    var dir = shooter.facing === 'left' ? -1 : 1;
    var cur = state.current || {}, cv = CURRENT_VEC[cur.dir] || [0, 0], str = cur.strength || 0;
    // (2026-10-28 형님 결정, 원작 확인) 조류:
    //   왼쪽·오른쪽 조류 = 어뢰 「빠르기」를 바꿈 — 어뢰가 가는 쪽과 같으면(순풍) 빨라져서 더 멀리, 반대면(역풍) 느려져서 짧게
    //     빠르기 배율 = 1 + (같은 쪽 +1 / 반대 −1) × 세기 × currentSpeedFactor  (0.05 → 세기 5 = ±25 %)
    //     예전처럼 옆으로 미는 힘은 없음 (빠르기로 바뀜)
    //   위·아래 조류 = 예전 그대로 날아간 시간만큼 위·아래로 점점 더 밂 (currentPush × 세기, 맵/초)
    var speedK = Math.max(0.1, 1 + cv[0] * dir * str * (T.currentSpeedFactor || 0));
    var vy = cv[1] * str * T.currentPush;               // 위·아래로 미는 빠르기 (맵/초)
    var sp = curveSpline(points);
    var x0 = shooter.x + dir * M.subHalfW, y0 = shooter.y;   // 잠수함 앞코
    var target = Math.max(0, distance);

    // 곡선 높이(%) → 맵 세로 거리 (판 가운데 50 % = 잠수함 높이, 맨 위·아래 = ±verticalRange)
    function offY(u) { return (curveY(sp, u) - 50) / 50 * T.verticalRange; }
    // 곡선을 따라 맵 len 만큼 가면 거리 칸이 얼마나 느나 (휘는 곳에서도 곡선 길이로 일정하게 = 예전과 같은 계산)
    function duFor(u, len) {
      var slope = (offY(u + 0.02) - offY(u)) / (0.02 * WPU);
      return len / Math.sqrt(1 + slope * slope) / WPU;
    }

    // (2026-10-28) 게이지가 정하는 것 = 「날아가는 시간」. 조류가 없을 때 판 거리 눈금 그대로(target 칸)에서 터지는 시간
    //   = 곡선을 따라 target 칸까지 기본 빠르기(T.speed)로 가는 시간. 먼저 조류 없이 걸음 그대로 재 봄 (아래 날기와 같은 걸음)
    var STEP_T = STEP / T.speed, flightTime = 0;
    for (var pu = 0; pu < target - 1e-9;) {
      var pdu = duFor(pu, STEP);
      if (pu + pdu >= target) { flightTime += STEP_T * (target - pu) / pdu; break; }
      pu += pdu; flightTime += STEP_T;
    }

    // 데미지는 계산용 체력 복사본에 먼저 적용 (스침으로 격침된 잠수함은 폭발 데미지를 또 안 받음 — 예전과 같음)
    var hp = {};
    state.subs.forEach(function (s) { hp[s.id] = s.hp; });
    var events = [], sunk = [];
    function hurt(id, dmg, kind, t, dist) {
      hp[id] = clamp(Math.round(hp[id] - dmg), 0, 100);
      events.push({ t: t, id: id, kind: kind, dmg: dmg, dist: dist == null ? null : Math.round(dist), hpAfter: hp[id] });
      if (hp[id] <= 0 && sunk.indexOf(id) < 0) sunk.push(id);
    }

    var u = 0, time = 0, x = x0, y = y0, end = null;
    var startAng = Math.atan2(offY(0.05) - offY(0), dir * 0.05 * WPU);   // 출발할 때 어뢰 머리 방향
    var samples = [[0, x, y]];
    var grazed = {}, inside = {};
    var rx = M.subHalfW + T.hitPad, ry = M.subHalfH + T.hitPad;

    if (target <= 0) end = { kind: 'boom' };            // 거리 0 = 바로 앞에서 펑
    while (!end) {
      // 한 걸음 = 같은 시간(STEP_T). 그동안 곡선을 따라 「맵 STEP × 빠르기 배율」 만큼 나아감
      //   → 곡선 모양(판에 그린 길)은 그대로 따라가고, 순풍이면 같은 시간에 곡선 위를 더 멀리(거리 칸 u 가 더 빨리 늚), 역풍이면 덜
      //   정한 날아가는 시간(flightTime)이 되면 그 자리에서 펑. 조류 없으면 u = target 에서 펑 (판 눈금 그대로)
      //   (빠르기 배율이 커도 한 걸음은 맵 STEP × 1.25 정도라 잠수함(가로 76)을 건너뛰지 않음)
      var dt = STEP_T, done = false;
      if (time + dt >= flightTime) { dt = Math.max(0, flightTime - time); done = true; }
      u += duFor(u, STEP * speedK * (dt / STEP_T));
      time += dt;
      x = x0 + dir * u * WPU;
      y = y0 + offY(u) + vy * time;                     // 위·아래 조류: 날아간 시간만큼 점점 더 밀림
      samples.push([time, x, y]);

      // 스치기: 잠수함 몸(타원)에 들어갔다가 빠져나올 때 깎음 (쏜 잠수함·이미 스친·격침된 잠수함은 빼고)
      state.subs.forEach(function (s) {
        if (s.id === shooter.id || grazed[s.id] || hp[s.id] <= 0) return;
        var ddx = (x - s.x) / rx, ddy = (y - s.y) / ry;
        if (ddx * ddx + ddy * ddy <= 1) inside[s.id] = true;
        else if (inside[s.id]) { grazed[s.id] = true; hurt(s.id, T.grazeDamage, 'graze', time); }
      });

      // 맵 왼쪽·오른쪽 끝 밖 → 연기만 (데미지 없음, 예전 그대로)
      if (x < 0 || x > C.world.w) { end = { kind: 'out' }; break; }
      // (2026-10-28 형님 결정) 맵 위·아래 끝은 나가도 안 사라짐 → 곡선(+ 조류)대로 계속 날아가다 돌아오고, 정한 거리에서 그대로 펑
      //   (위·아래 밖에서 터져도 폭발 데미지는 거리대로 — 맵 끝 가까이 있는 잠수함은 범위에 걸릴 수 있음)
      // 안전장치: 혹시라도 끝없이 날지 않게 「날아간 시간 maxFlightTime 초」 또는 「맵 위·아래 밖으로 maxOutside 넘게」면
      //   거기서 연기만 남기고 끝 (데미지 없음). 지금 궤도 판으로 나올 수 있는 길은 이 값에 한참 못 미침 (node 로 확인)
      var outLimit = T.maxOutside != null ? T.maxOutside : C.world.h;
      if (time > (T.maxFlightTime || 15) || y < -outLimit || y > C.world.h + outLimit) { end = { kind: 'out', lost: true }; break; }
      if (done) end = { kind: 'boom' };
    }

    if (end.kind === 'out') {
      x = clamp(x, 0, C.world.w); y = clamp(y, 0, C.world.h);
    } else {
      // 폭발 범위 안 잠수함 전부 (내 잠수함도): 한가운데 = maxDamage, 범위 끝 = 0 (일직선으로 줄어듦)
      state.subs.forEach(function (s) {
        if (hp[s.id] <= 0) return;
        var d = Math.sqrt((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y));
        if (d >= T.blastRadius) return;
        var dmg = Math.round(T.maxDamage * (1 - d / T.blastRadius));
        if (dmg > 0) hurt(s.id, dmg, 'blast', time, d);
      });
    }
    end.t = time; end.x = x; end.y = y; end.u = u;

    return {
      owner: shooter.id, dir: dir, start: { x: x0, y: y0 }, startAng: startAng,
      target: target, flightTime: flightTime, speedK: speedK, current: { dir: cur.dir, strength: cur.strength || 0 },
      samples: samples, events: events, end: end, sunk: sunk
    };
  }

  /* =========================================================
     7. 주문서 받기 — 행동은 전부 여기 한 곳으로만 들어옴
        돌려주는 값: { ok: true/false, why: 안 된 이유, ...결과 } — 화면은 이걸 보고 그림만 바꿈
     ========================================================= */
  function apply(state, action, C) {
    if (!action || typeof action !== 'object') return { ok: false, why: '주문서 없음' };
    if (state.over) return { ok: false, why: '판 끝남' };
    var sub = getSub(state, action.subId);
    if (!sub) return { ok: false, why: '없는 잠수함' };
    if (sub.id !== state.turn.activeId) return { ok: false, why: '차례 아님' };
    var t = state.turn, res;
    var at = action.at == null || !isFinite(+action.at) ? null : +action.at;

    var holdAt = action.holdAt == null || !isFinite(+action.holdAt) ? null : +action.holdAt;
    if (action.type === 'move' || action.type === 'fire') {
      if (sub.sunk) return { ok: false, why: '격침됨' };           // 격침된 잠수함은 못 움직이고 못 쏨
      // 마감 시각 뒤에 온 쪽지는 거절 — 단, 마감 전에 누르기 시작한 발사는 받아 줌 (2026-10-28 형님 결정, holdInTime)
      if (!inTime(state, at) && !(action.type === 'fire' && holdInTime(state, at, holdAt, C))) return { ok: false, why: '시간 끝' };
    }
    // (21차) 받은 쪽지의 at 까지 때가 된 조류 변경 먼저 (쏜 뒤 재생이 끝났고 30초가 지났으면). 안 쏜 차례면 아무 일 없음
    //   (바뀌는 판 시각은 쪽지 기록으로 정해져 있어서, 거절될 쪽지에서 불려도 결과는 같음)
    syncCurrent(state, at, C);

    if (action.type === 'move') {
      // 게이지가 바닥이면 돌아보기도 안 됨 (예전 조이스틱과 같음)
      if (sub.move <= 0) return { ok: false, why: '이동 게이지 없음' };
      if (action.facing === 'left' || action.facing === 'right') sub.facing = action.facing;
      var moved = 0;
      (action.steps || []).forEach(function (st) { moved += moveStep(sub, +st[0] || 0, +st[1] || 0, C); });
      t.extraDelay += moved * (+delayRules(C).cost.move || 0);   // (나중 자리) 움직인 거리만큼 DELAY 덤 — 지금 config 값 0
      res = { ok: true, type: 'move', subId: sub.id, x: sub.x, y: sub.y, facing: sub.facing, move: sub.move, moved: moved };

    } else if (action.type === 'fire') {
      // 한 차례에 한 발 (쏜 뒤 이동은 됨 — 2026-10-28 형님 결정. 두 번째 발사만 거절)
      if (t.fired || t.shotsLeft <= 0) return { ok: false, why: '이미 쏨' };
      var ch = C.character;
      var points = cleanPoints(action.points, ch);
      var distance = clamp(Math.round(+action.distance || 0), 0, ch.limit.right);   // 거리는 정수 칸 (궤도 판 구석 거리 숫자와 같음)
      var shot = simulateShot(state, sub, points, distance, C);
      // 결과를 진짜 상태에 바로 적용 (화면은 시간에 맞춰 천천히 보여 줌)
      shot.events.forEach(function (ev) { getSub(state, ev.id).hp = ev.hpAfter; });
      shot.sunk.forEach(function (id) { getSub(state, id).sunk = true; });
      t.shotsLeft--;
      t.extraDelay += +delayRules(C).cost.fire || 0;             // (나중 자리) 한 발 쏠 때 DELAY 덤 — 지금 config 값 0
      if (t.shotsLeft <= 0) { t.fired = true; t.firedAt = at != null ? at : t.startAt; }   // 다 쐈음 (시계는 계속 감)
      t.shotDoneAt = (at != null ? at : t.startAt) + shotPlayMs(shot, C);   // (21차) 이 어뢰가 다 터지는 판 시각 → 조류 변경은 그 뒤
      // 한 팀만 남았으면(또는 모두 격침) 판 끝 — 결과는 지금 정해지고, 화면은 어뢰 재생이 끝난 뒤 보여 줌
      var teams = aliveTeams(state);
      if (teams.length <= 1) state.over = { winner: teams.length ? teams[0] : null, at: t.firedAt };
      res = { ok: true, type: 'fire', subId: sub.id, points: points, distance: distance, shot: shot, over: state.over, late: !inTime(state, at) };

    } else if (action.type === 'endTurn' || action.type === 'timeout') {
      // 턴 넘기기 (버튼·Tab·컴퓨터 상대·내 어뢰에 내가 격침됨) / 시간 끝 (마감 시각이 지났을 때만 받음 — 쏜 뒤에도 똑같이)
      //   격침된 잠수함도 자기 차례를 넘길 수는 있음 (내가 쏜 어뢰에 내가 격침된 뒤 재생이 끝났을 때)
      if (action.type === 'timeout' && at != null && at < t.deadline) return { ok: false, why: '아직 시간 남음' };
      // 다음 차례 시작 시각: 쪽지의 at (없으면 시간 끝 = 마감 시각, 턴 넘기기 = 이번 차례 시작 시각 → 그래도 늘 같은 결과)
      var startAt = at != null ? Math.max(at, t.startAt) : (action.type === 'timeout' ? t.deadline : t.startAt);
      // (2026-10-28 형님 결정) 줄 서기: 이번 차례에 쓴 시간만큼 DELAY 를 쌓음 (1초 = 10점, 판 끝까지 안 지움)
      //   쓴 시간 = 끝낸 쪽지 at − 차례 시작 at, 한 차례 시간(20초)보다 많이는 안 셈. 시간 끝은 늘 20초 전부
      //   (어뢰 재생 때문에 마감 뒤에 온 시간 끝도 20초 — 재생을 기다린 시간은 안 셈)
      var used = action.type === 'timeout' ? t.limit : clamp(startAt - t.startAt, 0, t.limit);
      var gained = delayPoints(used, C) + Math.round(t.extraDelay || 0);
      sub.delay += gained;
      sub.lastTurn = t.number;                     // 점수가 같을 때 「먼저 끝낸 쪽」 가리기용
      // (21차) 조류: 끝나는 at 까지 때가 된 변경 + 30초가 지났는데 아직 안 바뀌었으면(안 쏨·어뢰가 아직 날던 중) 지금 바꿈
      var curRes = null;
      if (!state.over) {
        curRes = syncCurrent(state, startAt, C);
        var cc = state.currentClock;
        if (!currentRules(C).hard && cc && cc.nextAt != null && startAt >= cc.nextAt) { stepCurrent(state, startAt, C); curRes = cc.history[cc.history.length - 1]; }
      }
      var from = sub.id, next = nextTurn(state, C);   // 다음 차례 = DELAY 가장 낮은 잠수함 (연속 2번까지)
      if (next) beginTurn(state, startAt, C, false);
      res = { ok: true, type: action.type, subId: from, activeId: t.activeId, number: t.number, streak: t.streak,
              used: used, gained: gained, delay: sub.delay,
              move: next ? getSub(state, next).move : 0, current: { dir: state.current.dir, strength: state.current.strength },
              deadline: t.deadline, currentChange: curRes };

    } else {
      return { ok: false, why: '모르는 주문서: ' + action.type };
    }

    state.log.push(copy(action));
    return res;
  }

  // 기록된 주문서를 처음부터 다시 돌리기 (같은 seed 면 똑같은 판이 나와야 함 — 확인·다시보기·서버 검증용)
  function replay(config, seed, actions, picks, until) {   // (19차) picks = 판을 만든 캐릭터 고르기 쪽지 (rs.picks)
    var st = createState(config, seed, picks);
    actions.forEach(function (a) { apply(st, a, config); });
    if (until != null) syncCurrent(st, until, config);   // (21차) 마지막 쪽지 뒤 판 시각 until 까지의 조류 변경도 (화면과 맞춰 보기)
    return st;
  }

  var Rules = {
    createState: createState, apply: apply, replay: replay, getSub: getSub,
    random: random, randomInt: randomInt, rollCurrent: rollCurrent, syncCurrent: syncCurrent, stepCurrent: stepCurrent, currentRules: currentRules,
    nextTurn: nextTurn, beginTurn: beginTurn, aliveTeams: aliveTeams,
    delayPoints: delayPoints, queue: queue, projectedDelay: projectedDelay,
    curveSpline: curveSpline, curveY: curveY, simulateShot: simulateShot, moveStep: moveStep
  };
  root.Rules = Rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;   // node 로 확인할 때
})(typeof window !== 'undefined' ? window : globalThis);
