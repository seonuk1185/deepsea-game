/* =========================================================
   심해 포격전(가칭) — 미니맵 (14차, 형님 결정: 상대 위치 늘 보임)
   자리: 화면 오른쪽 위, 일시정지(Ⅱ) 단추 바로 아래 (왼쪽 위·가운데 위는 나중에 채팅 자리라 비움)
   보이는 것: 맵 전체 테두리(가로·세로 = config.js world) / 잠수함 점(우리 편 파랑, 상대 빨강, 내 잠수함은 조금 크게,
             지금 차례인 잠수함은 깜빡, 격침은 회색) / 보급상자 / 날아가는 어뢰 / 지금 화면에 보이는 곳(흰 네모)
   누르거나 끌면 그 자리로 화면이 감 (바다를 손으로 민 것과 같음 = 잠수함 따라가기 멈춤)
   읽기만 함 (심판 상태 Game.rs + 카메라 Game.cam). main.js·torpedo.js 다음에 불러야 함
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game, rs = G.rs;
  var box = document.getElementById('minimap');
  var map = box.querySelector('.mm-map');
  var W = C.world.w, H = C.world.h;
  map.style.aspectRatio = W + ' / ' + H;                     // 맵 모양 그대로 (지금 1920 × 600)

  var dots = {}, view, torp;
  function pct(v, total) { return (v / total * 100).toFixed(2) + '%'; }

  // 점 만들기 (처음 + 다시 하기)
  function build() {
    var me = G.getSub(G.mySubId), h = '';
    C.crates.forEach(function (c) {
      h += '<i class="mm-crate" style="left:' + pct(c.x, W) + ';top:' + pct(c.y, H) + '"></i>';
    });
    rs.subs.forEach(function (s) {
      var team = me && s.team === me.team ? 'ours' : 'theirs';
      h += '<i class="mm-sub ' + team + (s.id === G.mySubId ? ' me' : '') + '" data-id="' + s.id + '" title="' + s.name + '"></i>';
    });
    h += '<i class="mm-torp" hidden></i><b class="mm-view"></b>';
    map.innerHTML = h;
    dots = {};
    Array.prototype.forEach.call(map.querySelectorAll('.mm-sub'), function (el) { dots[el.getAttribute('data-id')] = el; });
    view = map.querySelector('.mm-view');
    torp = map.querySelector('.mm-torp');
    update();
  }

  // 매 화면: 잠수함 자리·차례·격침 + 어뢰 + 화면 네모
  function update() {
    rs.subs.forEach(function (s) {
      var el = dots[s.id];
      if (!el) return;
      el.style.left = pct(s.x, W);
      el.style.top = pct(s.y, H);
      el.classList.toggle('active', s.id === rs.turn.activeId && !rs.over);
      // 격침 회색은 화면에 「격침」이 뜰 때(어뢰가 맞는 순간)와 맞춤 — 잠수함 그림에 .sunk 가 붙으면
      var subEl = document.getElementById('sub-' + s.id);
      el.classList.toggle('sunk', !!(subEl && subEl.classList.contains('sunk')));
    });
    var p = G.torpedo && G.torpedo.current();
    if (p && p.phase === 'fly') {
      torp.hidden = false;
      torp.style.left = pct(p.x, W);
      torp.style.top = pct(p.y, H);
    } else torp.hidden = true;
    var cam = G.cam;
    if (cam.zoom && cam.viewW) {
      view.style.left = pct(cam.x, W);
      view.style.top = pct(cam.y, H);
      view.style.width = pct(Math.min(W, cam.viewW / cam.zoom), W);
      view.style.height = pct(Math.min(H, cam.viewH / cam.zoom), H);
    }
  }

  function frame() { update(); requestAnimationFrame(frame); }

  /* ---------- 누르기·끌기 → 화면을 그 자리로 ---------- */
  var drag = null;
  function goTo(e) {
    var r = map.getBoundingClientRect();
    if (!r.width) return;
    var x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    G.cam.follow = false;                                    // 바다를 손으로 민 것과 같음 (잠수함 따라가기 멈춤)
    G.cam.manual = true;
    G.focusOn(Math.min(Math.max(x, 0), W), Math.min(Math.max(y, 0), H));
    update();
  }
  box.addEventListener('pointerdown', function (e) {
    if (drag !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    drag = e.pointerId;
    box.setPointerCapture(e.pointerId);
    goTo(e);
  });
  box.addEventListener('pointermove', function (e) { if (e.pointerId === drag) goTo(e); });
  function end(e) { if (e.pointerId === drag) drag = null; }
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('lostpointercapture', end);

  G.onRestart(build);
  build();
  requestAnimationFrame(frame);
  G.minimap = { update: update };
})();
