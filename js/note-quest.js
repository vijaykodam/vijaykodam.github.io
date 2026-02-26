document.addEventListener('DOMContentLoaded', function () {
  const wrapper = document.querySelector('.note-quest-wrapper');
  if (!wrapper) return;

  const { Factory, Stave, StaveNote, Voice, Formatter, Renderer, StaveConnector } = VexFlow;

  // ── Note data ──
  const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  const NOTES_DB = [];

  (function buildNotesDB() {
    const trebleNotes = [
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

    const bassNotes = [
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

    NOTES_DB.push(...bassNotes, ...trebleNotes);
  })();

  const DIFFICULTY = {
    easy:   { min: 'C4', max: 'G5', clef: 'treble' },
    medium: { min: 'A3', max: 'C6' },
    hard:   { min: 'E2', max: 'C6' },
  };

  function noteKey(n) { return n.name + n.octave; }

  function noteIndex(name, octave) {
    const order = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
    return octave * 7 + order[name];
  }

  function getNotesForDifficulty(diff) {
    const d = DIFFICULTY[diff];
    const minIdx = noteIndex(d.min[0], parseInt(d.min.slice(1)));
    const maxIdx = noteIndex(d.max[0], parseInt(d.max.slice(1)));

    let notes = NOTES_DB.filter(function (n) {
      const idx = noteIndex(n.name, n.octave);
      return idx >= minIdx && idx <= maxIdx;
    });

    if (d.clef === 'treble') {
      notes = notes.filter(function (n) { return n.clef === 'treble'; });
    }

    return notes;
  }

  // ── Game state ──
  var gameState = {
    difficulty: 'easy',
    notes: [],
    current: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    startTime: 0,
    answered: false,
    currentNote: null,
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
    var available = container.clientWidth - 16; // account for card padding
    return Math.min(420, Math.max(280, available));
  }

  function renderStaff(note) {
    var container = qs('#nqStaffCard');
    container.innerHTML = '';

    var div = document.createElement('div');
    container.appendChild(div);

    var rendererWidth = getRendererWidth();
    var renderer = new Renderer(div, Renderer.Backends.SVG);
    renderer.resize(rendererWidth, 260);
    var context = renderer.getContext();
    context.scale(1, 1);

    var staveX = rendererWidth < 340 ? 40 : 50;
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
  }

  // ── Re-render on resize (orientation change, etc.) ──
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (gameState.currentNote) {
        renderStaff(gameState.currentNote);
      }
    }, 150);
  });

  // ── Distractor generation ──
  function generateChoices(correctNote) {
    var choices = [correctNote.name];
    var ci = NOTE_NAMES.indexOf(correctNote.name);

    var candidates = [];
    for (var offset = -3; offset <= 3; offset++) {
      if (offset === 0) continue;
      var idx = ((ci + offset) % 7 + 7) % 7;
      candidates.push(NOTE_NAMES[idx]);
    }

    for (var i = candidates.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }

    for (var k = 0; k < candidates.length; k++) {
      if (choices.length >= 4) break;
      if (choices.indexOf(candidates[k]) === -1) choices.push(candidates[k]);
    }

    for (var i2 = choices.length - 1; i2 > 0; i2--) {
      var j2 = Math.floor(Math.random() * (i2 + 1));
      var tmp2 = choices[i2]; choices[i2] = choices[j2]; choices[j2] = tmp2;
    }

    return choices;
  }

  // ── Game logic ──
  function startGame(difficulty) {
    gameState.difficulty = difficulty;
    gameState.current = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.bestStreak = 0;
    gameState.startTime = Date.now();
    gameState.answered = false;
    gameState.currentNote = null;

    var available = getNotesForDifficulty(difficulty);
    var notes = [];

    for (var i = 0; i < 20; i++) {
      var note;
      do {
        note = available[Math.floor(Math.random() * available.length)];
      } while (notes.length > 0 && noteKey(note) === noteKey(notes[notes.length - 1]));
      notes.push(note);
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

    qs('#nqProgress').textContent = (gameState.current + 1) + ' / 20';
    qs('#nqScoreDisplay').textContent = gameState.score;
    qs('#nqStreakDisplay').textContent = gameState.streak;

    renderStaff(note);

    var choices = generateChoices(note);
    var choicesEl = qs('#nqChoices');
    if (document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('choice-btn')) {
      document.activeElement.blur();
    }
    choicesEl.textContent = '';

    choices.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c;
      btn.addEventListener('click', function () { handleAnswer(btn, c, note.name); });
      choicesEl.appendChild(btn);
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
        if (b.textContent === correct) b.classList.add('reveal');
      });
    }

    allBtns.forEach(function (b) { b.classList.add('disabled'); });
    qs('#nqScoreDisplay').textContent = gameState.score;
    qs('#nqStreakDisplay').textContent = gameState.streak;

    setTimeout(function () {
      gameState.current++;
      if (gameState.current >= 20) {
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
    var accuracy = Math.round((gameState.score / 20) * 100);

    var starCount = 0;
    if (gameState.score >= 18) starCount = 3;
    else if (gameState.score >= 14) starCount = 2;
    else if (gameState.score >= 10) starCount = 1;

    qs('#nqStarsDisplay').textContent =
      '\u2B50'.repeat(starCount) + '\u2606'.repeat(3 - starCount);

    // Build results stats using safe DOM methods
    var statsEl = qs('#nqResultsStats');
    statsEl.textContent = '';
    var statsData = [
      ['Score', gameState.score + ' / 20'],
      ['Accuracy', accuracy + '%'],
      ['Time', mins + ':' + String(secs).padStart(2, '0')],
      ['Best Streak', String(gameState.bestStreak)],
      ['Difficulty', gameState.difficulty.charAt(0).toUpperCase() + gameState.difficulty.slice(1)],
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
  qs('.diff-btn.easy').addEventListener('click', function () { startGame('easy'); });
  qs('.diff-btn.medium').addEventListener('click', function () { startGame('medium'); });
  qs('.diff-btn.hard').addEventListener('click', function () { startGame('hard'); });
  qs('.play-again-btn').addEventListener('click', function () { showStart(); });
});
