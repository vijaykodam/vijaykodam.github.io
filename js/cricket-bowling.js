// Cricket Bowling Game
// MediaPipe HandLandmarker + Three.js
// Grip the ball, bowl, and hit the wickets!

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

/////////////////////////
// Configuration
/////////////////////////

const APP_NAME = "Cricket Bowling";

// Hand landmark indices
const WRIST = 0;
const INDEX_MCP = 5;
const PINKY_MCP = 17;
const FINGERTIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

// Grip detection thresholds
let GRIP_CLOSED_THRESHOLD = 0.15;  // Hand is gripping ball (lower = tighter grip)
let GRIP_OPEN_THRESHOLD = 0.22;    // Hand has released

// 3D mapping (from hand landmarks to world coordinates)
const PLANE_WIDTH_SCALE = 2.5;
const PLANE_HEIGHT_SCALE = 2.0;
const DEPTH_SCALE = 0.6;

// Smoothing
let SMOOTHING = 0.25;

// Cricket pitch configuration
const PITCH = {
  length: 5.0,           // World units
  width: 0.8,            // World units
  wicketZ: -5.0,         // Far end of pitch
  releaseZ: 0.0,         // Near camera (bowling crease area)

  // Wicket dimensions (scaled for visibility)
  stumpHeight: 0.35,
  stumpRadius: 0.015,
  stumpSpacing: 0.045,
  bailLength: 0.05,
  bailRadius: 0.006,

  // Ball
  ballRadius: 0.045,
};

// Ball physics
const PHYSICS = {
  gravity: -12.0,
  airResistance: 0.012,      // Reduced for better mobile performance
  spinCurveFactor: 1.2,
  bounceRestitution: 0.6,    // Increased from 0.5 - ball retains more energy after bounce
  groundY: PITCH.ballRadius,
  spinBounceBoost: 0.6,
};

// Velocity calculation
const VELOCITY_WINDOW_MS = 350;    // Increased for mobile (lower fps = fewer samples)
const MIN_SAMPLES_FOR_VELOCITY = 3; // Reduced for mobile compatibility
const BOWLING_MOTION_THRESHOLD = 0.12; // Slightly lower threshold for mobile

// Spin detection
const SPIN_ANGLE_THRESHOLD = 0.25;

/////////////////////////
// DOM
/////////////////////////

const el = {
  webcam: document.getElementById("webcam"),
  overlay2d: document.getElementById("overlay2d"),
  threeCanvas: document.getElementById("threeCanvas"),

  btnWebcam: document.getElementById("btnWebcam"),
  btnOverlay: document.getElementById("btnOverlay"),
  btnReset: document.getElementById("btnReset"),

  cameraError: document.getElementById("cameraError"),
  gameHint: document.getElementById("gameHint"),
  resultDisplay: document.getElementById("resultDisplay"),
  resultIcon: document.getElementById("resultIcon"),
  resultText: document.getElementById("resultText"),
  resultDetails: document.getElementById("resultDetails"),

  statusPhase: document.getElementById("statusPhase"),
  statusSpeed: document.getElementById("statusSpeed"),
  statusBallType: document.getElementById("statusBallType"),
  statusScore: document.getElementById("statusScore"),
  statusFps: document.getElementById("statusFps"),

  statFast: document.getElementById("statFast"),
  statSpin: document.getElementById("statSpin"),
};

/////////////////////////
// Utilities
/////////////////////////

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function nowMs() { return performance.now(); }

/////////////////////////
// 2D overlay drawing
/////////////////////////

const HAND_CONNECTIONS = [
  [0, 1],[1, 2],[2, 3],[3, 4],          // thumb
  [0, 5],[5, 6],[6, 7],[7, 8],          // index
  [0, 9],[9,10],[10,11],[11,12],        // middle
  [0,13],[13,14],[14,15],[15,16],       // ring
  [0,17],[17,18],[18,19],[19,20],       // pinky
  [5, 9],[9,13],[13,17],                // palm
];

function drawOverlay(landmarks) {
  const canvas = el.overlay2d;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  const px = (x) => (1 - x) * w;
  const py = (y) => y * h;

  // connectors
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(200, 50, 50, 0.6)";
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const A = landmarks[a], B = landmarks[b];
    if (!A || !B) continue;
    ctx.moveTo(px(A.x), py(A.y));
    ctx.lineTo(px(B.x), py(B.y));
  }
  ctx.stroke();

  // points
  ctx.fillStyle = "rgba(180, 30, 30, 0.9)";
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const r = FINGERTIPS.includes(i) ? 5 : 3;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grip indicator
  if (gameState.phase === 'GRIPPING' || gameState.phase === 'BOWLING') {
    ctx.fillStyle = "rgba(0, 200, 0, 0.8)";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("GRIPPING", 10, 25);
  }
}

function resizeOverlayToVideo() {
  const canvas = el.overlay2d;
  const video = el.webcam;

  const rect = video.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/////////////////////////
// Three.js Scene
/////////////////////////

let scene, camera, renderer, controls;
let ground, pitchStrip, wicketGroup;
let ball, ballTrail;
let stumps = [];
let bails = [];
let sun;

function initCricketScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue

  const canvas = el.threeCanvas;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Camera - behind and above the bowler
  camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.01, 100);
  camera.position.set(0, 2.8, 2.0);
  camera.lookAt(0, 0.3, PITCH.wicketZ);

  // Orbit controls (disabled during play, can enable for viewing)
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.target.set(0, 0.2, PITCH.wicketZ / 2);
  controls.enabled = false;
  controls.update();

  // Lighting - outdoor sunny day
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x228B22, 0.4);
  scene.add(hemi);

  sun = new THREE.DirectionalLight(0xfffacd, 1.4);
  sun.position.set(4, 8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 25;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.radius = 2;
  scene.add(sun);

  // Ground (grass field)
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2d8a2d,
    roughness: 0.9,
  });
  ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.position.z = PITCH.wicketZ / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Pitch strip (tan/brown)
  const pitchGeo = new THREE.PlaneGeometry(PITCH.width, PITCH.length);
  const pitchMat = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    roughness: 0.75,
  });
  pitchStrip = new THREE.Mesh(pitchGeo, pitchMat);
  pitchStrip.rotation.x = -Math.PI / 2;
  pitchStrip.position.y = 0.001;
  pitchStrip.position.z = PITCH.wicketZ / 2;
  pitchStrip.receiveShadow = true;
  scene.add(pitchStrip);

  // Crease lines
  createCreaseLines();

  // Wickets
  createWickets();

  // Ball
  createBall();

  window.addEventListener("resize", onResize, { passive: true });
  requestAnimationFrame(renderLoop);
}

function createCreaseLines() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });

  // Bowling crease (near camera)
  const bowlingCrease = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-PITCH.width / 2, 0.002, -0.5),
    new THREE.Vector3(PITCH.width / 2, 0.002, -0.5),
  ]);
  scene.add(new THREE.Line(bowlingCrease, lineMat));

  // Popping crease (at wickets)
  const poppingCrease = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-PITCH.width / 2, 0.002, PITCH.wicketZ + 0.3),
    new THREE.Vector3(PITCH.width / 2, 0.002, PITCH.wicketZ + 0.3),
  ]);
  scene.add(new THREE.Line(poppingCrease, lineMat));
}

function createWickets() {
  wicketGroup = new THREE.Group();
  wicketGroup.position.set(0, 0, PITCH.wicketZ);

  const stumpGeo = new THREE.CylinderGeometry(
    PITCH.stumpRadius,
    PITCH.stumpRadius,
    PITCH.stumpHeight,
    8
  );
  const stumpMat = new THREE.MeshStandardMaterial({
    color: 0xf5deb3,
    roughness: 0.5,
  });

  stumps = [];
  for (let i = -1; i <= 1; i++) {
    const stump = new THREE.Mesh(stumpGeo, stumpMat.clone());
    stump.position.set(i * PITCH.stumpSpacing, PITCH.stumpHeight / 2, 0);
    stump.castShadow = true;
    stump.userData = {
      originalPos: stump.position.clone(),
      originalRot: stump.rotation.clone(),
      fallen: false
    };
    wicketGroup.add(stump);
    stumps.push(stump);
  }

  // Bails
  const bailGeo = new THREE.CylinderGeometry(PITCH.bailRadius, PITCH.bailRadius, PITCH.bailLength, 6);
  const bailMat = new THREE.MeshStandardMaterial({ color: 0xf5deb3 });

  bails = [];
  for (let i = 0; i < 2; i++) {
    const bail = new THREE.Mesh(bailGeo, bailMat.clone());
    bail.rotation.z = Math.PI / 2;
    bail.position.set(
      (i - 0.5) * PITCH.stumpSpacing,
      PITCH.stumpHeight + PITCH.bailRadius + 0.002,
      0
    );
    bail.userData = {
      originalPos: bail.position.clone(),
      originalRot: bail.rotation.clone(),
      fallen: false
    };
    wicketGroup.add(bail);
    bails.push(bail);
  }

  scene.add(wicketGroup);
}

function resetWickets() {
  for (const stump of stumps) {
    stump.position.copy(stump.userData.originalPos);
    stump.rotation.copy(stump.userData.originalRot);
    stump.userData.fallen = false;
  }
  for (const bail of bails) {
    bail.position.copy(bail.userData.originalPos);
    bail.rotation.copy(bail.userData.originalRot);
    bail.userData.fallen = false;
  }
}

function createBall() {
  const ballGeo = new THREE.SphereGeometry(PITCH.ballRadius, 24, 16);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xaa0000,
    roughness: 0.35,
    metalness: 0.1,
  });
  ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);

  // Ball trail (for spin visualization)
  const trailGeo = new THREE.BufferGeometry();
  const trailMat = new THREE.LineBasicMaterial({
    color: 0xff6666,
    transparent: true,
    opacity: 0.6,
  });
  ballTrail = new THREE.Line(trailGeo, trailMat);
  ballTrail.visible = false;
  scene.add(ballTrail);
}

function onResize() {
  const canvas = el.threeCanvas;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  resizeOverlayToVideo();
}

function renderLoop() {
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

/////////////////////////
// Game State
/////////////////////////

const gameState = {
  phase: 'READY', // READY | GRIPPING | BOWLING | IN_FLIGHT | RESULT

  // Grip tracking
  gripStartTime: 0,
  positionHistory: [],

  // Release data
  releaseVelocity: null,
  releasePosition: null,
  spinType: 'FAST',
  spinMagnitude: 0,

  // Ball flight
  ballPosition: null,
  ballVelocity: null,
  flightStartTime: 0,
  trailPoints: [],
  hasBounced: false,

  // Result
  result: null,

  // Stats
  totalBowls: 0,
  wicketsTaken: 0,
  fastBalls: 0,
  legSpinBalls: 0,
  offSpinBalls: 0,

  // Hand tracking
  handDetected: false,
};

let lastPhysicsTime = 0;
let lastSmoothed = null;

function resetToReady() {
  gameState.phase = 'READY';
  gameState.positionHistory = [];
  gameState.releaseVelocity = null;
  gameState.releasePosition = null;
  gameState.ballPosition = null;
  gameState.ballVelocity = null;
  gameState.trailPoints = [];
  gameState.hasBounced = false;
  ball.visible = false;
  ballTrail.visible = false;
  lastSmoothed = null;
}

function resetForNextBowl() {
  resetToReady();
  resetWickets();
  if (el.resultDisplay) el.resultDisplay.classList.add('hidden');
  if (el.gameHint) el.gameHint.classList.remove('hidden');
}

/////////////////////////
// Gesture Detection
/////////////////////////

function calculateGripScore(landmarks) {
  const wrist = landmarks[WRIST];
  let totalDist = 0;

  for (const tipIdx of FINGERTIPS) {
    const tip = landmarks[tipIdx];
    const dx = tip.x - wrist.x;
    const dy = tip.y - wrist.y;
    const dz = tip.z - wrist.z;
    totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return totalDist / FINGERTIPS.length;
}

function calculateWristAngle(landmarks) {
  const indexMcp = landmarks[INDEX_MCP];
  const pinkyMcp = landmarks[PINKY_MCP];

  const dx = indexMcp.x - pinkyMcp.x;
  const dy = indexMcp.y - pinkyMcp.y;

  return Math.atan2(dy, dx);
}

function mapLandmarkTo3D(lm) {
  const xNorm = 1 - lm.x;
  const yNorm = lm.y;
  const zNorm = lm.z;

  const x3 = (xNorm - 0.5) * PLANE_WIDTH_SCALE;
  const y3 = (0.5 - yNorm) * PLANE_HEIGHT_SCALE + 0.5; // Offset up a bit
  const z3 = (-zNorm) * DEPTH_SCALE;

  return new THREE.Vector3(x3, y3, z3);
}

function smoothPoint(p) {
  if (!lastSmoothed) {
    lastSmoothed = p.clone();
    return p;
  }
  const alpha = 1 - SMOOTHING;
  lastSmoothed.lerp(p, alpha);
  return lastSmoothed.clone();
}

function detectBowlingMotion(history) {
  if (history.length < 8) return false;

  const recent = history.slice(-8);
  const first = recent[0];
  const last = recent[recent.length - 1];

  // Check for forward + downward motion (bowling arm comes down and forward)
  const forwardMotion = first.z - last.z;
  const downwardMotion = first.y - last.y;

  return forwardMotion > BOWLING_MOTION_THRESHOLD || downwardMotion > BOWLING_MOTION_THRESHOLD;
}

function calculateReleaseVelocity(history, releaseTime) {
  const recent = history.filter(p =>
    releaseTime - p.t <= VELOCITY_WINDOW_MS &&
    releaseTime - p.t > 0
  );

  if (recent.length < MIN_SAMPLES_FOR_VELOCITY) {
    return new THREE.Vector3(0, 1, -6); // Increased default z velocity
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;

  if (dt < 0.02) return new THREE.Vector3(0, 1, -6);

  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const vz = (last.z - first.z) / dt;

  // On mobile, z (depth) detection is often poor
  // Use downward motion (negative vy) as proxy for forward motion
  // Bowling motion involves arm coming down AND forward
  let effectiveVz = vz;
  if (vy < -0.5) {
    // Strong downward motion detected - boost forward velocity
    effectiveVz = Math.min(effectiveVz, vy * 1.5);
  }

  return new THREE.Vector3(vx, vy, effectiveVz);
}

function calculateSpinFromHistory(history) {
  if (history.length < 5) {
    return { type: 'FAST', magnitude: 0 };
  }

  const recent = history.slice(-5);
  const angleChange = recent[recent.length - 1].wristAngle - recent[0].wristAngle;
  const timeSpan = (recent[recent.length - 1].t - recent[0].t) / 1000;

  if (timeSpan < 0.01) return { type: 'FAST', magnitude: 0 };

  const angularVelocity = angleChange / timeSpan;

  if (Math.abs(angleChange) < SPIN_ANGLE_THRESHOLD) {
    return { type: 'FAST', magnitude: 0 };
  } else if (angleChange > SPIN_ANGLE_THRESHOLD) {
    return { type: 'LEG_SPIN', magnitude: Math.abs(angularVelocity) };
  } else {
    return { type: 'OFF_SPIN', magnitude: Math.abs(angularVelocity) };
  }
}

/////////////////////////
// Ball Physics
/////////////////////////

function updateBallPhysics(deltaTime) {
  if (gameState.phase !== 'IN_FLIGHT') return;

  const pos = gameState.ballPosition;
  const vel = gameState.ballVelocity;
  const dt = Math.min(deltaTime, 0.05); // Cap delta time

  // Gravity
  vel.y += PHYSICS.gravity * dt;

  // Air resistance (frame-rate independent using exponential decay)
  // At 60fps, dt ≈ 0.0167, so drag per frame ≈ 0.025% which compounds to ~1.5% per second
  const dragFactor = Math.pow(1 - PHYSICS.airResistance, dt * 60);
  vel.multiplyScalar(dragFactor);

  // Spin curve (lateral movement)
  if (gameState.spinType === 'LEG_SPIN') {
    vel.x += PHYSICS.spinCurveFactor * gameState.spinMagnitude * dt * 0.1;
  } else if (gameState.spinType === 'OFF_SPIN') {
    vel.x -= PHYSICS.spinCurveFactor * gameState.spinMagnitude * dt * 0.1;
  }

  // Update position
  pos.add(vel.clone().multiplyScalar(dt));

  // Ground bounce
  if (pos.y < PHYSICS.groundY) {
    pos.y = PHYSICS.groundY;
    vel.y = -vel.y * PHYSICS.bounceRestitution;

    if (!gameState.hasBounced) {
      gameState.hasBounced = true;
      // Add extra spin effect after bounce
      if (gameState.spinType === 'LEG_SPIN') {
        vel.x += PHYSICS.spinBounceBoost;
      } else if (gameState.spinType === 'OFF_SPIN') {
        vel.x -= PHYSICS.spinBounceBoost;
      }
    }
  }

  // Update ball mesh
  ball.position.copy(pos);
  ball.rotation.x += vel.z * dt * 5;
  ball.rotation.z += vel.x * dt * 5;

  // Update trail
  gameState.trailPoints.push(pos.clone());
  if (gameState.trailPoints.length > 60) {
    gameState.trailPoints.shift();
  }
  updateBallTrail();

  // Check collision/bounds
  checkBallResult();
}

function updateBallTrail() {
  if (gameState.trailPoints.length < 2) return;

  const positions = new Float32Array(gameState.trailPoints.length * 3);
  for (let i = 0; i < gameState.trailPoints.length; i++) {
    positions[i * 3] = gameState.trailPoints[i].x;
    positions[i * 3 + 1] = gameState.trailPoints[i].y;
    positions[i * 3 + 2] = gameState.trailPoints[i].z;
  }

  ballTrail.geometry.dispose();
  ballTrail.geometry = new THREE.BufferGeometry();
  ballTrail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  ballTrail.visible = true;
}

function checkBallResult() {
  const pos = gameState.ballPosition;

  // Check if passed wicket line
  if (pos.z <= PITCH.wicketZ - 0.1) {
    const hitResult = checkWicketCollision();

    if (hitResult.hit) {
      animateWicketHit(hitResult.stumpsHit);
      showResult(true, hitResult.stumpsHit);
      gameState.wicketsTaken++;
    } else {
      showResult(false, []);
    }

    gameState.phase = 'RESULT';
    return;
  }

  // Out of bounds
  if (Math.abs(pos.x) > 2.0 || pos.y > 4.0 || pos.z < PITCH.wicketZ - 2) {
    showResult(false, []);
    gameState.phase = 'RESULT';
  }
}

function checkWicketCollision() {
  const pos = gameState.ballPosition;

  const wicketLeft = -PITCH.stumpSpacing - PITCH.stumpRadius;
  const wicketRight = PITCH.stumpSpacing + PITCH.stumpRadius;
  const wicketTop = PITCH.stumpHeight;

  // Check if ball passes through wicket box (at wicket Z position)
  const hitBox = {
    xMin: wicketLeft - PITCH.ballRadius,
    xMax: wicketRight + PITCH.ballRadius,
    yMin: -PITCH.ballRadius,
    yMax: wicketTop + PITCH.ballRadius * 2,
  };

  const isHit = (
    pos.x >= hitBox.xMin &&
    pos.x <= hitBox.xMax &&
    pos.y >= hitBox.yMin &&
    pos.y <= hitBox.yMax
  );

  if (!isHit) return { hit: false, stumpsHit: [] };

  // Determine which stumps were hit
  const stumpsHit = [];
  for (let i = 0; i < 3; i++) {
    const stumpX = (i - 1) * PITCH.stumpSpacing;
    const dist = Math.abs(pos.x - stumpX);
    if (dist < PITCH.stumpRadius + PITCH.ballRadius * 1.5) {
      stumpsHit.push(i);
    }
  }

  return { hit: stumpsHit.length > 0, stumpsHit };
}

function animateWicketHit(stumpsHitIndices) {
  // Animate stumps falling
  for (const idx of stumpsHitIndices) {
    if (idx >= 0 && idx < stumps.length) {
      animateStumpFall(stumps[idx]);
    }
  }

  // Animate bails flying
  for (const bail of bails) {
    if (!bail.userData.fallen) {
      animateBailFly(bail);
    }
  }
}

function animateStumpFall(stump) {
  if (stump.userData.fallen) return;
  stump.userData.fallen = true;

  const startRotX = stump.rotation.x;
  const targetRotX = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  const startZ = stump.position.z;
  const targetZ = startZ - 0.15;
  const duration = 400;
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    stump.rotation.x = startRotX + (targetRotX - startRotX) * eased;
    stump.position.z = startZ + (targetZ - startZ) * eased;
    stump.position.y = stump.userData.originalPos.y - 0.1 * eased;

    if (t < 1) requestAnimationFrame(animate);
  }
  animate();
}

function animateBailFly(bail) {
  if (bail.userData.fallen) return;
  bail.userData.fallen = true;

  const startY = bail.position.y;
  const startX = bail.position.x;
  const velocityX = (Math.random() - 0.5) * 2;
  const velocityY = 2 + Math.random();
  const duration = 600;
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    const tSec = t * 0.6;
    bail.position.y = startY + velocityY * tSec - 5 * tSec * tSec;
    bail.position.x = startX + velocityX * t;
    bail.rotation.x += 0.15;
    bail.rotation.y += 0.1;

    if (t < 1 && bail.position.y > 0) requestAnimationFrame(animate);
  }
  animate();
}

/////////////////////////
// Game Input Processing
/////////////////////////

function processGameInput(landmarks, timestamp) {
  if (!landmarks) {
    gameState.handDetected = false;
    if (gameState.phase === 'GRIPPING' || gameState.phase === 'BOWLING') {
      resetToReady();
    }
    return;
  }

  gameState.handDetected = true;

  const gripScore = calculateGripScore(landmarks);
  const wristAngle = calculateWristAngle(landmarks);
  const wrist = landmarks[WRIST];
  const rawPosition = mapLandmarkTo3D(wrist);
  const handPosition = smoothPoint(rawPosition);

  switch (gameState.phase) {
    case 'READY':
      if (gripScore < GRIP_CLOSED_THRESHOLD) {
        gameState.phase = 'GRIPPING';
        gameState.gripStartTime = timestamp;
        gameState.positionHistory = [];
        showBallInHand(handPosition);
      }
      break;

    case 'GRIPPING':
      if (gripScore > GRIP_OPEN_THRESHOLD) {
        // Released too early
        resetToReady();
      } else {
        gameState.positionHistory.push({
          x: handPosition.x,
          y: handPosition.y,
          z: handPosition.z,
          t: timestamp,
          wristAngle: wristAngle,
        });

        // Trim old history
        const cutoff = timestamp - 600;
        gameState.positionHistory = gameState.positionHistory.filter(p => p.t > cutoff);

        if (detectBowlingMotion(gameState.positionHistory)) {
          gameState.phase = 'BOWLING';
        }

        updateBallInHand(handPosition);
      }
      break;

    case 'BOWLING':
      if (gripScore > GRIP_OPEN_THRESHOLD) {
        releaseBall(timestamp);
      } else {
        gameState.positionHistory.push({
          x: handPosition.x,
          y: handPosition.y,
          z: handPosition.z,
          t: timestamp,
          wristAngle: wristAngle,
        });

        const cutoff = timestamp - 600;
        gameState.positionHistory = gameState.positionHistory.filter(p => p.t > cutoff);

        updateBallInHand(handPosition);
      }
      break;

    case 'IN_FLIGHT':
      // Ball is flying, no input needed
      break;

    case 'RESULT':
      // Check for new grip to start next bowl
      if (gripScore < GRIP_CLOSED_THRESHOLD) {
        resetForNextBowl();
        gameState.phase = 'GRIPPING';
        gameState.gripStartTime = timestamp;
        gameState.positionHistory = [];
        showBallInHand(handPosition);
      }
      break;
  }
}

function showBallInHand(position) {
  ball.position.copy(position);
  ball.visible = true;
}

function updateBallInHand(position) {
  ball.position.copy(position);
}

function releaseBall(timestamp) {
  const history = gameState.positionHistory;
  if (history.length < 2) {
    resetToReady();
    return;
  }

  const velocity = calculateReleaseVelocity(history, timestamp);
  const spinData = calculateSpinFromHistory(history);

  const lastPos = history[history.length - 1];

  // Scale and adjust velocity for good gameplay feel
  const speed = velocity.length();
  const scaledVelocity = new THREE.Vector3(
    velocity.x * 0.4,
    clamp(velocity.y * 0.3, -2, 2),
    -Math.max(Math.abs(velocity.z) * 0.5, 3) - speed * 0.3
  );

  // CRITICAL: Ensure ball has enough velocity to reach wickets (z = -5.0)
  // Minimum z velocity of -6 ensures ball reaches wickets even with bouncing and drag
  const MIN_Z_VELOCITY = -6;
  if (scaledVelocity.z > MIN_Z_VELOCITY) scaledVelocity.z = MIN_Z_VELOCITY;

  gameState.releaseVelocity = scaledVelocity;
  gameState.releasePosition = new THREE.Vector3(lastPos.x, lastPos.y, lastPos.z);
  gameState.spinType = spinData.type;
  gameState.spinMagnitude = clamp(spinData.magnitude, 0, 5);

  gameState.ballPosition = gameState.releasePosition.clone();
  gameState.ballVelocity = gameState.releaseVelocity.clone();
  gameState.trailPoints = [gameState.ballPosition.clone()];
  gameState.hasBounced = false;

  ball.position.copy(gameState.ballPosition);
  ball.visible = true;

  gameState.phase = 'IN_FLIGHT';
  gameState.flightStartTime = timestamp;
  lastPhysicsTime = timestamp;

  // Update stats
  gameState.totalBowls++;
  if (spinData.type === 'FAST') gameState.fastBalls++;
  else if (spinData.type === 'LEG_SPIN') gameState.legSpinBalls++;
  else gameState.offSpinBalls++;

  lastSmoothed = null;
}

/////////////////////////
// UI
/////////////////////////

function formatSpinType(type) {
  switch (type) {
    case 'FAST': return 'Fast';
    case 'LEG_SPIN': return 'Leg Spin';
    case 'OFF_SPIN': return 'Off Spin';
    default: return type;
  }
}

function showResult(hit, stumpsHit) {
  gameState.result = { hit, stumpsHit };

  if (el.resultDisplay) {
    if (hit) {
      el.resultIcon.textContent = '\u{1F3AF}';
      el.resultText.textContent = 'WICKET!';
      el.resultText.className = 'result-text hit';
      el.resultDetails.textContent = `${formatSpinType(gameState.spinType)} ball knocks the stumps!`;
    } else {
      el.resultIcon.textContent = '\u274C';
      el.resultText.textContent = 'Missed';
      el.resultText.className = 'result-text miss';
      el.resultDetails.textContent = `${formatSpinType(gameState.spinType)} ball missed the wickets`;
    }

    el.resultDisplay.classList.remove('hidden');
    el.gameHint.classList.add('hidden');
  }
}

function updateGameStatus() {
  const phaseLabels = {
    'READY': 'Ready - Close fist to grip',
    'GRIPPING': 'Gripping ball...',
    'BOWLING': 'Bowling! Release to throw',
    'IN_FLIGHT': 'Ball in flight...',
    'RESULT': gameState.result?.hit ? '\u{1F3AF} WICKET!' : '\u274C Missed',
  };

  if (el.statusPhase) {
    el.statusPhase.textContent = phaseLabels[gameState.phase] || gameState.phase;
  }

  if (el.statusScore) {
    el.statusScore.textContent = `Wickets: ${gameState.wicketsTaken}/${gameState.totalBowls}`;
  }

  if (gameState.phase === 'IN_FLIGHT' || gameState.phase === 'RESULT') {
    const speed = gameState.releaseVelocity ? gameState.releaseVelocity.length() * 15 : 0;
    if (el.statusSpeed) el.statusSpeed.textContent = `Speed: ${Math.round(speed)} km/h`;
    if (el.statusBallType) el.statusBallType.textContent = formatSpinType(gameState.spinType);
  } else {
    if (el.statusSpeed) el.statusSpeed.textContent = 'Speed: --';
    if (el.statusBallType) el.statusBallType.textContent = '--';
  }

  if (el.statFast) el.statFast.textContent = gameState.fastBalls;
  if (el.statSpin) el.statSpin.textContent = gameState.legSpinBalls + gameState.offSpinBalls;
}

/////////////////////////
// MediaPipe
/////////////////////////

let handLandmarker = null;
let webcamRunning = false;
let overlayEnabled = true;
let lastVideoTime = -1;

let fpsFrames = 0;
let fpsLastMs = nowMs();
let fpsValue = 0;

async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

function hasGetUserMedia() {
  return !!navigator.mediaDevices?.getUserMedia;
}

async function enableWebcam() {
  if (!hasGetUserMedia()) {
    showError("Your browser does not support getUserMedia().");
    return;
  }
  if (!handLandmarker) {
    showError("Hand tracking is still loading. Please try again.");
    return;
  }

  if (webcamRunning) {
    webcamRunning = false;
    el.btnWebcam.textContent = "Enable webcam";
    gameState.handDetected = false;
    resetToReady();
    updateGameStatus();
    return;
  }

  hideError();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    el.webcam.srcObject = stream;
    await el.webcam.play();

    webcamRunning = true;
    el.btnWebcam.textContent = "Disable webcam";

    resizeOverlayToVideo();
    el.webcam.addEventListener("loadeddata", () => resizeOverlayToVideo(), { once: true });

    lastVideoTime = -1;
    requestAnimationFrame(predictLoop);
  } catch (err) {
    showError("Camera access blocked. Please allow webcam permission. " + (err?.message || ""));
  }
}

function showError(msg) {
  el.cameraError.textContent = msg;
  el.cameraError.classList.remove("hidden");
}

function hideError() {
  el.cameraError.classList.add("hidden");
  el.cameraError.textContent = "";
}

async function predictLoop() {
  if (!webcamRunning) return;

  // FPS calculation
  fpsFrames++;
  const tNow = nowMs();
  if (tNow - fpsLastMs >= 1000) {
    fpsValue = fpsFrames * 1000 / (tNow - fpsLastMs);
    fpsFrames = 0;
    fpsLastMs = tNow;
  }

  const video = el.webcam;
  if (video.currentTime === lastVideoTime) {
    updateGameStatus();
    if (el.statusFps) el.statusFps.textContent = `FPS: ${Math.round(fpsValue)}`;
    requestAnimationFrame(predictLoop);
    return;
  }
  lastVideoTime = video.currentTime;

  const results = handLandmarker.detectForVideo(video, tNow);
  const landmarks = results?.landmarks?.[0] || null;

  if (overlayEnabled) drawOverlay(landmarks);
  else {
    const ctx = el.overlay2d.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, el.overlay2d.width, el.overlay2d.height);
  }

  // Process game input
  processGameInput(landmarks, tNow);

  // Update physics if ball is in flight
  if (gameState.phase === 'IN_FLIGHT') {
    const deltaTime = (tNow - lastPhysicsTime) / 1000;
    lastPhysicsTime = tNow;
    updateBallPhysics(deltaTime);
  }

  updateGameStatus();
  if (el.statusFps) el.statusFps.textContent = `FPS: ${Math.round(fpsValue)}`;

  requestAnimationFrame(predictLoop);
}

/////////////////////////
// UI Wiring
/////////////////////////

function wireUI() {
  el.btnWebcam.addEventListener("click", enableWebcam);

  if (el.btnOverlay) {
    el.btnOverlay.addEventListener("click", () => {
      overlayEnabled = !overlayEnabled;
      el.btnOverlay.textContent = overlayEnabled ? "Overlay: On" : "Overlay: Off";
      el.btnOverlay.setAttribute("aria-pressed", String(overlayEnabled));
    });
  }

  if (el.btnReset) {
    el.btnReset.addEventListener("click", () => {
      resetForNextBowl();
      gameState.totalBowls = 0;
      gameState.wicketsTaken = 0;
      gameState.fastBalls = 0;
      gameState.legSpinBalls = 0;
      gameState.offSpinBalls = 0;
      updateGameStatus();
    });
  }

  updateGameStatus();
}

/////////////////////////
// Boot
/////////////////////////

(async function boot() {
  initCricketScene();
  wireUI();
  updateGameStatus();

  try {
    await createHandLandmarker();
  } catch (e) {
    showError("Failed to load hand tracker. Please refresh. " + (e?.message || ""));
    return;
  }

  const ro = new ResizeObserver(() => resizeOverlayToVideo());
  ro.observe(el.webcam);

  el.webcam.addEventListener("loadedmetadata", () => resizeOverlayToVideo());
})();
