/* =========================================================
   심해 포격전(가칭) — 캐릭터 고르기 화면 (19차, 2026-10-31)
   게임을 열면(그리고 판 끝 「다시 하기」를 누르면) 판보다 먼저 이 화면이 뜸. 그동안 판은 「대기실」(main.js isLobby)이라 시계·컴퓨터 상대가 쉼
   하는 일:
   1) 카드 7장 = 캐릭터 6 (config.js characters) + 「?」 랜덤. 카드를 누르면 골라지고(앰버 테두리) 오른쪽에 능력치 육각형(SVG) + 이름·역할·특수능력 한 줄
   2) 큰 「선택」 버튼 → READY (모양이 바뀌고 카드 잠김). READY 를 다시 누르면 취소 → 다시 고르기
   3) READY 가 확정되면 잠깐(config.js charSelect.readyBeat = 0.6초) READY 를 보여 준 뒤 판 시작
      → 고르기 쪽지 { type:'pick', subId, charId, random } 를 Game.startMatch 에 넘김 (그 쪽지로 새 판을 만듦 — 흩어진 전역값 없음)
      온라인이 되면 READY = 「다른 사람 기다리는 중」. 그때는 이 쪽지를 서버에 내고, 모두 READY 면 서버가 판을 시작시킴 (지금은 혼자라 바로)
   4) 「?」 랜덤: 육각형 대신 「?」. READY 가 확정되면 6개 중 하나를 굴려서(카드를 돌다가 멈춤) 무엇이 됐는지 보여 준 뒤 시작
      ※ 굴리는 주사위 = 브라우저 Math.random (심판의 「같은 주사위」가 아님). 이유: 같은 주사위는 심판만 굴려야 조류 순서가 쪽지 기록만으로 똑같이 다시 나옴
        + 판 주사위 번호가 첫 판엔 늘 같아서(config.js seed) 그걸 쓰면 랜덤이 매번 같은 캐릭터가 됨. 결과는 쪽지(charId)에 담기니 판은 그대로 다시 만들 수 있음
        온라인 때는 서버가 굴려서 쪽지에 넣어 주면 됨
   5) 지금은 고르기만: 판 규칙·숫자는 모든 캐릭터가 돌고래호 그대로. 계기판 홀로그램 창 밑 이름만 고른 캐릭터로 바뀜 (main.js showMyCharName)
   PC: 마우스로 누르기 + 키보드 ←→↑↓ 카드 옮기기 · Enter/스페이스 = 선택/READY/취소
   main.js·turn.js 다음에 불러야 함
   ========================================================= */
(function () {
  'use strict';

  var C = window.GAME_CONFIG, G = window.Game;
  var CS = C.charSelect || {}, LIST = C.characters || [], AXES = C.characterStats || [];
  var RANDOM = 'random';
  var root = document.getElementById('charSel');

  /* ---------- 화면 만들기 ---------- */
  function cardHtml(ch) {
    return '<button class="cs-card" data-id="' + ch.id + '" aria-label="' + ch.name + ' (' + ch.role + ')">' +
      '<span class="pic"><img src="' + ch.img + '" alt="" draggable="false"></span>' +
      '<b>' + ch.name + '</b><em>' + ch.role + '</em><i class="stamp">READY</i></button>';
  }
  root.innerHTML =
    '<div class="cs-panel">' +
      '<header class="cs-head"><b>SELECT SUBMARINE</b><span>잠수함을 고르세요</span><small id="csHint"></small></header>' +
      '<div class="cs-body">' +
        '<div class="cs-grid" id="csGrid">' + LIST.map(cardHtml).join('') +
          '<button class="cs-card rnd" data-id="' + RANDOM + '" aria-label="랜덤">' +
            '<span class="pic"><span class="q">?</span></span><b>랜덤</b><em>?</em><i class="stamp">READY</i></button>' +
        '</div>' +
        '<div class="cs-detail">' +
          '<div class="cs-hex" id="csHex"></div>' +
          '<div class="cs-info">' +
            '<div class="cs-name"><b id="csName"></b><em id="csRole"></em></div>' +
            '<p class="cs-special" id="csSpecial"></p>' +
            '<button class="cs-go" id="csGo" disabled>선택</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  var grid = document.getElementById('csGrid'), goBtn = document.getElementById('csGo');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.cs-card'));

  /* ---------- 능력치 육각형 (SVG) ----------
     꼭짓점 6개 = config.js characterStats 순서 (맨 위부터 시계 방향), 1~5 단계 → 5칸 고리. stats 없으면(랜덤) 「?」
     색은 style.css 변수(--c 청록 면·선, --amber 꼭짓점·숫자, --txt2 글씨)를 씀 (.hx-*) */
  var HR = 62;
  function pt(i, r) {
    var a = (i * 60 - 90) * Math.PI / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function poly(r) { return AXES.map(function (_, i) { var p = pt(i, r); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
  function hexSvg(stats) {
    var h = '<svg viewBox="-124 -108 248 216" aria-hidden="true">';
    for (var k = 5; k >= 1; k--) h += '<polygon class="hx-ring' + (k === 5 ? ' out' : '') + '" points="' + poly(HR * k / 5) + '"/>';
    AXES.forEach(function (_, i) { var p = pt(i, HR); h += '<line class="hx-axis" x1="0" y1="0" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; });
    if (stats) {
      var vs = AXES.map(function (a) { return Math.max(0, Math.min(5, stats[a.key] || 0)); });
      h += '<g class="hx-data"><polygon class="hx-area" points="' + vs.map(function (v, i) { var p = pt(i, HR * v / 5); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      vs.forEach(function (v, i) { var p = pt(i, HR * v / 5); h += '<circle class="hx-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>'; });
      h += '</g>';
    } else {
      h += '<polygon class="hx-area q" points="' + poly(HR * 0.6) + '"/><text class="hx-q" x="0" y="0">?</text>';
    }
    // 꼭짓점 이름 + 그 밑에 숫자 (두 줄 — 옆으로 길어지지 않게)
    AXES.forEach(function (a, i) {
      var p = pt(i, HR + 10), x = p[0], y = p[1], mid = Math.abs(x) < 1;
      var anchor = mid ? 'middle' : (x > 0 ? 'start' : 'end');
      var y1 = mid ? (y < 0 ? y - 18 : y + 10) : y - 3;
      var v = stats ? (stats[a.key] || 0) : '?';
      h += '<text class="hx-lbl" x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" text-anchor="' + anchor + '">' + a.label + '</text>' +
        '<text class="hx-val" x="' + x.toFixed(1) + '" y="' + (y1 + 16).toFixed(1) + '" text-anchor="' + anchor + '">' + v + '</text>';
    });
    return h + '</svg>';
  }

  /* ---------- 상태 ----------
     phase = 'choose'(고르는 중) / 'ready'(READY, 곧 시작) / 'reveal'(랜덤 굴리는 중 — 이것도 READY 상태)
     sel = 골라 둔 카드 id (캐릭터 id 또는 'random'), lastSel = 지난 판에 고른 카드 (다시 하기 때 그대로 골라져 있음) */
  var phase = 'choose', sel = null, lastSel = null, timers = [];
  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function later(fn, sec) { timers.push(setTimeout(fn, sec * 1000)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // 오른쪽 자세히 칸 (shownId = 육각형에 보여 줄 캐릭터. 랜덤 굴리는 중엔 돌고 있는 카드)
  function showDetail(shownId, viaRandom) {
    var ch = byId(shownId), hex = document.getElementById('csHex');
    hex.innerHTML = hexSvg(ch ? ch.stats : null);
    hex.classList.remove('pop'); void hex.offsetWidth; hex.classList.add('pop');   // 바뀔 때 살짝 커지며 나타남
    document.getElementById('csName').textContent = ch ? ch.name : (shownId === RANDOM ? '랜덤' : '');
    document.getElementById('csRole').textContent = ch ? (viaRandom ? '랜덤 → ' : '') + ch.role + '형' : (shownId === RANDOM ? '?' : '');
    document.getElementById('csSpecial').textContent = ch ? ch.special : (shownId === RANDOM ? '6척 중 하나가 무작위로 골라져요' : '왼쪽에서 잠수함을 골라 주세요');
    root.classList.toggle('empty', !shownId);
  }
  function markCards(lit) {
    cards.forEach(function (c) {
      var id = c.getAttribute('data-id');
      c.classList.toggle('sel', id === sel);
      c.classList.toggle('lit', id === lit);           // 랜덤 굴리는 중 지나가는 카드 / 굴려서 나온 카드
    });
  }
  function render() {
    root.classList.toggle('ready', phase !== 'choose');
    goBtn.disabled = !sel;
    goBtn.textContent = phase === 'choose' ? '선택' : 'READY';
    goBtn.setAttribute('aria-label', phase === 'choose' ? '선택' : 'READY — 다시 누르면 취소');
    document.getElementById('csHint').textContent = phase === 'choose' ? '' : '다시 누르면 취소';
    cards.forEach(function (c) { c.disabled = phase !== 'choose'; });
  }

  function select(id) {
    if (phase !== 'choose' || !id) return;
    sel = id;
    markCards(null);
    showDetail(id);
    render();
  }

  /* ---------- READY / 취소 ---------- */
  function ready() {
    if (!sel || phase !== 'choose') return;
    if (sel !== RANDOM) {
      phase = 'ready';
      render();
      later(function () { start(sel, false); }, CS.readyBeat == null ? 0.6 : CS.readyBeat);
      return;
    }
    // 랜덤: 굴리기 (Math.random — 맨 위 설명) → 카드를 돌며 불이 지나가다 결과에서 멈춤 → 결과 육각형 → 잠깐 → 시작
    phase = 'reveal';
    render();
    var pick = LIST[Math.floor(Math.random() * LIST.length)].id;
    var total = CS.revealTime == null ? 1.0 : CS.revealTime, steps = 10, at = 0;
    var start0 = LIST.map(function (c) { return c.id; }).indexOf(pick) - steps + 1;   // 마지막 걸음이 정확히 결과에 멈추게
    for (var k = 0; k < steps; k++) {
      (function (k) {
        var id = LIST[((start0 + k) % LIST.length + LIST.length) % LIST.length].id;
        at += total * (0.04 + 0.16 * k / (steps - 1)) / 1.2;              // 점점 느려짐 (걸음 길이 합 = 1.2 → 다 더하면 total)
        later(function () { markCards(id); if (k === steps - 1) showDetail(id, true); }, Math.min(at, total));
      })(k);
    }
    later(function () { start(pick, true); }, total + (CS.readyBeat == null ? 0.6 : CS.readyBeat));
  }
  function cancel() {
    if (phase === 'choose') return;
    clearTimers();
    phase = 'choose';
    markCards(null);
    showDetail(sel);
    render();
  }

  // 판 시작: 고르기 쪽지 하나를 판 만들기에 넘김 (온라인 땐 서버로 — 맨 위 3)
  function start(charId, random) {
    clearTimers();
    lastSel = sel;
    var slip = { type: 'pick', subId: G.mySubId, charId: charId, random: !!random };
    root.hidden = true;
    phase = 'choose';
    G.startMatch([slip]);
  }

  /* ---------- 열기 (처음 + 「다시 하기」) ---------- */
  function open() {
    clearTimers();
    phase = 'choose';
    sel = lastSel;
    markCards(null);
    showDetail(sel);
    render();
    root.hidden = false;
  }
  G.onLobby(open);

  /* ---------- 누르기 ---------- */
  grid.addEventListener('click', function (e) {
    var c = e.target.closest('.cs-card');
    if (c) select(c.getAttribute('data-id'));
  });
  goBtn.addEventListener('click', function () {
    if (phase === 'choose') ready(); else cancel();
  });

  // PC 키보드: ←→↑↓ 카드 옮기기 (4칸씩 한 줄), Enter·스페이스 = 선택/READY/취소. 게임 키(keys.js)는 이 화면에선 쉼
  document.addEventListener('keydown', function (e) {
    if (root.hidden || e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.code, ids = cards.map(function (c) { return c.getAttribute('data-id'); });
    if (k === 'Enter' || k === 'Space' || k === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) goBtn.click();
      return;
    }
    var mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[k];
    if (!mv) return;
    e.preventDefault();
    if (phase !== 'choose') return;
    var i = sel ? ids.indexOf(sel) : -1;
    i = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + mv));
    select(ids[i]);
  });

  G.charSelect = { open: open, select: select, ready: ready, cancel: cancel, state: function () { return { phase: phase, sel: sel }; } };
  G.openLobby();   // 게임을 열면 바로 고르기 화면 (main.js 대기실은 처음부터 켜져 있음)
})();
