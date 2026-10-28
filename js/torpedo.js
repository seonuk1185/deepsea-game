/* =========================================================
   심해 포격전(가칭) — 어뢰 「다시 보여 주기(재생)」 + 폭발 + 데미지 숫자
   어뢰 한 발의 결과(날아간 길·스침·폭발 자리·데미지·격침)는 심판(rules.js)이 쏘는 순간 이미 다 계산해 둠.
   이 파일은 그 결과를 받아서 시간에 맞춰 화면에 보여 주기만 함 (규칙 계산은 하나도 안 함):
   1) 발사 주문서 결과가 오면(main.js Game.onResult('fire')) → 내 잠수함 앞코에서 어뢰 그림 출발
   2) 심판이 적어 준 길(시간·x·y 목록)을 따라 어뢰를 움직임 + 꼬리 거품 + 날아가는 쪽으로 기울이기
   3) 「몇 초에 누가 얼마나」 적힌 데미지 목록을 그 시간이 되면 보여 줌 → 체력바·에너지·「-28」 숫자·격침
   4) 끝 시간이 되면 펑!(번쩍·고리·거품·흔들림) 또는 맵 밖이면 작은 연기
   5) 카메라는 어뢰를 따라가고, 터진 자리에서 잠깐 멈췄다가 내 잠수함으로 돌아감
   6) 보여 주는 동안은 발사·이동 잠김 (한 번에 한 발). 끝나면 풀리고 주황 거리 게이지 비움
   (거품·폭발 거품 자리만 Math.random 으로 흩뿌림 — 그림 꾸미기라서 결과와 상관없음. 컴퓨터마다 달라도 됨)
   숫자는 전부 config.js 의 torpedo 묶음. main.js 다음에 불러야 함 (window.Game 을 씀)
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var T = C.torpedo, M = C.movement;
  var things = document.getElementById('worldThings');
  var seaView = document.getElementById('seaView');
  var gameEl = document.getElementById('game');

  // 어뢰 그림 (오른쪽을 보는 모양. 날아가는 방향으로 돌려서 씀)
  var TORPEDO_SVG =
    '<svg viewBox="0 0 32 12" aria-hidden="true">' +
      '<path d="M3 3 L0 0 L0 12 L3 9 Z" fill="#B3261E"/>' +                        // 꼬리 날개
      '<rect x="3" y="2.5" width="21" height="7" rx="3.5" fill="#FF7A2E" stroke="#7A1E08" stroke-width="1"/>' +   // 몸통
      '<rect x="9" y="2.5" width="3" height="7" fill="#C9283E"/>' +                  // 빨간 띠
      '<path d="M22 2.5 Q32 6 22 9.5 Z" fill="#E5323B" stroke="#7A1E08" stroke-width="1"/>' +   // 빨간 머리
      '<rect x="6" y="3.6" width="14" height="1.4" rx=".7" fill="#FFD7B0" opacity=".8"/>' +    // 반짝이
    '</svg>';

  var play = null;          // 지금 보여 주는 어뢰 (없으면 null)
  var log = [];             // 확인용 기록 (발사마다 출발점·터진 곳·데미지)
  G.state.busy = false;     // true = 어뢰를 보여 주는 중 → 발사·이동 잠김 (fire.js, move.js 가 봄)

  /* ---------- 발사 결과 받기 (심판이 계산한 한 발 전체) ---------- */
  G.onResult('fire', function (res) { start(res.shot); });

  function start(r) {
    if (play) skipToEnd();                    // (혹시 앞 어뢰가 아직이면) 앞 어뢰 결과를 바로 다 보여 주고 끝냄
    play = {
      r: r, t: 0, i: 0, ev: 0,                // t = 재생 시간(초), i = 길 목록에서 지금 칸, ev = 다음에 보여 줄 데미지 번호
      x: r.start.x, y: r.start.y, ang: r.startAng,
      phase: 'fly', hold: 0, bubbleT: 0, el: null
    };
    play.rec = { dir: r.dir, start: { x: r.start.x, y: r.start.y }, target: r.target, current: r.current,
                 path: r.samples.map(function (p) { return [Math.round(p[1]), Math.round(p[2])]; }),
                 hits: [], result: null, at: null, shot: r };
    log.push(play.rec);

    var el = document.createElement('div');
    el.className = 'torpedo';
    el.innerHTML = TORPEDO_SVG;
    things.appendChild(el);
    play.el = el;
    placeTorpedo();

    setBusy(true);
    G.cam.follow = false;                     // 카메라는 이제 어뢰 담당 (끝나면 다시 내 잠수함)
    if (r.end.t <= 0) reachEnd();             // 거리 0 = 바로 앞에서 펑
  }

  function setBusy(on) {
    G.state.busy = on;
    gameEl.classList.toggle('busy', on);
  }

  function placeTorpedo() {
    var s = play;
    s.el.style.left = s.x.toFixed(1) + 'px';
    s.el.style.top = s.y.toFixed(1) + 'px';
    s.el.firstChild.style.transform = 'rotate(' + (s.ang * 180 / Math.PI).toFixed(1) + 'deg)';
  }

  // 길 목록에서 시간 t 의 자리 (목록 칸 사이는 일직선으로 이어서)
  function pointAt(t) {
    var S = play.r.samples, i = play.i;
    while (i < S.length - 2 && S[i + 1][0] <= t) i++;
    play.i = i;
    var a = S[i], b = S[Math.min(i + 1, S.length - 1)];
    var k = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 1;
    return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k };
  }

  // 시간 t 까지 일어난 데미지를 화면에 보여 줌
  function showEventsUntil(t) {
    var E = play.r.events;
    while (play.ev < E.length && E[play.ev].t <= t) showHit(E[play.ev++]);
  }

  /* ---------- 날아가기 (매 화면마다) ---------- */
  function fly(dt) {
    var s = play, end = s.r.end;
    var px = s.x, py = s.y;
    s.t = Math.min(s.t + dt, end.t);
    var p = pointAt(s.t);
    s.x = p.x; s.y = p.y;
    showEventsUntil(s.t);                    // 가는 길에 스친 데미지
    var done = s.t >= end.t;
    if (done && end.kind === 'out') { reachEnd(); return; }   // 맵 밖 → 거품 없이 연기만
    if (Math.abs(s.x - px) + Math.abs(s.y - py) > 0.01) s.ang = Math.atan2(s.y - py, s.x - px);
    placeTorpedo();

    // 꼬리 거품 (그림 꾸미기)
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
    if (done) reachEnd();
  }

  /* ---------- 끝 자리에 닿음: 펑! 또는 맵 밖 연기 ---------- */
  function reachEnd() {
    var s = play, end = s.r.end;
    s.phase = 'hold';
    s.hold = end.kind === 'out' ? T.holdTime / 2 : 0;   // 맵 밖이면 카메라는 조금만 머묾
    s.t = end.t;
    s.x = end.x; s.y = end.y;
    if (s.el) { s.el.remove(); s.el = null; }
    s.rec.result = end.kind;
    s.rec.at = { x: Math.round(end.x), y: Math.round(end.y), u: +end.u.toFixed(3) };
    if (end.kind === 'out') {
      effect(end.x, end.y, 26, true);
      showEventsUntil(Infinity);
      console.log('[어뢰 맵 밖으로]', s.rec);
    } else {
      effect(end.x, end.y, T.blastRadius, false);
      shake();
      showEventsUntil(Infinity);             // 폭발 데미지 (심판이 계산해 둔 그대로)
      console.log('[어뢰 폭발]', s.rec);
    }
  }

  // 데미지 하나 보여 주기: 보이는 체력 바꾸기 + 숫자 띄우기
  function showHit(ev) {
    var sub = G.getSub(ev.id);
    G.setSubHp(ev.id, ev.hpAfter);
    play.rec.hits.push({ id: ev.id, kind: ev.kind, dmg: ev.dmg, dist: ev.dist, hpAfter: ev.hpAfter });
    var n = document.createElement('div');
    n.className = 'dmgnum' + (ev.kind === 'graze' ? ' small' : '');
    n.style.left = sub.x.toFixed(1) + 'px';
    n.style.top = (sub.y - M.subHalfH - 30).toFixed(1) + 'px';   // 이름표 위쪽
    n.innerHTML = '<b>-' + ev.dmg + '</b>';
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
    if (!play) return;
    if (play.phase === 'fly') fly(dt);
    if (!play) return;
    camTo(play.x, play.y, dt);
    if (play.phase === 'hold') {
      play.hold += dt;
      if (play.hold >= T.holdTime) finish();
    }
  }
  // 앞 어뢰를 아직 보여 주는 중에 새 결과가 오면: 남은 데미지를 바로 다 보여 주고 끝냄 (화면이 심판과 어긋나지 않게)
  function skipToEnd() {
    if (play.phase === 'fly') reachEnd();
    finish();
  }
  // 끝: 잠금 풀기 + 거리 게이지 처음으로 + 카메라는 move.js 의 「잠수함 따라가기」가 내 잠수함으로 부드럽게 돌려 놓음
  function finish() {
    play = null;
    setBusy(false);
    G.setFireGauge(0);                        // 발사가 끝나면 거리 게이지 비우기 (형님 지시). DELAY 숫자는 턴 넘기기 때 지움
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

  // 확인용으로 밖에서 볼 수 있게 (발사마다 기록 + 지금 보여 주는 중인지)
  G.torpedo = { log: log, isFlying: function () { return !!play; }, current: function () { return play; } };
})();
