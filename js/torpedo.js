/* =========================================================
   심해 포격전(가칭) — 어뢰 날아가기 + 폭발 + 데미지
   1) 발사 버튼을 떼면(fire.js) → 내 잠수함 앞코에서 어뢰 출발 (잠수함이 보는 쪽으로)
   2) 길: 가로 = 궤도 판 거리 칸 × 48(맵), 세로 = 궤도 판 곡선 높이 (판 가운데 = 내 잠수함 높이,
          판 맨 위·맨 아래 = 위·아래로 config.js torpedo.verticalRange) + 조류에 점점 밀림
   3) 정한 거리(DELAY)에 닿았을 때만 펑! 가는 길에 잠수함을 지나가면 안 터지고 「스친 데미지」만 (한 번씩)
   4) 폭발 범위 안의 잠수함은 (내 잠수함도) 가까울수록 많이 깎임 → 체력바·에너지·「-28」 숫자
   5) 맵 밖으로 나가면 작은 연기만 남기고 사라짐 (데미지 없음)
   6) 카메라는 어뢰를 따라가고, 터진 자리에서 잠깐 멈췄다가 내 잠수함으로 돌아감
   7) 어뢰가 날아가는 동안은 발사·이동 잠김 (한 번에 한 발)
   숫자는 전부 config.js 의 torpedo 묶음. main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var T = C.torpedo, M = C.movement;
  var things = document.getElementById('worldThings');
  var seaView = document.getElementById('seaView');
  var gameEl = document.getElementById('game');

  // 조류 방향 → 미는 쪽 (화면 기준. 맵 아래쪽이 y +)
  var CURRENT_DIR = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

  // 어뢰 그림 (오른쪽을 보는 모양. 날아가는 방향으로 돌려서 씀)
  var TORPEDO_SVG =
    '<svg viewBox="0 0 32 12" aria-hidden="true">' +
      '<path d="M3 3 L0 0 L0 12 L3 9 Z" fill="#B3261E"/>' +                        // 꼬리 날개
      '<rect x="3" y="2.5" width="21" height="7" rx="3.5" fill="#FF7A2E" stroke="#7A1E08" stroke-width="1"/>' +   // 몸통
      '<rect x="9" y="2.5" width="3" height="7" fill="#C9283E"/>' +                  // 빨간 띠
      '<path d="M22 2.5 Q32 6 22 9.5 Z" fill="#E5323B" stroke="#7A1E08" stroke-width="1"/>' +   // 빨간 머리
      '<rect x="6" y="3.6" width="14" height="1.4" rx=".7" fill="#FFD7B0" opacity=".8"/>' +    // 반짝이
    '</svg>';

  var shot = null;          // 지금 날아가는 어뢰 (없으면 null)
  var log = [];             // 확인용 기록 (발사마다 출발점·터진 곳·데미지)
  G.state.busy = false;     // true = 어뢰가 날아가는 중 → 발사·이동 잠김 (fire.js, move.js 가 봄)

  /* ---------- 어뢰 길 계산 ----------
     u = 출발점에서 가로로 간 거리 칸. 궤도 판 곡선은 발사할 때 모양을 그대로 씀
     (날아가는 중에 판 점을 만져도 이번 어뢰 길은 안 바뀜) */
  function pathOffsetY(s, u) {
    var pct = G.padCurveY(u, s.sp);                  // 판 높이 % (50 = 가운데 = 내 잠수함 높이)
    return (pct - 50) / 50 * T.verticalRange;        // → 맵 세로 거리 (아래가 +)
  }
  // 조류에 안 밀렸을 때 u 칸 자리 (맵 좌표)
  function pathPoint(s, u) {
    return { x: s.x0 + s.dir * G.unitsToWorld(u), y: s.y0 + pathOffsetY(s, u) };
  }

  /* ---------- 발사 ---------- */
  // distance = 터지는 거리 (거리 칸, 화면 DELAY 숫자). 돌려주는 값: 발사했으면 true
  function fireTorpedo(distance) {
    if (shot || G.state.busy) return false;
    var me = G.getSub(C.activeSubId);
    if (!me) return false;
    var dir = me.facing === 'left' ? -1 : 1;
    var cur = C.current || {}, cv = CURRENT_DIR[cur.dir] || [0, 0], push = (cur.strength || 0) * T.currentPush;

    shot = {
      owner: me.id,
      dir: dir,
      x0: me.x + dir * M.subHalfW,           // 잠수함 앞코
      y0: me.y,
      target: Math.max(0, distance),         // 터지는 거리 (거리 칸)
      sp: G.curveSpline(),                   // 발사 순간의 곡선 모양
      u: 0, time: 0,
      drift: { vx: cv[0] * push, vy: cv[1] * push },   // 조류가 미는 빠르기 (맵/초)
      x: 0, y: 0, ang: 0,
      grazed: {},                            // 이미 스친 잠수함 (한 번씩만)
      inside: {},                            // 지금 몸 안을 지나가는 중인 잠수함
      phase: 'fly', hold: 0, bubbleT: 0,
      el: null
    };
    shot.x = shot.x0; shot.y = shot.y0;
    shot.ang = Math.atan2(pathOffsetY(shot, 0.05) - pathOffsetY(shot, 0), dir * G.unitsToWorld(0.05));
    shot.rec = { dir: dir, start: { x: shot.x0, y: shot.y0 }, target: shot.target, current: { dir: cur.dir, strength: cur.strength || 0 },
                 path: [], hits: [], result: null, at: null };
    log.push(shot.rec);

    var el = document.createElement('div');
    el.className = 'torpedo';
    el.innerHTML = TORPEDO_SVG;
    things.appendChild(el);
    shot.el = el;
    placeTorpedo();

    setBusy(true);
    G.cam.follow = false;                     // 카메라는 이제 어뢰 담당 (끝나면 다시 내 잠수함)
    if (shot.target <= 0) explode();          // 거리 0 = 바로 앞에서 펑
    return true;
  }

  function setBusy(on) {
    G.state.busy = on;
    gameEl.classList.toggle('busy', on);
  }

  function placeTorpedo() {
    var s = shot;
    s.el.style.left = s.x.toFixed(1) + 'px';
    s.el.style.top = s.y.toFixed(1) + 'px';
    s.el.firstChild.style.transform = 'rotate(' + (s.ang * 180 / Math.PI).toFixed(1) + 'deg)';
  }

  /* ---------- 날아가기 (매 화면마다) ---------- */
  function fly(dt) {
    var s = shot, left = T.speed * dt, WPU = C.pad.worldPerUnit, done = false;
    var px = s.x, py = s.y;
    // 곡선을 따라 조금씩(한 번에 최대 맵 6) 나아감 → 휘는 곳에서도 빠르기가 일정하고, 잠수함을 건너뛰지 않음
    while (left > 0 && !done) {
      var ds = Math.min(left, 6);
      left -= ds;
      var slope = (pathOffsetY(s, s.u + 0.02) - pathOffsetY(s, s.u)) / (0.02 * WPU);   // 곡선 기울기
      var du = ds / Math.sqrt(1 + slope * slope) / WPU;
      if (s.u + du >= s.target) { du = s.target - s.u; done = true; }
      s.u += du;
      s.time += ds / T.speed;                  // 이 조각만큼 흐른 시간 (초)
      var p = pathPoint(s, s.u);
      s.x = p.x + s.drift.vx * s.time;         // 조류: 날아간 시간만큼 점점 더 밀림
      s.y = p.y + s.drift.vy * s.time;
      checkGraze();
      if (outOfMap()) { vanish(); return; }
    }
    if (Math.abs(s.x - px) + Math.abs(s.y - py) > 0.01) s.ang = Math.atan2(s.y - py, s.x - px);
    placeTorpedo();
    if (s.rec.path.length < 2000) s.rec.path.push([Math.round(s.x), Math.round(s.y)]);

    // 꼬리 거품
    s.bubbleT += dt;
    while (s.bubbleT >= T.bubbleEvery) {
      s.bubbleT -= T.bubbleEvery;
      var b = document.createElement('div');
      b.className = 'tbub';
      b.style.left = (s.x - Math.cos(s.ang) * 17 + (Math.random() - 0.5) * 6).toFixed(1) + 'px';
      b.style.top = (s.y - Math.sin(s.ang) * 17 + (Math.random() - 0.5) * 6).toFixed(1) + 'px';
      b.addEventListener('animationend', function () { this.remove(); });
      things.appendChild(b);
    }
    if (done) explode();
  }

  // 맵 밖?
  function outOfMap() {
    return shot.x < 0 || shot.x > C.world.w || shot.y < 0 || shot.y > C.world.h;
  }

  /* ---------- 스치기: 날아가다 잠수함 몸을 뚫고 지나가면 안 터지고 에너지만 조금 (잠수함마다 한 번) ----------
     몸에 들어갔다가 「빠져나올 때」 깎음 → 몸 안에서 바로 터지면 스침은 없고 폭발 데미지만 받음 (이중으로 안 깎이게) */
  function checkGraze() {
    var s = shot, rx = M.subHalfW + T.hitPad, ry = M.subHalfH + T.hitPad;
    G.state.subs.forEach(function (sub) {
      if (sub.id === s.owner || s.grazed[sub.id] || sub.hp <= 0) return;   // 쏜 잠수함·이미 스친 잠수함·격침된 잠수함은 빼고
      var dx = (s.x - sub.x) / rx, dy = (s.y - sub.y) / ry;
      if (dx * dx + dy * dy <= 1) s.inside[sub.id] = true;                   // 잠수함 몸(타원) 안에 들어옴
      else if (s.inside[sub.id]) {                                           // 몸을 지나 빠져나감 = 스침
        s.grazed[sub.id] = true;
        hurt(sub, T.grazeDamage, 'graze');
      }
    });
  }

  /* ---------- 펑! ---------- */
  function explode() {
    var s = shot;
    s.phase = 'hold'; s.hold = 0;
    s.el.remove();
    s.rec.result = 'boom';
    s.rec.at = { x: Math.round(s.x), y: Math.round(s.y), u: +s.u.toFixed(3) };
    effect(s.x, s.y, T.blastRadius, false);
    shake();
    // 폭발 범위 안 잠수함 전부 (내 잠수함도): 한가운데 = maxDamage, 범위 끝 = 0 (일직선으로 줄어듦)
    G.state.subs.forEach(function (sub) {
      if (sub.hp <= 0) return;
      var d = Math.sqrt((sub.x - s.x) * (sub.x - s.x) + (sub.y - s.y) * (sub.y - s.y));
      if (d >= T.blastRadius) return;
      var dmg = Math.round(T.maxDamage * (1 - d / T.blastRadius));
      if (dmg > 0) hurt(sub, dmg, 'blast', d);
    });
    console.log('[어뢰 폭발]', s.rec);
  }

  // 맵 밖으로 나감 → 작은 연기만, 데미지 없음
  function vanish() {
    var s = shot;
    s.phase = 'hold'; s.hold = T.holdTime / 2;   // 카메라는 조금만 머묾
    s.el.remove();
    s.x = Math.min(Math.max(s.x, 0), C.world.w);
    s.y = Math.min(Math.max(s.y, 0), C.world.h);
    s.rec.result = 'out';
    s.rec.at = { x: Math.round(s.x), y: Math.round(s.y), u: +s.u.toFixed(3) };
    effect(s.x, s.y, 26, true);
    console.log('[어뢰 맵 밖으로]', s.rec);
  }

  // 데미지 주기 + 숫자 띄우기
  function hurt(sub, dmg, kind, dist) {
    G.setSubHp(sub.id, sub.hp - dmg);
    shot.rec.hits.push({ id: sub.id, kind: kind, dmg: dmg, dist: dist == null ? null : Math.round(dist), hpAfter: sub.hp });
    var n = document.createElement('div');
    n.className = 'dmgnum' + (kind === 'graze' ? ' small' : '');
    n.style.left = sub.x.toFixed(1) + 'px';
    n.style.top = (sub.y - M.subHalfH - 30).toFixed(1) + 'px';   // 이름표 위쪽
    n.innerHTML = '<b>-' + dmg + '</b>';
    n.firstChild.addEventListener('animationend', function () { n.remove(); });
    things.appendChild(n);
  }

  // 폭발 그림 (번쩍 + 고리 + 거품). puff = 맵 밖으로 나갈 때 작은 연기
  function effect(x, y, r, puff) {
    var e = document.createElement('div'), t = puff ? 0.45 : T.boomTime, h = '<i class="flash"></i>';
    e.className = 'boom' + (puff ? ' puff' : '');
    e.style.cssText = 'left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;--r:' + r + 'px;--t:' + t + 's';
    if (!puff) h += '<i class="ring"></i>';
    for (var i = 0, n = puff ? 4 : 10; i < n; i++) {
      var a = Math.random() * Math.PI * 2, d = r * (0.3 + Math.random() * 0.5);
      h += '<i class="bb" style="--bx:' + (Math.cos(a) * d).toFixed(0) + 'px;--by:' + (Math.sin(a) * d - r * 0.2).toFixed(0) + 'px"></i>';
    }
    e.innerHTML = h;
    things.appendChild(e);
    setTimeout(function () { e.remove(); }, t * 1000 + 100);
  }

  function shake() {
    if (!T.shake) return;
    seaView.style.setProperty('--sh', T.shake + 'px');
    seaView.classList.remove('shake');
    void seaView.offsetWidth;                 // 애니메이션 처음부터 다시
    seaView.classList.add('shake');
    setTimeout(function () { seaView.classList.remove('shake'); }, 400);
  }

  /* ---------- 카메라: 어뢰(또는 터진 자리)를 화면 가운데로 부드럽게 ---------- */
  function camTo(x, y, dt) {
    var cam = G.cam;
    if (cam.panning || !cam.viewW) return;    // 손으로 바다를 밀고 있으면 방해 안 함
    var tx = x - cam.viewW / cam.zoom / 2, ty = y - cam.viewH / cam.zoom / 2;
    var k = 1 - Math.exp(-T.cameraFollow * dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    G.applyCamera();
  }

  /* ---------- 매 화면마다 ---------- */
  function step(dt) {
    if (!shot) return;
    if (shot.phase === 'fly') fly(dt);
    if (!shot) return;
    camTo(shot.x, shot.y, dt);
    if (shot.phase === 'hold') {
      shot.hold += dt;
      if (shot.hold >= T.holdTime) finish();
    }
  }
  // 끝: 잠금 풀기 + 카메라는 move.js 의 「잠수함 따라가기」가 내 잠수함으로 부드럽게 돌려 놓음
  function finish() {
    shot = null;
    setBusy(false);
    G.cam.follow = true;
  }

  var last = 0;
  function frame(t) {
    var dt = last ? Math.min((t - last) / 1000, 0.05) : 0;   // 탭을 갔다 오면 한 번에 휙 가지 않게 최대 0.05초
    last = t;
    if (dt > 0) step(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 밖에서 부를 수 있게 (fire.js 가 발사할 때 부름. 확인용 기록도)
  G.fireTorpedo = fireTorpedo;
  G.torpedo = { log: log, isFlying: function () { return !!shot; }, current: function () { return shot; } };
})();
