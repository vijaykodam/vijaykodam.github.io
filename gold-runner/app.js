(function () {
  'use strict';
  var game = new GoldEngine(), canvas = document.getElementById('board'), ctx = canvas.getContext('2d');
  var ids = ['score', 'sector', 'gold', 'lives', 'best', 'event', 'overlay', 'primary', 'secondary', 'pause', 'sound', 'help', 'card-title', 'card-copy', 'card-kicker', 'card-note', 'connection'];
  var ui = {}, i, T = 24, best = 0, sound = false, audio = null, panel = 'start', returnPanel = 'start';
  var touches = {}, keys = {}, held = null, mouseAction = null, lastTouch = 0, lastFrame = 0, lastPaint = 0, priorScore = 0, priorLives = 3, lastStatus = '';
  for (i = 0; i < ids.length; i++) ui[ids[i]] = document.getElementById(ids[i]);
  function read(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) {} }
  best = Number(read('gold-runner-best', '0')) || 0;
  sound = read('gold-runner-sound', 'off') === 'on';
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
  function soundLabel() { ui.sound.textContent = 'SOUND ' + (sound ? 'ON' : 'OFF'); ui.sound.setAttribute('aria-pressed', String(sound)); ui.sound.setAttribute('aria-label', 'Turn sound ' + (sound ? 'off' : 'on')); }
  function unlockAudio() {
    if (!sound) return;
    try { if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); } if (audio && audio.state === 'suspended') audio.resume(); } catch (e) {}
  }
  function tone(freq, duration) {
    if (!sound || !audio) return;
    try { var o = audio.createOscillator(), v = audio.createGain(); o.type = 'square'; o.frequency.value = freq; v.gain.setValueAtTime(0.035, audio.currentTime); v.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration); o.connect(v); v.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration); } catch (e) {}
  }
  function clearInput() { touches = {}; keys = {}; mouseAction = null; held = null; game.cancelInput(); highlight(); }
  function highlight() {
    var buttons = document.querySelectorAll('[data-action]'), active = {}, k;
    if (held) active[held] = true;
    for (k in touches) if (Object.prototype.hasOwnProperty.call(touches, k)) active[touches[k]] = true;
    if (mouseAction) active[mouseAction] = true;
    for (k in keys) if (Object.prototype.hasOwnProperty.call(keys, k)) active[keys[k]] = true;
    for (var b = 0; b < buttons.length; b++) {
      var a = buttons[b].getAttribute('data-action');
      if (active[a] && game.active()) buttons[b].classList.add('pressed'); else buttons[b].classList.remove('pressed');
    }
  }
  function direction(a) { return a === 'left' || a === 'right' || a === 'up' || a === 'down'; }
  function updateHeld(preferred) {
    var next = direction(preferred) ? preferred : null, k;
    if (!next) {
      for (k in touches) if (Object.prototype.hasOwnProperty.call(touches, k) && direction(touches[k])) next = touches[k];
      for (k in keys) if (Object.prototype.hasOwnProperty.call(keys, k) && direction(keys[k])) next = keys[k];
      if (direction(mouseAction)) next = mouseAction;
    }
    if (next !== held) { if (held) game.release(held); held = next; if (held) game.press(held); }
    highlight();
  }
  function activate(action) { unlockAudio(); if (action === 'digLeft' || action === 'digRight') { if (game.dig(action === 'digLeft' ? -1 : 1)) tone(120, 0.08); } else updateHeld(action); }
  function actionAt(node) { while (node && node !== document) { if (node.getAttribute && node.getAttribute('data-action')) return node.getAttribute('data-action'); node = node.parentNode; } return null; }
  var controls = document.getElementById('controls');
  controls.addEventListener('touchstart', function (e) {
    e.preventDefault(); lastTouch = Date.now();
    for (var n = 0; n < e.changedTouches.length; n++) { var t = e.changedTouches[n], a = actionAt(t.target); if (a) { touches[t.identifier] = a; activate(a); } }
    highlight();
  }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    var tracked = false;
    for (var n = 0; n < e.changedTouches.length; n++) {
      var t = e.changedTouches[n];
      if (Object.prototype.hasOwnProperty.call(touches, t.identifier)) {
        tracked = true; var a = actionAt(document.elementFromPoint(t.clientX, t.clientY));
        if (a !== touches[t.identifier]) { touches[t.identifier] = a; if (a) activate(a); updateHeld(a); }
      }
    }
    if (tracked) e.preventDefault();
  }, { passive: false });
  function endTouch(e) {
    var tracked = false;
    for (var n = 0; n < e.changedTouches.length; n++) { var id = e.changedTouches[n].identifier; if (Object.prototype.hasOwnProperty.call(touches, id)) { delete touches[id]; tracked = true; } }
    if (tracked) { e.preventDefault(); lastTouch = Date.now(); updateHeld(); }
  }
  document.addEventListener('touchend', endTouch, { passive: false });
  document.addEventListener('touchcancel', function (e) { endTouch(e); game.cancelInput(); held = null; }, { passive: false });
  controls.addEventListener('mousedown', function (e) { if (Date.now() - lastTouch < 700 || e.button !== 0) return; var a = actionAt(e.target); if (a) { e.preventDefault(); mouseAction = a; activate(a); highlight(); } });
  document.addEventListener('mouseup', function () { mouseAction = null; updateHeld(); });
  controls.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  var keyMap = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 65: 'left', 87: 'up', 68: 'right', 83: 'down', 90: 'digLeft', 88: 'digRight' };
  document.addEventListener('keydown', function (e) {
    var a = keyMap[e.keyCode];
    if (a) { e.preventDefault(); if (!keys[e.keyCode]) { keys[e.keyCode] = a; activate(a); } }
    else if ((e.keyCode === 80 || e.keyCode === 27) && !e.repeat) { e.preventDefault(); if (panel === 'help') closeHelp(); else togglePause(); }
    else if (e.keyCode === 13 && panel && e.target.tagName !== 'BUTTON') { e.preventDefault(); primary(); }
    if (e.keyCode === 9 && panel) {
      var first = ui.primary, last = ui.secondary.hidden ? first : ui.secondary;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('keyup', function (e) { if (keyMap[e.keyCode]) { e.preventDefault(); delete keys[e.keyCode]; updateHeld(); } });
  function showPanel(type, focus) {
    panel = type; clearInput(); ui.overlay.hidden = !type; ui.overlay.setAttribute('data-panel', type || '');
    ui.secondary.hidden = true; ui['card-note'].hidden = false;
    ui.pause.disabled = !game.started || game.gameOver || game.levelComplete;
    ui.pause.setAttribute('aria-label', game.paused ? 'Resume game' : 'Pause game');
    if (!type) return;
    var title, copy, kicker, label, note = '3 LIVES · NO TIME LIMIT · ALL GUTS';
    if (type === 'start') { kicker = 'THE VAULT IS WAITING'; title = 'GET THE GOLD.<br>GET OUT.'; copy = 'Collect the gold. Outsmart the guards.<br>Climb to the exit when the vault is clear.'; label = 'START RUN'; }
    if (type === 'pause') { kicker = 'TAKE A BREATHER'; title = 'SAFE FOR<br>A SECOND.'; copy = 'Your run is paused.<br>The gold can wait. The guards have to.'; label = 'KEEP RUNNING'; ui.secondary.hidden = false; note = 'YOUR RUN STAYS RIGHT HERE'; }
    if (type === 'over') { kicker = 'EVERY ESCAPE STARTS SOMEWHERE'; title = 'GOOD RUN.<br>GO AGAIN?'; copy = 'Score ' + pad(game.score, 6) + ' · Sector ' + pad(game.level, 2) + '<br>Personal best ' + pad(best, 6); label = 'TRY AGAIN'; note = 'A NEW ROUTE. ANOTHER CHANCE.'; }
    if (type === 'complete') { kicker = 'ALL GOLD SECURED'; title = 'CLEAN<br>GETAWAY.'; copy = '+500 escape bonus. Nicely done.<br>Sector ' + pad(game.level + 1, 2) + ' is waiting for you.'; label = 'NEXT SECTOR'; note = 'THE NEXT VAULT WON’T ROB ITSELF'; }
    if (type === 'help') { kicker = 'THE SHORT VERSION'; title = 'HOW TO PLAY.'; copy = 'Hold arrows to move or climb. Down drops from ropes.<br>DIG L / R opens a brick below and beside you.<br>Trap red guards. Holes close after 4 seconds.<br>Get all 16 gold caches, then climb the top-center exit.'; label = 'GOT IT'; note = 'KEYBOARD: ARROWS / WASD · Z / X · P TO PAUSE'; }
    ui['card-title'].innerHTML = title; ui['card-copy'].innerHTML = copy; ui['card-kicker'].textContent = kicker;
    ui.primary.innerHTML = label + ' <span aria-hidden="true">→</span>'; ui['card-note'].textContent = note;
    if (focus) ui.primary.focus();
  }
  function primary() {
    unlockAudio();
    if (panel === 'help') { closeHelp(); return; }
    if (panel === 'pause') game.paused = false;
    else if (panel === 'complete') game.nextLevel();
    else game.newGame();
    priorScore = game.score; priorLives = game.lives; showPanel(null); tone(440, 0.1); updateHUD();
    ui.primary.blur();
  }
  function togglePause() { if (panel === 'pause') { game.paused = false; showPanel(null); } else if (game.active()) { game.pause(); showPanel('pause', true); } }
  function closeHelp() { if (returnPanel) showPanel(returnPanel, true); else { game.paused = false; showPanel(null); } }
  ui.primary.addEventListener('click', primary);
  ui.secondary.addEventListener('click', function () { game.newGame(); priorScore = 0; priorLives = 3; showPanel(null); updateHUD(); });
  ui.pause.addEventListener('click', togglePause);
  ui.help.addEventListener('click', function () { if (panel === 'help') { closeHelp(); return; } returnPanel = panel; game.pause(); showPanel('help', true); });
  ui.sound.addEventListener('click', function () { sound = !sound; write('gold-runner-sound', sound ? 'on' : 'off'); soundLabel(); unlockAudio(); tone(660, 0.1); });
  function suspend() { clearInput(); if (game.active()) { game.pause(); showPanel('pause'); } }
  window.addEventListener('blur', suspend);
  document.addEventListener('visibilitychange', function () { if (document.hidden) suspend(); lastFrame = 0; });
  window.addEventListener('pagehide', suspend);
  function updateHUD() {
    if (game.score > best) { best = game.score; write('gold-runner-best', best); }
    var status = [game.score, game.level, game.gold.length, game.lives, game.lastEvent, best].join('|');
    if (status === lastStatus) return;
    lastStatus = status;
    ui.score.textContent = pad(game.score, 6); ui.sector.textContent = pad(game.level, 2);
    ui.gold.innerHTML = pad(game.totalGold - game.gold.length, 2) + '<span class="muted">/' + game.totalGold + '</span>';
    ui.lives.textContent = (game.lives >= 1 ? '●' : '○') + ' ' + (game.lives >= 2 ? '●' : '○') + ' ' + (game.lives >= 3 ? '●' : '○');
    ui.lives.setAttribute('aria-label', game.lives + ' lives'); ui.best.textContent = pad(best, 6); ui.event.textContent = game.started ? game.lastEvent : 'Your next great escape starts here';
  }
  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function drawActor(a, guard) {
    var progress = Math.min(1, Math.max(0, (game.time - a.movedAt) / 0.11));
    var x = (a.px + (a.x - a.px) * progress) * T, y = (a.py + (a.y - a.py) * progress) * T;
    var walking = progress < 1, stride = walking ? (Math.floor(game.time * 14) % 2 ? 2 : -2) : 0;
    var color = guard ? '#e28273' : '#b6e4c5', dark = guard ? '#943f49' : '#4e9279';
    if (!guard && game.time < game.invulnerableUntil && game.started && Math.floor(game.time * 9) % 2) ctx.globalAlpha = 0.4;
    if (a.trappedUntil > game.time) { color = '#bd7982'; y += 5; }
    rect(x + 8, y + 3, 9, 7, color); rect(x + (a.facing > 0 ? 14 : 8), y + 5, 3, 2, '#17242a');
    rect(x + 7, y + 1, 10, 3, guard ? '#b4555e' : '#edd78e');
    rect(x + 7, y + 11, 10, 7, color); rect(x + 4, y + 11 + stride, 3, 6, dark); rect(x + 17, y + 11 - stride, 3, 6, dark);
    rect(x + 8, y + 18, 3, 5 - stride, dark); rect(x + 14, y + 18, 3, 5 + stride, dark);
    ctx.globalAlpha = 1;
  }
  function draw() {
    var x, y, tile, c, k, h;
    rect(0, 0, 528, 432, '#0b161c');
    for (y = 0; y < 18; y++) for (x = 0; x < 22; x++) {
      tile = game.tile({ x: x, y: y }); var px = x * T, py = y * T;
      if (tile === 'brick') {
        rect(px, py, T, T, '#784a3b'); rect(px + 1, py + 1, 22, 2, '#b58054');
        rect(px + 1, py + 11, 22, 2, '#b58054'); rect(px, py + 9, T, 2, '#302e2c'); rect(px, py + 22, T, 2, '#292e2c');
        rect(px + 10, py + 1, 2, 8, '#302e2c'); rect(px + (y % 8 ? 4 : 18), py + 13, 2, 9, '#302e2c');
      } else if (tile === 'steel') {
        rect(px, py, 23, 23, '#354641'); rect(px + 2, py + 2, 20, 2, '#66736a'); rect(px + 4, py + 7, 3, 3, '#718073'); rect(px + 17, py + 17, 3, 3, '#718073');
      } else if (tile === 'ladder') {
        c = y < 2 ? '#f3d67b' : '#899d83'; rect(px + 6, py, 2, T, c); rect(px + 16, py, 2, T, c);
        for (k = 4; k < T; k += 7) rect(px + 8, py + k, 8, 2, c);
      } else if (tile === 'rope') { rect(px, py + 4, T, 2, '#ada17d'); rect(px + 5, py + 6, 2, 2, '#746f58'); }
      else if (x % 3 === 0 && y % 2 === 0) rect(px + 11, py + 11, 1, 1, '#263235');
    }
    // Refill indicator gives players a readable warning before the brick returns.
    for (k = 0; k < game.holes.length; k++) { h = game.holes[k]; var remain = (h.closesAt - game.time) / 4.2; rect(h.x * T + 2, h.y * T + 21, Math.max(1, Math.floor(20 * remain)), 2, remain < 0.25 ? '#e28273' : '#b58054'); }
    for (k = 0; k < game.gold.length; k++) {
      c = game.gold[k]; x = c.x * T; y = c.y * T;
      rect(x + 7, y + 13, 11, 7, '#c99035'); rect(x + 9, y + 10, 7, 3, '#fff0ac'); rect(x + 6, y + 14, 13, 3, '#f3c65d'); rect(x + 9, y + 13, 2, 5, '#ffeaa3');
    }
    if (!game.gold.length) { rect(10 * T + 8, 0, 8, 3, '#ffeb9b'); }
    for (k = 0; k < game.guards.length; k++) drawActor(game.guards[k], true);
    drawActor(game.player, false);
  }
  function resize() {
    var field = document.getElementById('playfield'), machine = field.parentNode, arcade = document.querySelector('.arcade');
    // visualViewport follows Safari's browser bars; older Safari uses innerHeight.
    // Leave pinch zoom to the browser instead of shrinking the game under a finger.
    var viewport = window.visualViewport;
    if (viewport && viewport.scale !== 1) return;
    var height = viewport ? viewport.height : window.innerHeight;
    var width = window.innerWidth, landscape = width > height && height <= 850;
    if (lastWidth !== width || lastHeight !== height) clearInput();
    lastWidth = width; lastHeight = height;
    document.body.classList.toggle('landscape', landscape);
    document.body.classList.toggle('small-landscape', landscape && height <= 500);
    document.body.classList.toggle('tight-landscape', landscape && height <= 290);
    document.body.classList.toggle('compact-portrait', !landscape && height < 760);
    document.body.classList.remove('compact-menu');
    field.style.width = ''; field.style.height = ''; machine.style.height = '';
    var arcadeStyle = window.getComputedStyle(arcade), machineStyle = window.getComputedStyle(machine);
    var arcadePadding = parseFloat(arcadeStyle.paddingTop) + parseFloat(arcadeStyle.paddingBottom);
    var availableWidth = machine.clientWidth - parseFloat(machineStyle.paddingLeft) - parseFloat(machineStyle.paddingRight);
    var availableHeight;
    if (landscape) {
      machine.style.height = Math.max(232, Math.floor(height - arcadePadding)) + 'px';
      availableHeight = machine.clientHeight - parseFloat(machineStyle.paddingTop) - parseFloat(machineStyle.paddingBottom);
    } else {
      // Measure all chrome and the full controller before fitting the board.
      var outside = arcade.offsetHeight - field.offsetHeight;
      availableHeight = width > 1024 && !navigator.maxTouchPoints ? availableWidth * 18 / 22 : Math.max(80, height - outside - 2);
    }
    var boardWidth = Math.floor(Math.min(availableWidth, availableHeight * 22 / 18));
    field.style.width = boardWidth + 'px'; field.style.height = Math.floor(boardWidth * 18 / 22) + 'px';
    document.body.classList.toggle('compact-menu', field.clientHeight < 280);
  }
  var resizeFrame = 0, lastWidth = window.innerWidth, lastHeight = window.innerHeight;
  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      // Rotation/reflow must not leave a runner moving after a control shifts.
      resize();
    });
  }
  window.addEventListener('resize', scheduleResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', function () { suspend(); window.setTimeout(resize, 180); });
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (document.hidden) { lastFrame = 0; return; }
    if (lastPaint && now - lastPaint < 31) return;
    var delta = lastFrame ? (now - lastFrame) / 1000 : 0; lastFrame = now; lastPaint = now;
    game.advance(delta);
    if (game.score > priorScore) tone(game.levelComplete ? 880 : 660, 0.1);
    if (game.lives < priorLives) { clearInput(); tone(80, 0.22); }
    priorScore = game.score; priorLives = game.lives;
    updateHUD();
    if (game.gameOver && panel !== 'over' && panel !== 'help') showPanel('over', true);
    else if (game.levelComplete && panel !== 'complete' && panel !== 'help') showPanel('complete', true);
    draw();
  }
  // Read-only state for browser verification and nonvisual game inspection.
  window.render_game_to_text = function () {
    return JSON.stringify({
      coordinates: '22 by 18 tiles; origin top-left; x right, y down',
      mode: panel || 'playing', sector: game.level, score: game.score,
      lives: game.lives, time: game.time, player: game.player,
      guards: game.guards, gold: game.gold, holes: game.holes,
      exitOpen: !game.gold.length, paused: game.paused, best: best
    });
  };
  soundLabel(); showPanel('start'); updateHUD(); draw(); resize(); window.requestAnimationFrame(frame);
  // No dependency on service workers: ordinary HTTP and file hosting still play.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (registration) {
        var worker = navigator.serviceWorker.controller || registration.active;
        if (worker) worker.postMessage('CACHE_STATUS');
      }).catch(function () {});
    });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data === 'OFFLINE_READY') ui.connection.textContent = 'READY FOR OFFLINE PLAY'; });
  }
}());
