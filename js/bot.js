/* =========================================================
   심해 포격전(가칭) — 컴퓨터 상대 (3단계 계획서 ③)
   쉽게 설명하면: 「사람처럼 쪽지를 내는 가짜 사람」입니다.
     - 사람과 똑같은 쪽지만 냄: 이동(move 걸음) · 발사(fire 점 3개 + 거리 + holdAt) · 턴 넘기기(endTurn)
       → 창구 Game.submit → 심판(rules.js)이 사람 쪽지와 똑같이 검사 (게이지·시계·한 발·마감 그대로)
       → 나중에 인터넷 상대나 서버 쪽 컴퓨터 상대가 이 자리에 그대로 들어올 수 있음
     - 생각하는 법 (머리 = 아래 1~4, 화면을 전혀 모름 → node 로 따로 돌려 볼 수 있음):
       ① 노릴 상대 고르기: 다른 팀 + 살아 있는 잠수함 전부를 후보로 (여러 명·팀전 그대로)
       ② 조준 찾기: 심판의 「어뢰 한 발 계산(simulateShot)」을 그대로 빌려서 미리 쏴 봄
          → 터진 자리가 목표에서 빗나간 만큼 거리·점 높이를 고쳐 다시 쏴 봄 (몇 번 반복 = 사람이 「조금 더 멀리, 조금 더 위로」 하듯)
          → 조류도 심판 계산 안에 들어 있어서 저절로 감안됨. 내 잠수함·우리 편이 다치는 조준은 크게 깎아서 안 고름
       ③ 어디서 쏠지: 지금 자리 + 이동 게이지·이동 시간 안에 갈 수 있는 자리 여러 곳에서 ②를 해 보고,
          「잘 맞는 조준 − 많이 움직이는 수고 − 사거리에 비해 너무 멀거나 너무 가까운 정도」가 가장 좋은 곳으로
       ④ 실력(난이도): 고른 조준에 일부러 손 떨림(점 높이·거리 오차)을 더함 → 쉬움·보통·어려움 (config.js bot)
     - 사람처럼 보이게 (손 = 아래 5): 잠깐 생각 → 1~2초 부드럽게 이동(조이스틱처럼 화면마다 걸음 쪽지) → 돌아보기
       → 잠깐 조준 → 발사를 누른 만큼 기다렸다가 쏨 → (재생이 끝나면) 시간·게이지가 남으면 살짝 비켜 섬 → 턴 넘기기
       20초 안에 넉넉히 끝냄. 시간이 모자라면 바로 쏘거나 넘김
   주사위: 컴퓨터 상대의 운(오차·생각 시간)은 심판 주사위(state.rng)와 「따로」 굴림 (아래 2 — 이유 설명)
   rules.js 다음에 불러야 함. 브라우저에서는 turn.js 다음 (Game.bots 자리에 들어감). node 에서는 require 로 머리만 씀
   ========================================================= */
(function (root) {
  'use strict';

  var R = root.Rules || (typeof require !== 'undefined' ? require('./rules.js') : null);

  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  /* =========================================================
     1. 난이도 값 읽기 (config.js bot). 없으면 아래 기본값
     ========================================================= */
  var DEFAULT_LEVELS = {
    easy:   { aimError: { pin: 12, dist: 2.4 }, currentSense: 0.4, thinkTime: [1.2, 2.0], aimTime: [0.8, 1.4], moveTime: 2.0, wander: 0.3 },
    normal: { aimError: { pin: 8,  dist: 1.8 }, currentSense: 0.8, thinkTime: [0.8, 1.4], aimTime: [0.5, 1.0], moveTime: 2.0, wander: 0.5 },
    hard:   { aimError: { pin: 3,  dist: 0.7 }, currentSense: 1,    thinkTime: [0.5, 0.9], aimTime: [0.3, 0.6], moveTime: 2.5, wander: 0.7 }
  };
  function levelOf(C, name) {
    var B = C.bot || {}, lv = name || B.level || 'normal';
    var L = (B.levels && B.levels[lv]) || DEFAULT_LEVELS[lv] || DEFAULT_LEVELS.normal;
    return {
      name: lv, aimError: L.aimError || { pin: 0, dist: 0 }, currentSense: L.currentSense != null ? L.currentSense : 1,
      thinkTime: L.thinkTime || [1, 1], aimTime: L.aimTime || [0.6, 0.6], moveTime: L.moveTime || 2, wander: L.wander || 0,
      panicTime: B.panicTime != null ? B.panicTime : 4,       // 마감까지 이만큼(초)보다 적게 남았는데 아직 안 쐈으면 → 바로 조준·발사
      endTime: B.endTime != null ? B.endTime : 1.5,           // 쏜 뒤 마감까지 이만큼(초)보다 적게 남았으면 → 바로 턴 넘기기
      endPause: B.endPause || [0.4, 0.8]                       // 할 일 다 하고 턴 넘기기 전 잠깐 (초)
    };
  }

  /* =========================================================
     2. 컴퓨터 상대 전용 주사위
        왜 심판 주사위(state.rng)를 안 쓰나:
          심판 주사위는 「심판만」 굴려야 함 — 조류 순서가 쪽지 기록만으로 똑같이 다시 나와야 하니까 (rules.js 「같은 주사위」)
          컴퓨터 상대가 생각하면서 그 주사위를 굴리면 조류가 바뀌어 버리고, 온라인 때는 컴퓨터 상대가 다른 컴퓨터(서버)에서 생각할 수도 있음
        그래서 같은 모양(mulberry32 = Rules.random)의 주사위를 「따로 한 개」 만들어 씀
          시작 번호 = 판 주사위 번호(seed) 에서 만듦 (+ 잠수함 이름) → 같은 판 번호면 컴퓨터 상대의 운도 늘 같은 순서 (확인·다시 해 보기 쉬움)
          심판 상태에는 아무것도 안 넣음 → 게임 결과(쪽지 기록)는 컴퓨터 상대가 있든 없든 같은 규칙
     ========================================================= */
  function hashText(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function makeRng(seed, id) {
    var dice = { rng: ((seed >>> 0) ^ 0x5EB07B07 ^ hashText(String(id))) >>> 0 };
    var f = function () { return R.random(dice); };     // 0 이상 1 미만
    f.dice = dice;
    return f;
  }
  function between(rnd, ab) { return ab[0] + (ab[1] - ab[0]) * rnd(); }
  function gauss(rnd) {                                  // 종 모양 오차 (평균 0, 크기 1)
    var u = Math.max(rnd(), 1e-9), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* =========================================================
     3. 조준 찾기 (심판 계산을 빌려 「미리 쏴 보기」)
     ========================================================= */
  // 그 자리에 있다고 치고 계산하기 위한 「가짜 상태」 (진짜 심판 상태는 절대 안 바꿈)
  //   sense = 조류를 얼마나 감안하나 (1 = 정확히, 쉬움은 덜) → 머릿속 조류만 약하게
  function viewWith(state, shooter, sense) {
    var cur = state.current || {};
    return {
      current: { dir: cur.dir, strength: (cur.strength || 0) * (sense == null ? 1 : sense) },
      subs: state.subs.map(function (s) { return s.id === shooter.id ? shooter : s; })
    };
  }
  function ghost(sub, x, y, facing) {
    var g = {}; for (var k in sub) g[k] = sub[k];
    g.x = x; g.y = y; g.facing = facing;
    return g;
  }
  function faceToward(fromX, target, fallback) {
    if (Math.abs(target.x - fromX) < 1) return fallback;
    return target.x > fromX ? 'right' : 'left';
  }

  // 점 3개 모양: 내 잠수함 높이(50 %)에서 시작하는 곧은 선(기울기 slope, 칸마다 %) + 가운데 점만 bump 만큼 더 휨
  //   가로 자리는 캐릭터 고정값, 세로는 노란 한계 상자 안으로 (심판 cleanPoints 와 같은 규칙)
  function shapePoints(ch, slope, bump) {
    var lim = ch.limit;
    return ch.padPoints.map(function (b, i) {
      var x = clamp(b[0], lim.left, lim.right);
      return [x, clamp(50 + slope * x + (i === 1 ? bump : 0), lim.top, lim.bottom)];
    });
  }

  // 한 발 결과 점수: 상대 데미지 + 격침 덤 − 내 데미지 ×3 − 우리 편 데미지 ×2 (내가 격침되면 크게 깎음)
  function scoreShot(shot, shooter, state, target) {
    var r = { value: 0, enemyDmg: 0, selfDmg: 0, allyDmg: 0, kills: 0, miss: 0 };
    shot.events.forEach(function (ev) {
      var s = R.getSub(state, ev.id);
      if (ev.id === shooter.id) r.selfDmg += ev.dmg;
      else if (s && s.team === shooter.team) r.allyDmg += ev.dmg;
      else r.enemyDmg += ev.dmg;
    });
    shot.sunk.forEach(function (id) {
      var s = R.getSub(state, id);
      if (id === shooter.id) r.value -= 100;
      else if (s && s.team !== shooter.team) r.kills++;
      else r.value -= 40;
    });
    r.value += r.enemyDmg + 30 * r.kills - 3 * r.selfDmg - 2 * r.allyDmg;
    r.miss = target ? hypot(shot.end.x - target.x, shot.end.y - target.y) : 0;
    return r;
  }
  function better(a, b) {                                // a 가 b 보다 좋은 조준인가
    if (!b) return true;
    if (Math.abs(a.value - b.value) > 0.01) return a.value > b.value;
    return a.miss < b.miss;
  }

  // shooter(그 자리·그 방향이라고 친 잠수함)가 target 을 노리는 가장 좋은 조준 찾기
  //   돌려줌: { points, distance, value, enemyDmg, selfDmg, allyDmg, kills, miss, end }
  var BUMPS_FULL = [0, 10, -10], BUMPS_QUICK = [0];
  function aimAt(state, shooter, target, C, opts) {
    opts = opts || {};
    var ch = C.character, lim = ch.limit, M = C.movement, T = C.torpedo, WPU = C.pad.worldPerUnit;
    var view = viewWith(state, shooter, opts.currentSense);
    var dir = shooter.facing === 'left' ? -1 : 1;
    var x0 = shooter.x + dir * M.subHalfW;
    var gx = (target.x - x0) * dir, gy = target.y - shooter.y;
    var best = null, bumps = opts.quick ? BUMPS_QUICK : BUMPS_FULL, iters = opts.iters || 6;
    bumps.forEach(function (bump) {
      var d = clamp(gx / WPU, lim.left, lim.right);
      var s = d > 0.5 ? (gy / T.verticalRange * 50) / d : 0;
      for (var it = 0; it < iters; it++) {
        var dist = clamp(Math.round(d), 0, lim.right);
        var pts = shapePoints(ch, s, bump);
        var shot = R.simulateShot(view, shooter, pts, dist, C);
        var sc = scoreShot(shot, shooter, state, target);
        sc.points = pts; sc.distance = dist; sc.end = shot.end;
        if (better(sc, best)) best = sc;
        // 빗나간 만큼 고치기: 앞뒤로 빗나감 → 거리, 위아래로 빗나감 → 기울기
        var ex = (target.x - shot.end.x) * dir, ey = target.y - shot.end.y;
        if (Math.abs(ex) < 12 && Math.abs(ey) < 12) break;
        d = clamp(d + ex / WPU, lim.left, lim.right);
        s = clamp(s + (ey / T.verticalRange * 50) / Math.max(dist, 1), -4, 4);
      }
    });
    return best;
  }

  /* =========================================================
     4. 이번 차례 계획 (어디로 가서 누구를 쏠지) — 화면·시계 없이 숫자만
        돌려줌: { targetId, dest: {x, y}, facing, aim } / 쏠 상대가 없으면 null
     ========================================================= */
  function enemiesOf(state, me) {
    return state.subs.filter(function (s) { return !s.sunk && s.team !== me.team && s.id !== me.id; });
  }
  function clampPos(C, x, y) {
    var M = C.movement;
    return { x: clamp(x, M.subHalfW + M.marginX, C.world.w - M.subHalfW - M.marginX),
             y: clamp(y, M.subHalfH + M.marginTop, C.world.h - M.subHalfH - M.marginBottom) };
  }
  // 이번 차례에 갈 수 있는 거리 = 이동 게이지 남은 만큼, 그리고 「이동 시간(moveTime) × 조이스틱 끝까지 민 빠르기」까지만 (사람 빠르기 그대로)
  function reachOf(sub, C, L) {
    return Math.min(sub.move * C.character.moveDistance, C.movement.speed * L.moveTime) * 0.9;
  }

  function planTurn(state, id, C, L, rnd) {
    var me = R.getSub(state, id);
    if (!me || me.sunk) return null;
    var targets = enemiesOf(state, me);
    if (!targets.length) return null;
    var lim = C.character.limit, WPU = C.pad.worldPerUnit, M = C.movement;
    var range = lim.right * WPU + M.subHalfW;            // 최대 사거리 (맵 거리, 잠수함 가운데부터)
    var reach = reachOf(me, C, L);

    // 가 볼 자리 후보: 지금 자리 + 둘레 12방향 × 2거리 + 상대 쪽으로 똑바로
    var cands = [{ x: me.x, y: me.y }];
    if (reach > 10) {
      var turn0 = rnd() * Math.PI * 2;
      for (var a = 0; a < 12; a++) {
        var ang = turn0 + a * Math.PI / 6;
        [0.45, 1].forEach(function (k) { cands.push(clampPos(C, me.x + Math.cos(ang) * reach * k, me.y + Math.sin(ang) * reach * k)); });
      }
      targets.forEach(function (t) {
        var dx = t.x - me.x, dy = t.y - me.y, l = hypot(dx, dy) || 1;
        cands.push(clampPos(C, me.x + dx / l * reach, me.y + dy / l * reach));
        cands.push(clampPos(C, me.x + Math.sign(dx) * reach, me.y));
      });
    }

    var best = null;
    cands.forEach(function (p) {
      var moved = hypot(p.x - me.x, p.y - me.y);
      targets.forEach(function (t) {
        var facing = faceToward(p.x, t, me.facing);
        var g = ghost(me, p.x, p.y, facing);
        var aim = aimAt(state, g, t, C, { quick: true, iters: 5, currentSense: L.currentSense });
        if (!aim) return;
        var gap = Math.abs(t.x - p.x);
        // 사거리에 비해 알맞은 간격 = 최대 사거리의 35 ~ 80 % (너무 가까우면 폭발에 나도 휘말리고, 너무 멀면 끝에 걸려 빗나감)
        var spacing = gap < range * 0.35 ? (range * 0.35 - gap) / range * 12
                    : gap > range * 0.8 ? (gap - range * 0.8) / range * 12 : 0;
        var value = aim.value
          - (reach > 0 ? moved / reach : 0) * 1.2          // 많이 움직이는 수고
          - spacing
          - (aim.enemyDmg <= 0 ? aim.miss / 100 : 0)        // 못 맞히면: 그래도 더 가까이 떨어지는 쪽
          - t.hp / 100                                      // 같은 값이면 체력 적은 상대 먼저
          + rnd() * 1.5;                                     // 매번 똑같이 움직이지 않게 조금 변덕
        if (!best || value > best.value) best = { value: value, targetId: t.id, dest: p, facing: facing, aim: aim };
      });
    });
    return best;
  }

  // 지금 자리에서 마지막 조준 (+ 실력만큼 손 떨림). 계획 때보다 자리가 조금 달라도 여기서 다시 맞춤
  function finalAim(state, id, targetId, C, L, rnd) {
    var me = R.getSub(state, id);
    var targets = enemiesOf(state, me);
    var t = R.getSub(state, targetId);
    if (!t || t.sunk) t = targets[0];
    if (!t) return null;
    var aim = aimAt(state, me, t, C, { currentSense: L.currentSense });
    if (!aim) return null;
    var lim = C.character.limit, E = L.aimError, pick = null;
    // 손 떨림: 점 높이 ± (판 %), 거리 ± (칸). 떨린 조준이 나를 다치게 하면 다시 떨어 봄 (3번까지, 그래도면 떨림 없는 조준)
    for (var k = 0; k < 3 && !pick; k++) {
      var pts = aim.points.map(function (p) { return [p[0], clamp(p[1] + gauss(rnd) * E.pin, lim.top, lim.bottom)]; });
      var dist = clamp(Math.round(aim.distance + gauss(rnd) * E.dist), 0, lim.right);
      var sc = scoreShot(R.simulateShot(state, me, pts, dist, C), me, state, t);
      if (sc.selfDmg <= 0 && sc.allyDmg <= aim.allyDmg) pick = { points: pts, distance: dist };
    }
    if (!pick) pick = { points: aim.points, distance: aim.distance };
    pick.targetId = t.id; pick.clean = aim;
    return pick;
  }

  /* =========================================================
     5. 손 (시간에 맞춰 쪽지 내기)
        createPlayer(C, 난이도 이름) → function (심판 상태, 판 시계, 잠수함 id) → 낼 쪽지 / 쪽지 묶음(배열) / null
        turn.js 가 상대 차례 동안 화면마다(+0.1초마다) 부름. 어뢰를 보여 주는 동안·판이 끝난 뒤엔 안 부름
        화면을 전혀 안 씀 → node 에서 가짜 시계로 판 전체를 돌려 볼 수 있음
     ========================================================= */
  function createPlayer(C, levelName) {
    var L = levelOf(C, levelName);
    var M = C.movement;
    var mem = {};                                        // 잠수함마다 { seed, rnd, key(이번 차례), phase, ... }

    function memFor(state, id) {
      var m = mem[id];
      if (!m || m.seed !== state.seed) m = mem[id] = { seed: state.seed, rnd: makeRng(state.seed, id), key: null };   // 새 판(다시 하기) = 주사위도 처음부터
      return m;
    }

    // 목적지로 한 걸음 (조이스틱을 끝까지 민 빠르기, 한 걸음은 심판 한도 0.05초어치로 쪼갬)
    //   facing 을 주면 그쪽을 보고 움직임(뒷걸음), 안 주면 조이스틱처럼 좌우로 충분히 갈 때 그쪽을 봄
    function stepToward(sub, dest, dtMs, facing) {
      var dx = dest.x - sub.x, dy = dest.y - sub.y, d = hypot(dx, dy);
      if (d < 1.5) return null;
      var want = Math.min(d, M.speed * Math.min(dtMs, 250) / 1000);
      if (want < 0.05) return [];                       // 이번엔 걸음이 너무 작음 (같은 순간에 두 번 불림)
      var ux = dx / d, uy = dy / d, maxLen = M.speed * 0.05, steps = [];
      for (var left = want; left > 1e-6; left -= maxLen) {
        var l = Math.min(left, maxLen);
        steps.push([+(ux * l).toFixed(3), +(uy * l).toFixed(3)]);
      }
      var f = facing || (ux > M.faceThreshold ? 'right' : ux < -M.faceThreshold ? 'left' : sub.facing);
      return { type: 'move', subId: sub.id, steps: steps, facing: f };
    }

    function player(state, now, id) {
      var t = state.turn, m = memFor(state, id), rnd = m.rnd;
      var key = t.number + '/' + t.index + '/' + t.startAt;
      if (m.key !== key) {                               // 새 차례 시작 → 생각부터
        m.key = key; m.phase = 'think'; m.last = now; m.until = now + between(rnd, L.thinkTime) * 1000;
        m.plan = null; m.aim = null; m.dest = null; m.moveEnd = 0; m.prev = null; m.sent = 0;
      }
      var dt = now - m.last; m.last = now;
      var me = R.getSub(state, id);
      if (state.over) return null;
      if (!me || me.sunk) return { type: 'endTurn', subId: id };
      var remain = t.deadline - now;

      // 시간 지키기: 아직 안 쐈는데 시간이 모자라면 → 남은 생각·이동 건너뛰고 바로 조준 / 쐈는데 모자라면 → 바로 넘김
      if (!t.fired && remain < L.panicTime * 1000 && /^(think|move|face|aim)$/.test(m.phase)) {
        if (m.phase === 'think' && !m.plan) m.plan = planTurn(state, id, C, L, rnd);   // 계획이 아직이면 노릴 상대만이라도
        m.phase = 'aim'; m.until = now;
      }
      if (t.fired && remain < L.endTime * 1000 && m.phase !== 'ended') { m.phase = 'end'; m.until = now; }
      if (t.fired && /^(think|move|face|aim|hold|fired)$/.test(m.phase)) m.phase = 'after';   // 쏜 어뢰 재생이 끝남

      switch (m.phase) {
        case 'think':                                    // 「생각하는 중」 — 계획은 처음 한 번만 (계산은 잠깐이면 끝남)
          if (!m.plan) {
            m.plan = planTurn(state, id, C, L, rnd);
            if (!m.plan) { m.phase = 'end'; m.until = now + between(rnd, L.endPause) * 1000; return null; }
          }
          if (now < m.until) return null;
          m.dest = m.plan.dest;
          m.phase = hypot(m.dest.x - me.x, m.dest.y - me.y) > 3 ? 'move' : 'face';
          m.moveEnd = now + (L.moveTime + 0.5) * 1000;
          return null;

        case 'move':
        case 'wander': {                                 // 이동 (쏘기 전 자리 잡기 / 쏜 뒤 살짝 비켜 서기)
          // 막힘 = 지난번에 걸음 쪽지를 냈는데 자리가 그대로 (맵 끝·게이지 바닥·거절)
          var stuck = m.prev && Math.abs(m.prev.x - me.x) + Math.abs(m.prev.y - me.y) < 1e-3;
          var slip = me.move > 0 && !stuck && now < m.moveEnd ? stepToward(me, m.dest, dt, m.phase === 'wander' ? m.wanderFacing : null) : null;
          if (slip) {
            if (slip.steps) { m.prev = { x: me.x, y: me.y }; m.sent++; return slip; }
            m.prev = null;
            return null;
          }
          if (m.phase === 'wander') { m.phase = 'end'; m.until = now + between(rnd, L.endPause) * 1000; }
          else m.phase = 'face';
          return null;
        }

        case 'face': {                                   // 상대 쪽으로 돌아보기 (걸음 없는 이동 쪽지 = 돌아보기만)
          var tg = R.getSub(state, m.plan.targetId);
          if (!tg || tg.sunk) tg = enemiesOf(state, me)[0];
          m.phase = 'aim'; m.until = now + between(rnd, L.aimTime) * 1000;
          var want = tg ? faceToward(me.x, tg, me.facing) : me.facing;
          if (want !== me.facing && me.move > 0) return { type: 'move', subId: id, steps: [], facing: want };
          return null;
        }

        case 'aim':                                      // 조준 (잠깐 뜸 들이기) → 발사 누르기 시작
          if (now < m.until) return null;
          m.aim = finalAim(state, id, m.plan ? m.plan.targetId : null, C, L, rnd);
          if (!m.aim) { m.phase = 'end'; m.until = now; return null; }
          // 사람처럼 「거리만큼 꾹 누르는 시간」 뒤에 쏨 (게이지 0 → 최대 거리 = sweepTime). 누르기 시작한 시각 = holdAt
          m.holdAt = Math.round(now);
          m.fireAt = now + Math.max(0.15, m.aim.distance / C.character.limit.right * C.fire.sweepTime) * 1000;
          m.phase = 'hold';
          return null;

        case 'hold':
          if (now < m.fireAt) return null;
          m.phase = 'fired';
          return { type: 'fire', subId: id, points: m.aim.points, distance: m.aim.distance, holdAt: m.holdAt };

        case 'fired':                                    // 쐈는데 심판이 안 받아 줬음(그럴 일은 없어야 함) → 그냥 넘김
          if (!t.fired) { m.phase = 'end'; m.until = now; }
          return null;

        case 'after': {                                  // 어뢰 재생이 끝남 → 시간·게이지가 남으면 살짝 비켜 서기 (변덕 = 난이도 wander)
          m.phase = 'end'; m.until = now + between(rnd, L.endPause) * 1000;
          if (me.move > 0.08 && remain > (L.endTime + 2.5) * 1000 && rnd() < L.wander) {
            var foes = enemiesOf(state, me);
            if (foes.length) {
              var near = foes.reduce(function (a, b) { return Math.abs(b.x - me.x) < Math.abs(a.x - me.x) ? b : a; });
              var range = C.character.limit.right * C.pad.worldPerUnit;
              var away = Math.abs(near.x - me.x) < range * 0.6 ? -Math.sign(near.x - me.x || 1) : 0;   // 가까우면 뒤로, 아니면 위아래로만
              var r = Math.min(reachOf(me, C, L), 40 + rnd() * 60);
              var vy = (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.6);
              m.dest = clampPos(C, me.x + away * r * 0.8, me.y + vy * r);
              m.wanderFacing = faceToward(me.x, near, me.facing);          // 상대를 보면서 비켜 섬
              m.moveEnd = now + 1200; m.prev = null; m.sent = 0;
              m.phase = 'wander';
            }
          }
          return null;
        }

        case 'end':
          if (now < m.until) return null;
          m.phase = 'ended'; m.endedAt = now;
          return { type: 'endTurn', subId: id };

        case 'ended':                                    // 혹시 넘기기가 안 먹혔으면 1초 뒤 다시
          if (now - m.endedAt > 1000) { m.endedAt = now; return { type: 'endTurn', subId: id }; }
          return null;
      }
      return null;
    }

    // 지금 하는 일 (화면 「상대 차례」 표시에 붙이는 짧은 말)
    player.status = function (state, id) {
      var m = mem[id];
      if (!m || m.seed !== state.seed) return '';
      return { think: '생각하는 중', move: '움직이는 중', face: '조준하는 중', aim: '조준하는 중', hold: '조준하는 중',
               fired: '', after: '', wander: '움직이는 중', end: '', ended: '' }[m.phase] || '';
    };
    player.reset = function () { Object.keys(mem).forEach(function (k) { delete mem[k]; }); };   // 다시 하기 = 기억 비우기
    player.level = L.name;
    player.memory = mem;
    return player;
  }

  var Bot = {
    createPlayer: createPlayer, planTurn: planTurn, aimAt: aimAt, finalAim: finalAim, scoreShot: scoreShot,
    levelOf: levelOf, makeRng: makeRng, levels: DEFAULT_LEVELS
  };
  root.Bot = Bot;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bot;   // node 로 확인할 때

  /* ---------- 브라우저: 「컴퓨터 상대 자리」(Game.bots, turn.js)에 넣기 ----------
     내가 조종하지 않는 잠수함은 전부 이 컴퓨터 상대가 맡음 (상대 팀이든 우리 편이든 — 팀전 대비)
     잠수함마다 따로 맡기고 싶으면 Game.bots[잠수함 id] = Bot.createPlayer(설정, 'hard') 처럼 */
  if (root.Game && root.GAME_CONFIG) {
    root.Game.bots = root.Game.bots || {};
    var player = createPlayer(root.GAME_CONFIG);
    root.Game.bots.default = player;
    if (root.Game.onRestart) root.Game.onRestart(player.reset);   // 다시 하기 → 새 판은 처음부터 생각 (같은 주사위 번호로 다시 해도 섞이지 않게)
  }
})(typeof window !== 'undefined' ? window : globalThis);
