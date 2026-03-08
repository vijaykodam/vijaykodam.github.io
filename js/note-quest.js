document.addEventListener('DOMContentLoaded', function () {
  var wrapper = document.querySelector('.note-quest-wrapper');
  if (!wrapper) return;

  var Factory = VexFlow.Factory;
  var Stave = VexFlow.Stave;
  var StaveNote = VexFlow.StaveNote;
  var Voice = VexFlow.Voice;
  var Formatter = VexFlow.Formatter;
  var Renderer = VexFlow.Renderer;
  var StaveConnector = VexFlow.StaveConnector;

  // ── Note data ──
  var NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  var NOTES_DB = [];

  (function buildNotesDB() {
    var trebleNotes = [
      { name: 'C', octave: 4, clef: 'treble' },
      { name: 'D', octave: 4, clef: 'treble' },
      { name: 'E', octave: 4, clef: 'treble' },
      { name: 'F', octave: 4, clef: 'treble' },
      { name: 'G', octave: 4, clef: 'treble' },
      { name: 'A', octave: 4, clef: 'treble' },
      { name: 'B', octave: 4, clef: 'treble' },
      { name: 'C', octave: 5, clef: 'treble' },
      { name: 'D', octave: 5, clef: 'treble' },
      { name: 'E', octave: 5, clef: 'treble' },
      { name: 'F', octave: 5, clef: 'treble' },
      { name: 'G', octave: 5, clef: 'treble' },
      { name: 'A', octave: 5, clef: 'treble' },
      { name: 'B', octave: 5, clef: 'treble' },
      { name: 'C', octave: 6, clef: 'treble' },
    ];

    var bassNotes = [
      { name: 'E', octave: 2, clef: 'bass' },
      { name: 'F', octave: 2, clef: 'bass' },
      { name: 'G', octave: 2, clef: 'bass' },
      { name: 'A', octave: 2, clef: 'bass' },
      { name: 'B', octave: 2, clef: 'bass' },
      { name: 'C', octave: 3, clef: 'bass' },
      { name: 'D', octave: 3, clef: 'bass' },
      { name: 'E', octave: 3, clef: 'bass' },
      { name: 'F', octave: 3, clef: 'bass' },
      { name: 'G', octave: 3, clef: 'bass' },
      { name: 'A', octave: 3, clef: 'bass' },
      { name: 'B', octave: 3, clef: 'bass' },
      { name: 'C', octave: 4, clef: 'bass' },
    ];

    NOTES_DB.push.apply(NOTES_DB, bassNotes);
    NOTES_DB.push.apply(NOTES_DB, trebleNotes);
  })();

  // ── Level configuration ──
  var LEVELS = [
    { level: 1,  name: 'First Notes',     category: 'easy',   min: 'C4', max: 'G4', clef: 'treble', labelMode: 'all' },
    { level: 2,  name: 'Treble Basics',    category: 'easy',   min: 'C4', max: 'C5', clef: 'treble', labelMode: 'lines' },
    { level: 3,  name: 'Treble Comfort',   category: 'easy',   min: 'C4', max: 'G5', clef: 'treble', labelMode: 'none' },
    { level: 4,  name: 'Meet the Bass',    category: 'medium', min: 'F3', max: 'G4',                 labelMode: 'lines' },
    { level: 5,  name: 'Grand Staff',      category: 'medium', min: 'C3', max: 'C5',                 labelMode: 'none' },
    { level: 6,  name: 'Expanding Range',  category: 'medium', min: 'A2', max: 'D5',                 labelMode: 'none' },
    { level: 7,  name: 'Full Staff',       category: 'medium', min: 'G2', max: 'E5',                 labelMode: 'none' },
    { level: 8,  name: 'Ledger Lines',     category: 'hard',   min: 'E2', max: 'G5',                 labelMode: 'none' },
    { level: 9,  name: 'Extended Range',   category: 'hard',   min: 'E2', max: 'A5',                 labelMode: 'none' },
    { level: 10, name: 'Note Master',      category: 'hard',   min: 'E2', max: 'C6',                 labelMode: 'none' },
  ];

  var TOTAL_QUESTIONS = 10;

  function noteKey(n) { return n.name + n.octave; }

  function noteIndex(name, octave) {
    var order = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
    return octave * 7 + order[name];
  }

  function getNotesForLevel(config) {
    var minIdx = noteIndex(config.min[0], parseInt(config.min.slice(1)));
    var maxIdx = noteIndex(config.max[0], parseInt(config.max.slice(1)));

    var notes = NOTES_DB.filter(function (n) {
      var idx = noteIndex(n.name, n.octave);
      return idx >= minIdx && idx <= maxIdx;
    });

    if (config.clef === 'treble') {
      notes = notes.filter(function (n) { return n.clef === 'treble'; });
    }

    return notes;
  }

  function pickRandomNotes(pool, count) {
    var result = [];
    for (var i = 0; i < count; i++) {
      var note;
      do {
        note = pool[Math.floor(Math.random() * pool.length)];
      } while (result.length > 0 && noteKey(note) === noteKey(result[result.length - 1]));
      result.push(note);
    }
    return result;
  }

  function interleaveNotes(bass, treble) {
    var result = [];
    var bi = 0, ti = 0;
    var useBass = Math.random() < 0.5; // random start
    while (bi < bass.length || ti < treble.length) {
      if (useBass && bi < bass.length) {
        result.push(bass[bi++]);
      } else if (!useBass && ti < treble.length) {
        result.push(treble[ti++]);
      } else if (bi < bass.length) {
        result.push(bass[bi++]);
      } else {
        result.push(treble[ti++]);
      }
      useBass = !useBass;
    }
    // Light neighbor-swaps for variety
    for (var i = 0; i < result.length - 1; i++) {
      if (Math.random() < 0.3) {
        var tmp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = tmp;
        i++; // skip swapped pair
      }
    }
    return result;
  }

  // ── Game state ──
  var gameState = {
    level: 1,
    levelConfig: LEVELS[0],
    notes: [],
    current: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    startTime: 0,
    answered: false,
    currentNote: null,
    showNoteNames: localStorage.getItem('nqShowNoteNames') === 'true',
  };

  // ── Scoped element queries ──
  function qs(selector) { return wrapper.querySelector(selector); }
  function qsa(selector) { return wrapper.querySelectorAll(selector); }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function needsQuestionReanchor() {
    var staffCard = qs('#nqStaffCard');
    var choices = qs('#nqChoices');
    if (!staffCard || !choices) return false;

    var staffRect = staffCard.getBoundingClientRect();
    var choicesRect = choices.getBoundingClientRect();
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return staffRect.top < 8 || choicesRect.bottom > viewportHeight - 8;
  }

  function anchorQuestionInView(force) {
    var staffCard = qs('#nqStaffCard');
    if (!staffCard) return;
    if (!force && !needsQuestionReanchor()) return;

    staffCard.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  // ── VexFlow rendering (responsive) ──
  function getRendererWidth() {
    var container = qs('#nqStaffCard');
    var available = container.clientWidth - 16;
    return Math.min(420, Math.max(280, available));
  }

  function getEffectiveLabelMode() {
    var config = gameState.levelConfig;
    if (config.labelMode === 'all' || config.labelMode === 'lines') {
      return config.labelMode;
    }
    // labelMode === 'none': show 'lines' only if checkbox is checked
    if (gameState.showNoteNames) return 'lines';
    return 'none';
  }

  function renderNoteLabels(trebleStave, bassStave, div, mode) {
    var svg = div.querySelector('svg');
    if (!svg) return;

    var ns = 'http://www.w3.org/2000/svg';
    // Treble lines (top to bottom, lines 0→4): F5, D5, B4, G4, E4
    var trebleLineNames = ['F', 'D', 'B', 'G', 'E'];
    // Bass lines (top to bottom, lines 0→4): A3, F3, D3, B2, G2
    var bassLineNames = ['A', 'F', 'D', 'B', 'G'];
    // Treble spaces (top to bottom, between lines): E5, C5, A4, F4
    var trebleSpaceNames = ['E', 'C', 'A', 'F'];
    // Bass spaces (top to bottom): G3, E3, C3, A2
    var bassSpaceNames = ['G', 'E', 'C', 'A'];

    var labelX = 7;
    var labelX2 = 20;

    function addLabel(text, x, y, fontSize, fill, fontWeight) {
      var el = document.createElementNS(ns, 'text');
      el.setAttribute('x', x);
      el.setAttribute('y', y + 3);
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('font-size', fontSize);
      el.setAttribute('font-family', 'system-ui, sans-serif');
      el.setAttribute('fill', fill);
      el.setAttribute('font-weight', fontWeight);
      el.textContent = text;
      svg.appendChild(el);
    }

    var showBass = !gameState.levelConfig.clef || gameState.levelConfig.clef !== 'treble';

    if (mode === 'all') {
      // Two-column layout: lines at x=7, spaces at x=20
      // Treble line labels
      for (var i = 0; i < 5; i++) {
        addLabel(trebleLineNames[i], labelX, trebleStave.getYForLine(i), '10px', '#444', '600');
      }
      // Middle C on treble side
      addLabel('C', labelX, trebleStave.getYForLine(5), '10px', '#444', '600');

      // Treble space labels (between lines)
      for (var j = 0; j < 4; j++) {
        var spaceY = (trebleStave.getYForLine(j) + trebleStave.getYForLine(j + 1)) / 2;
        addLabel(trebleSpaceNames[j], labelX2, spaceY, '9px', '#777', '500');
      }
      // D4 space: between line 4 (E4) and Middle C ledger line
      var d4Y = (trebleStave.getYForLine(4) + trebleStave.getYForLine(5)) / 2;
      addLabel('D', labelX2, d4Y, '9px', '#777', '500');

      if (showBass) {
        // Bass line labels
        for (var k = 0; k < 5; k++) {
          addLabel(bassLineNames[k], labelX, bassStave.getYForLine(k), '10px', '#444', '600');
        }
        // Middle C on bass side
        addLabel('C', labelX, bassStave.getYForLine(-1), '10px', '#444', '600');

        // Bass space labels
        for (var m = 0; m < 4; m++) {
          var bassSpaceY = (bassStave.getYForLine(m) + bassStave.getYForLine(m + 1)) / 2;
          addLabel(bassSpaceNames[m], labelX2, bassSpaceY, '9px', '#777', '500');
        }
      }
    } else if (mode === 'lines') {
      // Single column: 5 lines per staff + Middle C
      for (var li = 0; li < 5; li++) {
        addLabel(trebleLineNames[li], labelX, trebleStave.getYForLine(li), '10px', '#444', '600');
      }
      addLabel('C', labelX, trebleStave.getYForLine(5), '10px', '#444', '600');

      if (showBass) {
        for (var lj = 0; lj < 5; lj++) {
          addLabel(bassLineNames[lj], labelX, bassStave.getYForLine(lj), '10px', '#444', '600');
        }
        addLabel('C', labelX, bassStave.getYForLine(-1), '10px', '#444', '600');
      }
    }
    // mode === 'none': no labels rendered
  }

  function renderStaff(note) {
    var container = qs('#nqStaffCard');
    container.textContent = '';

    var div = document.createElement('div');
    container.appendChild(div);

    var rendererWidth = getRendererWidth();
    var renderer = new Renderer(div, Renderer.Backends.SVG);
    renderer.resize(rendererWidth, 260);
    var context = renderer.getContext();
    context.scale(1, 1);

    var effectiveMode = getEffectiveLabelMode();
    var needsLabelSpace = effectiveMode !== 'none';

    var staveX = needsLabelSpace
      ? (effectiveMode === 'all'
        ? (rendererWidth < 340 ? 60 : 70)
        : (rendererWidth < 340 ? 55 : 65))
      : (rendererWidth < 340 ? 40 : 50);
    var staveWidth = rendererWidth - staveX - 40;

    var trebleStave = new Stave(staveX, 10, staveWidth);
    trebleStave.addClef('treble');
    trebleStave.setContext(context).draw();

    var bassStave = new Stave(staveX, 120, staveWidth);
    bassStave.addClef('bass');
    bassStave.setContext(context).draw();

    var brace = new StaveConnector(trebleStave, bassStave);
    brace.setType(StaveConnector.type.BRACE);
    brace.setContext(context).draw();

    var lineLeft = new StaveConnector(trebleStave, bassStave);
    lineLeft.setType(StaveConnector.type.SINGLE_LEFT);
    lineLeft.setContext(context).draw();

    var vexKey = note.name.toLowerCase() + '/' + note.octave;
    var staveNote = new StaveNote({
      keys: [vexKey],
      duration: 'w',
      clef: note.clef,
    });

    var voice = new Voice({ num_beats: 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables([staveNote]);

    var targetStave = note.clef === 'treble' ? trebleStave : bassStave;
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
    voice.draw(context, targetStave);

    if (effectiveMode !== 'none') {
      renderNoteLabels(trebleStave, bassStave, div, effectiveMode);
    }
  }

  // ── Re-render on resize ──
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (gameState.currentNote) {
        renderStaff(gameState.currentNote);
      }
    }, 150);
  });

  // ── Game logic ──
  function startGame(levelNumber) {
    var config = LEVELS[levelNumber - 1];
    if (!config) return;

    gameState.level = levelNumber;
    gameState.levelConfig = config;
    gameState.current = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.bestStreak = 0;
    gameState.startTime = Date.now();
    gameState.answered = false;
    gameState.currentNote = null;

    // Auto-show labels for levels with 'all' or 'lines' labelMode
    if (config.labelMode === 'all' || config.labelMode === 'lines') {
      gameState.showNoteNames = true;
    } else {
      gameState.showNoteNames = noteNamesCheckbox ? noteNamesCheckbox.checked : false;
    }

    var available = getNotesForLevel(config);
    var notes;

    // If both clefs, balance bass/treble ~50/50
    if (!config.clef) {
      var bassPool = available.filter(function (n) { return n.clef === 'bass'; });
      var treblePool = available.filter(function (n) { return n.clef === 'treble'; });
      var halfCount = Math.floor(TOTAL_QUESTIONS / 2);
      var bassCount = halfCount;
      var trebleCount = TOTAL_QUESTIONS - halfCount;
      var bassPicks = pickRandomNotes(bassPool, bassCount);
      var treblePicks = pickRandomNotes(treblePool, trebleCount);
      notes = interleaveNotes(bassPicks, treblePicks);
    } else {
      notes = pickRandomNotes(available, TOTAL_QUESTIONS);
    }

    gameState.notes = notes;
    showScreen('nqGameScreen');
    showQuestion();
    requestAnimationFrame(function () { anchorQuestionInView(true); });
    startTimer();
  }

  function showQuestion() {
    var note = gameState.notes[gameState.current];
    gameState.answered = false;
    gameState.currentNote = note;

    qs('#nqProgress').textContent = (gameState.current + 1) + ' / ' + TOTAL_QUESTIONS;
    qs('#nqScoreDisplay').textContent = gameState.score;
    qs('#nqStreakDisplay').textContent = gameState.streak;

    renderStaff(note);

    if (document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('choice-btn')) {
      document.activeElement.blur();
    }

    var allBtns = qsa('.choice-btn');
    allBtns.forEach(function (btn) {
      btn.classList.remove('correct', 'wrong', 'reveal', 'disabled');
    });
  }

  function handleAnswer(btn, chosen, correct) {
    if (gameState.answered) return;
    gameState.answered = true;

    var allBtns = qsa('.choice-btn');

    if (chosen === correct) {
      btn.classList.add('correct');
      gameState.score++;
      gameState.streak++;
      if (gameState.streak > gameState.bestStreak) gameState.bestStreak = gameState.streak;
    } else {
      btn.classList.add('wrong');
      gameState.streak = 0;
      allBtns.forEach(function (b) {
        if (b.getAttribute('data-note') === correct) b.classList.add('reveal');
      });
    }

    allBtns.forEach(function (b) { b.classList.add('disabled'); });
    qs('#nqScoreDisplay').textContent = gameState.score;
    qs('#nqStreakDisplay').textContent = gameState.streak;

    setTimeout(function () {
      gameState.current++;
      if (gameState.current >= TOTAL_QUESTIONS) {
        showResults();
      } else {
        showQuestion();
        requestAnimationFrame(function () { anchorQuestionInView(true); });
      }
    }, 1000);
  }

  // Timer
  var timerInterval;
  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
      var mins = Math.floor(elapsed / 60);
      var secs = elapsed % 60;
      qs('#nqTimerDisplay').textContent = mins + ':' + String(secs).padStart(2, '0');
    }, 250);
  }

  // Results
  function showResults() {
    clearInterval(timerInterval);
    gameState.currentNote = null;

    var elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    var mins = Math.floor(elapsed / 60);
    var secs = elapsed % 60;
    var accuracy = Math.round((gameState.score / TOTAL_QUESTIONS) * 100);

    var starCount = 0;
    if (gameState.score >= 9) starCount = 3;
    else if (gameState.score >= 7) starCount = 2;
    else if (gameState.score >= 5) starCount = 1;

    qs('#nqStarsDisplay').textContent =
      '\u2B50'.repeat(starCount) + '\u2606'.repeat(3 - starCount);

    var config = gameState.levelConfig;
    var levelLabel = 'Level ' + gameState.level + ' \u2014 ' + config.name;

    var statsEl = qs('#nqResultsStats');
    statsEl.textContent = '';
    var statsData = [
      ['Score', gameState.score + ' / ' + TOTAL_QUESTIONS],
      ['Accuracy', accuracy + '%'],
      ['Time', mins + ':' + String(secs).padStart(2, '0')],
      ['Best Streak', String(gameState.bestStreak)],
      ['Level', levelLabel],
    ];
    statsData.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'stat-row';
      var labelSpan = document.createElement('span');
      labelSpan.className = 'label';
      labelSpan.textContent = row[0];
      var valueSpan = document.createElement('span');
      valueSpan.className = 'value';
      valueSpan.textContent = row[1];
      div.appendChild(labelSpan);
      div.appendChild(valueSpan);
      statsEl.appendChild(div);
    });

    showScreen('nqResultsScreen');
    if (starCount === 3) launchConfetti();
  }

  // ── Screen management ──
  function showScreen(id) {
    qsa('.nq-screen').forEach(function (s) { s.classList.remove('active'); });
    qs('#' + id).classList.add('active');
  }

  function showStart() {
    showScreen('nqStartScreen');
  }

  // ── Confetti ──
  function launchConfetti() {
    var canvas = qs('#nqConfetti');
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var particles = [];
    var colors = ['#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

    for (var i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }

    var frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        p.x += p.vx; p.vy += 0.1; p.y += p.vy; p.rotation += p.rotSpeed;
        if (p.y < canvas.height + 20) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      frame++;
      if (alive && frame < 200) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    animate();
  }

  // ── Wire up event listeners ──
  var noteNamesCheckbox = qs('#nqShowNoteNames');
  if (noteNamesCheckbox) {
    noteNamesCheckbox.checked = gameState.showNoteNames;
    noteNamesCheckbox.addEventListener('change', function () {
      gameState.showNoteNames = noteNamesCheckbox.checked;
      localStorage.setItem('nqShowNoteNames', gameState.showNoteNames);
    });
  }

  qsa('.choice-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chosen = btn.getAttribute('data-note');
      handleAnswer(btn, chosen, gameState.currentNote.name);
    });
  });

  qsa('.level-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var level = parseInt(btn.getAttribute('data-level'));
      startGame(level);
    });
  });

  qs('.play-again-btn').addEventListener('click', function () { showStart(); });
});
