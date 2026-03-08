document.addEventListener('DOMContentLoaded', function () {
  var wrapper = document.querySelector('.note-quest-expert-wrapper');
  if (!wrapper) return;

  var Stave = VexFlow.Stave;
  var StaveNote = VexFlow.StaveNote;
  var Voice = VexFlow.Voice;
  var Formatter = VexFlow.Formatter;
  var Renderer = VexFlow.Renderer;
  var StaveConnector = VexFlow.StaveConnector;
  var Accidental = VexFlow.Accidental;

  // ── Note data (with accidentals) ──
  // accidental: '#', 'b', or null
  var NOTES_DB = [];

  (function buildNotesDB() {
    // Notes that can have sharps: C, D, F, G, A
    var sharpable = { C: true, D: true, F: true, G: true, A: true };
    // Notes that can have flats: D, E, G, A, B
    var flatable = { D: true, E: true, G: true, A: true, B: true };

    var trebleNotes = [
      'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
      'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
      'C6',
    ];

    var bassNotes = [
      'E2', 'F2', 'G2', 'A2', 'B2',
      'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
      'C4',
    ];

    function addNotes(noteList, clef) {
      noteList.forEach(function (n) {
        var name = n[0];
        var octave = parseInt(n.slice(1));

        // Natural
        NOTES_DB.push({ name: name, octave: octave, clef: clef, accidental: null });

        // Sharp variant
        if (sharpable[name]) {
          NOTES_DB.push({ name: name, octave: octave, clef: clef, accidental: '#' });
        }

        // Flat variant
        if (flatable[name]) {
          NOTES_DB.push({ name: name, octave: octave, clef: clef, accidental: 'b' });
        }
      });
    }

    addNotes(bassNotes, 'bass');
    addNotes(trebleNotes, 'treble');
  })();

  var TOTAL_QUESTIONS = 10;

  function noteKey(n) { return n.name + (n.accidental || '') + n.octave; }

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
    var useBass = Math.random() < 0.5;
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
    for (var i = 0; i < result.length - 1; i++) {
      if (Math.random() < 0.3) {
        var tmp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = tmp;
        i++;
      }
    }
    return result;
  }

  // ── Game state ──
  var gameState = {
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
    var staffCard = qs('#nqeStaffCard');
    var choices = qs('#nqeChoices');
    if (!staffCard || !choices) return false;

    var staffRect = staffCard.getBoundingClientRect();
    var choicesRect = choices.getBoundingClientRect();
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return staffRect.top < 8 || choicesRect.bottom > viewportHeight - 8;
  }

  function anchorQuestionInView(force) {
    var staffCard = qs('#nqeStaffCard');
    if (!staffCard) return;
    if (!force && !needsQuestionReanchor()) return;

    staffCard.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  // ── VexFlow rendering ──
  function getRendererWidth() {
    var container = qs('#nqeStaffCard');
    var available = container.clientWidth - 16;
    return Math.min(420, Math.max(280, available));
  }

  function renderStaff(note) {
    var container = qs('#nqeStaffCard');
    container.textContent = '';

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

    var vexKey = note.name.toLowerCase() + (note.accidental || '') + '/' + note.octave;
    var staveNote = new StaveNote({
      keys: [vexKey],
      duration: 'w',
      clef: note.clef,
    });

    if (note.accidental) {
      staveNote.addModifier(new Accidental(note.accidental));
    }

    var voice = new Voice({ num_beats: 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables([staveNote]);

    var targetStave = note.clef === 'treble' ? trebleStave : bassStave;
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
    voice.draw(context, targetStave);
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
  function startGame() {
    gameState.current = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.bestStreak = 0;
    gameState.startTime = Date.now();
    gameState.answered = false;
    gameState.currentNote = null;

    var bassPool = NOTES_DB.filter(function (n) { return n.clef === 'bass'; });
    var treblePool = NOTES_DB.filter(function (n) { return n.clef === 'treble'; });

    var halfCount = Math.floor(TOTAL_QUESTIONS / 2);
    var bassPicks = pickRandomNotes(bassPool, halfCount);
    var treblePicks = pickRandomNotes(treblePool, TOTAL_QUESTIONS - halfCount);
    var notes = interleaveNotes(bassPicks, treblePicks);

    // Guarantee at least 3 accidentals
    var accidentalCount = notes.filter(function (n) { return n.accidental; }).length;
    if (accidentalCount < 3) {
      var allAccidentals = NOTES_DB.filter(function (n) { return n.accidental; });
      var naturalIndices = [];
      notes.forEach(function (n, i) {
        if (!n.accidental) naturalIndices.push(i);
      });
      // Shuffle natural indices and replace up to (3 - accidentalCount) of them
      for (var i = naturalIndices.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = naturalIndices[i];
        naturalIndices[i] = naturalIndices[j];
        naturalIndices[j] = tmp;
      }
      var needed = 3 - accidentalCount;
      for (var k = 0; k < needed && k < naturalIndices.length; k++) {
        var idx = naturalIndices[k];
        var clef = notes[idx].clef;
        var pool = allAccidentals.filter(function (n) { return n.clef === clef; });
        if (pool.length > 0) {
          notes[idx] = pool[Math.floor(Math.random() * pool.length)];
        }
      }
    }

    gameState.notes = notes;
    showScreen('nqeGameScreen');
    showQuestion();
    requestAnimationFrame(function () { anchorQuestionInView(true); });
    startTimer();
  }

  function showQuestion() {
    var note = gameState.notes[gameState.current];
    gameState.answered = false;
    gameState.currentNote = note;

    qs('#nqeProgress').textContent = (gameState.current + 1) + ' / ' + TOTAL_QUESTIONS;
    qs('#nqeScoreDisplay').textContent = gameState.score;
    qs('#nqeStreakDisplay').textContent = gameState.streak;

    renderStaff(note);

    // Update accidental button labels based on current note
    var useFlats = (note.accidental === 'b');
    qsa('.nqe-accidental').forEach(function (btn) {
      var key = useFlats ? btn.getAttribute('data-flat-key') : btn.getAttribute('data-sharp-key');
      var label = useFlats ? btn.getAttribute('data-flat') : btn.getAttribute('data-sharp');
      btn.setAttribute('data-note', key);
      btn.textContent = label;
    });

    if (document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('nqe-choice-btn')) {
      document.activeElement.blur();
    }

    var allBtns = qsa('.nqe-choice-btn');
    allBtns.forEach(function (btn) {
      btn.classList.remove('correct', 'wrong', 'reveal', 'disabled');
    });
  }

  function getCorrectAnswer(note) {
    return note.name + (note.accidental === '#' ? '#' : note.accidental === 'b' ? 'b' : '');
  }

  function handleAnswer(btn, chosen, correct) {
    if (gameState.answered) return;
    gameState.answered = true;

    var allBtns = qsa('.nqe-choice-btn');

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
    qs('#nqeScoreDisplay').textContent = gameState.score;
    qs('#nqeStreakDisplay').textContent = gameState.streak;

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
      qs('#nqeTimerDisplay').textContent = mins + ':' + String(secs).padStart(2, '0');
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

    qs('#nqeStarsDisplay').textContent =
      '\u2B50'.repeat(starCount) + '\u2606'.repeat(3 - starCount);

    var statsEl = qs('#nqeResultsStats');
    statsEl.textContent = '';
    var statsData = [
      ['Score', gameState.score + ' / ' + TOTAL_QUESTIONS],
      ['Accuracy', accuracy + '%'],
      ['Time', mins + ':' + String(secs).padStart(2, '0')],
      ['Best Streak', String(gameState.bestStreak)],
      ['Difficulty', 'Expert'],
    ];
    statsData.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'nqe-stat-row';
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

    showScreen('nqeResultsScreen');
    if (starCount === 3) launchConfetti();
  }

  // ── Screen management ──
  function showScreen(id) {
    qsa('.nqe-screen').forEach(function (s) { s.classList.remove('active'); });
    qs('#' + id).classList.add('active');
  }

  // ── Confetti ──
  function launchConfetti() {
    var canvas = qs('#nqeConfetti');
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
  qs('#nqeStartBtn').addEventListener('click', function () { startGame(); });

  qsa('.nqe-choice-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var chosen = btn.getAttribute('data-note');
      var correct = getCorrectAnswer(gameState.currentNote);
      handleAnswer(btn, chosen, correct);
    });
  });

  qs('#nqePlayAgainBtn').addEventListener('click', function () { startGame(); });
});
