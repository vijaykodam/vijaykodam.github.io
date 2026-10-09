/* Gold Runner: deterministic game simulation, compatible with ES5 browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoldEngine = factory();
}(this, function () {
  'use strict';
  var W = 22, H = 18;
  function cell(x, y) { return { x: x, y: y }; }
  function same(a, b) { return a.x === b.x && a.y === b.y; }
  function actor(x, y) { return { x: x, y: y, px: x, py: y, movedAt: 0, trappedUntil: 0, facing: 1 }; }
  function move(a, c, time) { a.px = a.x; a.py = a.y; if (c.x !== a.x) a.facing = c.x > a.x ? 1 : -1; a.x = c.x; a.y = c.y; a.movedAt = time; }
  function Game() {
    this.level = 1; this.score = 0; this.lives = 3;
    this.started = false; this.paused = false; this.gameOver = false;
    this.loadLevel();
  }
  Game.prototype.active = function () { return this.started && !this.paused && !this.gameOver && !this.levelComplete; };
  Game.prototype.cancelInput = function () { this.input = null; this.queuedInput = null; };
  Game.prototype.press = function (direction) { if (!this.active()) return; if (this.input !== direction) this.queuedInput = direction; this.input = direction; };
  Game.prototype.release = function (direction) { if (this.input === direction) this.input = null; };
  Game.prototype.pause = function () { if (this.active()) { this.paused = true; this.cancelInput(); } };
  Game.prototype.newGame = function () { this.level = 1; this.score = 0; this.lives = 3; this.started = true; this.paused = false; this.gameOver = false; this.loadLevel(); };
  Game.prototype.nextLevel = function () { if (!this.levelComplete) return; this.level++; this.loadLevel(); };
  Game.prototype.loadLevel = function () {
    var x, y, r, b, side = this.level % 3 - 1, ladders = [3 + side, 10, 18 - side], bases = [1, 7, 14, 20];
    this.time = 0; this.stepClock = 0; this.guardClock = 0; this.digCooldown = 0; this.invulnerableUntil = 1.5;
    this.levelComplete = false; this.cancelInput(); this.holes = []; this.gold = []; this.tiles = [];
    for (y = 0; y < H; y++) { this.tiles[y] = []; for (x = 0; x < W; x++) this.tiles[y][x] = y === 17 ? 'steel' : y > 0 && y % 4 === 0 ? 'brick' : 'air'; }
    for (b = 0; b < ladders.length; b++) for (y = 2; y <= 16; y++) this.tiles[y][ladders[b]] = 'ladder';
    for (y = 6; y <= 14; y += 4) for (x = 5; x <= 16; x++) if (this.tiles[y][x] === 'air') this.tiles[y][x] = 'rope';
    for (r = 0; r < 4; r++) for (b = 0; b < bases.length; b++) this.gold.push(cell(Math.max(0, Math.min(21, bases[b] + (this.level + r) % 3 - 1)), 3 + r * 4));
    this.totalGold = this.gold.length; this.player = actor(10, 15); this.guards = [actor(1, 3), actor(20, 7)];
    if (this.level >= 2) this.guards.push(actor(1, 11));
    if (this.level >= 4) this.guards.push(actor(20, 3));
    this.lastEvent = 'Collect every gold cache';
  };
  Game.prototype.tile = function (c) {
    if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) return 'steel';
    for (var i = 0; i < this.holes.length; i++) if (same(this.holes[i], c)) return 'air';
    if (!this.gold.length && c.x === 10 && c.y <= 2) return 'ladder';
    return this.tiles[c.y][c.x];
  };
  Game.prototype.solid = function (c) { var t = this.tile(c); return t === 'brick' || t === 'steel'; };
  Game.prototype.supported = function (c) {
    var t = this.tile(c), below = cell(c.x, c.y + 1);
    if (t === 'ladder' || t === 'rope' || this.solid(below)) return true;
    for (var i = 0; i < this.guards.length; i++) if (same(this.guards[i], below) && this.guards[i].trappedUntil > this.time) return true;
    return false;
  };
  Game.prototype.destination = function (c, dir) {
    var n = cell(c.x, c.y);
    if (dir === 'left') n.x--; else if (dir === 'right') n.x++;
    else if (dir === 'up') { if (this.tile(c) !== 'ladder') return null; n.y--; }
    else if (dir === 'down') { n.y++; if (this.tile(c) !== 'ladder' && this.tile(n) !== 'ladder' && this.tile(c) !== 'rope') return null; }
    else return null;
    return !this.solid(n) && n.y >= 0 && n.y < H ? n : null;
  };
  Game.prototype.dig = function (side) {
    if (!this.active() || this.time < this.digCooldown || !this.supported(this.player)) return false;
    var adjacent = cell(this.player.x + side, this.player.y), target = cell(adjacent.x, adjacent.y + 1);
    if (this.solid(adjacent) || this.tile(target) !== 'brick') return false;
    this.holes.push({ x: target.x, y: target.y, closesAt: this.time + 4.2 });
    this.player.facing = side; this.digCooldown = this.time + 0.22; this.lastEvent = 'Hole open. Keep moving!'; return true;
  };
  Game.prototype.chaseStep = function (start) {
    var queue = [{ c: cell(start.x, start.y), first: null }], seen = {}, head = 0, directions = ['left', 'right', 'up', 'down'];
    seen[start.y * W + start.x] = true;
    while (head < queue.length) {
      var item = queue[head++], c = item.c, neighbors = [], n, i, key;
      if (same(c, this.player)) return item.first;
      if (!this.supported(c)) neighbors.push(cell(c.x, c.y + 1));
      else for (i = 0; i < directions.length; i++) { n = this.destination(c, directions[i]); if (n) neighbors.push(n); }
      for (i = 0; i < neighbors.length; i++) { n = neighbors[i]; key = n.y * W + n.x; if (n.y < H && !seen[key]) { seen[key] = true; queue.push({ c: n, first: item.first || n }); } }
    }
    return null;
  };
  Game.prototype.loseLife = function () {
    this.lives--; this.cancelInput();
    if (this.lives <= 0) { this.gameOver = true; this.lastEvent = 'Run complete'; return; }
    this.player = actor(10, 15);
    for (var i = 0; i < this.guards.length; i++) this.guards[i] = actor(i % 2 === 0 ? 1 : 20, i === 2 ? 11 : 3);
    this.invulnerableUntil = this.time + 1.8; this.lastEvent = 'Caught! ' + this.lives + ' lives remaining';
  };
  Game.prototype.advance = function (delta) {
    if (!this.active()) return;
    delta = Math.max(0, Math.min(delta, 0.1)); this.time += delta; this.stepClock += delta;
    if (this.stepClock < 0.13) return;
    this.stepClock -= 0.13;
    var closing = [], kept = [], i, h, g, old, target, side, choices;
    for (i = 0; i < this.holes.length; i++) { h = this.holes[i]; (h.closesAt <= this.time ? closing : kept).push(h); }
    this.holes = kept;
    for (i = 0; i < closing.length; i++) {
      h = closing[i]; if (same(this.player, h)) { this.loseLife(); return; }
      for (var j = 0; j < this.guards.length; j++) if (same(this.guards[j], h)) { this.score += 75; this.guards[j] = actor(j % 2 === 0 ? 1 : 20, 3); }
    }
    var oldPlayer = cell(this.player.x, this.player.y), direction = this.queuedInput || this.input;
    this.queuedInput = null;
    if (!this.supported(this.player)) move(this.player, cell(this.player.x, this.player.y + 1), this.time);
    else if (direction) { target = this.destination(this.player, direction); if (target) move(this.player, target, this.time); }
    for (i = this.gold.length - 1; i >= 0; i--) if (same(this.gold[i], this.player)) { this.gold.splice(i, 1); this.score += 100; this.lastEvent = this.gold.length ? 'Gold secured. ' + this.gold.length + ' to go' : 'Exit open! Climb to the top'; }
    if (!this.gold.length && this.player.x === 10 && this.player.y === 0) { this.score += 500; this.levelComplete = true; this.cancelInput(); return; }
    this.guardClock++;
    for (i = 0; i < this.guards.length; i++) {
      g = this.guards[i]; old = cell(g.x, g.y);
      if (g.trappedUntil > this.time) continue;
      if (g.trappedUntil > 0) {
        side = this.player.x < g.x ? -1 : 1; choices = [cell(g.x + side, g.y - 1), cell(g.x - side, g.y - 1)];
        for (j = 0; j < choices.length; j++) if (!this.solid(choices[j])) { move(g, choices[j], this.time); g.trappedUntil = 0; break; }
      } else if (!this.supported(g)) {
        target = cell(g.x, g.y + 1); move(g, target, this.time);
        for (j = 0; j < this.holes.length; j++) if (same(this.holes[j], target)) { g.trappedUntil = this.time + 2.6; this.score += 25; }
      } else if (this.guardClock % (this.level >= 5 ? 2 : 3) === 0) { target = this.chaseStep(g); if (target) move(g, target, this.time); }
      if (this.time > this.invulnerableUntil && g.trappedUntil <= this.time && (same(g, this.player) || (same(old, this.player) && same(g, oldPlayer)))) { this.loseLife(); return; }
    }
  };
  Game.WIDTH = W; Game.HEIGHT = H;
  return Game;
}));
