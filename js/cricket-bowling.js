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
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const FINGERTIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

// Grip detection - just need hand visible, pinch is optional
const GRIP_PINCH_THRESHOLD = 0.35;  // Very lenient - almost any hand position grips

// Finger spread detection (index to middle distance)
const FINGER_TOGETHER_THRESHOLD = 0.05;  // Fingers together = Pace grip
const FINGER_APART_THRESHOLD = 0.09;     // Fingers spread = Spin grip

// Release detection - based on arm motion, not pinch
const RELEASE_Y_VELOCITY = -0.15;  // Arm moving downward (negative Y = down)
const RELEASE_MIN_FRAMES = 5;      // Must see downward motion for several frames

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

  // Debug elements
  debugPanel: document.getElementById("debugPanel"),
  debugOutput: document.getElementById("debugOutput"),
  btnDebug: document.getElementById("btnDebug"),
  btnDebugClose: document.getElementById("btnDebugClose"),
  btnDebugClear: document.getElementById("btnDebugClear"),
};

// Debug mode state
let debugMode = false;
let debugData = {};
let debugRecording = [];
let isRecording = false;

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

  // Grip type indicator
  if (gameState.phase === 'GRIPPING' || gameState.phase === 'BOWLING') {
    const gripLabel = gameState.gripType === 'SPIN' ? 'SPIN GRIP' : 'PACE GRIP';
    const gripColor = gameState.gripType === 'SPIN' ? "rgba(200, 100, 0, 0.9)" : "rgba(0, 150, 200, 0.9)";

    ctx.fillStyle = gripColor;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(gripLabel, 10, 25);

    // Visual hint for finger position
    if (gameState.gripType === 'SPIN') {
      ctx.fillStyle = "rgba(200, 100, 0, 0.7)";
      ctx.fillText("fingers apart", 10, 45);
    } else {
      ctx.fillStyle = "rgba(0, 150, 200, 0.7)";
      ctx.fillText("fingers together", 10, 45);
    }
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
  gripType: 'PACE',  // PACE or SPIN based on finger spread

  // Release data
  releaseVelocity: null,
  releasePosition: null,
  spinType: 'FAST',
  spinMagnitude: 0,
  deliveryType: null,  // 'Yorker', 'Good Length', 'Short Pitch'
  targetBounceZ: 0,    // Where ball is aimed to bounce

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
  gameState.gripType = 'PACE';
  gameState.releaseVelocity = null;
  gameState.releasePosition = null;
  gameState.deliveryType = null;
  gameState.targetBounceZ = 0;
  gameState.ballPosition = null;
  gameState.ballVelocity = null;
  gameState.trailPoints = [];
  gameState.hasBounced = false;
  ball.visible = false;
  ballTrail.visible = false;
  lastSmoothed = null;
  resetArmRelease();
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

// Helper: 3D distance between two landmarks
function distance3D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Helper: 2D distance (ignoring depth)
function distance2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Pinch detection: distance from thumb to index/middle fingers
function calculatePinchDistance(landmarks) {
  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const middle = landmarks[MIDDLE_TIP];

  // Distance from thumb to midpoint between index and middle fingertips
  const midX = (index.x + middle.x) / 2;
  const midY = (index.y + middle.y) / 2;
  const midZ = (index.z + middle.z) / 2;

  const dx = thumb.x - midX;
  const dy = thumb.y - midY;
  const dz = thumb.z - midZ;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Finger spread: distance between index and middle fingertips
function calculateFingerSpread(landmarks) {
  const index = landmarks[INDEX_TIP];
  const middle = landmarks[MIDDLE_TIP];

  // Use 2D distance (lateral spread matters, not depth)
  return distance2D(index, middle);
}

// Detect grip type based on finger spread
function detectGripType(landmarks) {
  const spread = calculateFingerSpread(landmarks);

  if (spread < FINGER_TOGETHER_THRESHOLD) {
    return 'PACE';  // Seam bowling - fingers together on the seam
  } else if (spread > FINGER_APART_THRESHOLD) {
    return 'SPIN';  // Spin bowling - fingers spread for grip
  }
  return 'PACE';  // Default to pace
}

// Arm motion release detection state
let downwardMotionFrames = 0;

// Detect release based on arm swinging down (bowling motion)
function detectArmRelease(handYVelocity) {
  // Check if arm is moving downward
  if (handYVelocity < RELEASE_Y_VELOCITY) {
    downwardMotionFrames++;
  } else {
    // Reset if not moving down
    downwardMotionFrames = Math.max(0, downwardMotionFrames - 1);
  }

  // Release after sustained downward motion
  const released = downwardMotionFrames >= RELEASE_MIN_FRAMES;

  return {
    released,
    downwardFrames: downwardMotionFrames,
    velocity: handYVelocity
  };
}

// Reset arm release detection state
function resetArmRelease() {
  downwardMotionFrames = 0;
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
// Ball Trajectory
/////////////////////////

// Bowling arm release height (realistic high arm position)
const RELEASE_HEIGHT = 2.0;

// Determine where ball should bounce based on bowling speed and grip type
function calculateBounceTarget(speed, gripType) {
  // Spin bowlers: good length to allow turn after bounce
  if (gripType === 'SPIN') {
    return -3.5 + (Math.random() - 0.5) * 0.6;
  }

  // Pace bowling: speed determines length
  // High speed = yorker (fuller), medium = good length, slow = short pitch
  if (speed > 4) {
    return -4.3 + (Math.random() - 0.5) * 0.4;  // Yorker area
  } else if (speed > 2) {
    return -3.5 + (Math.random() - 0.5) * 0.6;  // Good length
  } else {
    return -2.2 + (Math.random() - 0.5) * 0.6;  // Short pitch
  }
}

// Calculate initial velocity to create ballistic arc to target bounce point
function calculateArcVelocity(releasePos, targetBounceZ) {
  // Projectile motion physics:
  // y = y0 + vy*t + 0.5*g*t^2
  // z = z0 + vz*t

  const y0 = releasePos.y;           // Release height (2.0)
  const yTarget = PHYSICS.groundY;   // Ground level (ball radius)
  const zDist = targetBounceZ - releasePos.z;  // Distance to bounce point

  // Flight time determines ball speed - faster = shorter time
  // ~8 units/sec gives realistic cricket ball speed
  const flightTime = Math.abs(zDist) / 8;

  // Calculate required Y velocity using kinematic equation
  // yTarget = y0 + vy*t + 0.5*g*t^2
  // vy = (yTarget - y0 - 0.5*g*t^2) / t
  const vy = (yTarget - y0 - 0.5 * PHYSICS.gravity * flightTime * flightTime) / flightTime;
  const vz = zDist / flightTime;

  return new THREE.Vector3(
    (Math.random() - 0.5) * 0.4,  // Slight lateral variation for line
    vy,
    vz
  );
}

// Determine delivery type based on bounce position
function getDeliveryType(bounceZ) {
  if (bounceZ < -4.0) return 'Yorker';
  if (bounceZ < -2.8) return 'Good Length';
  return 'Short Pitch';
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

  // Calculate hand position and velocity first
  const wristAngle = calculateWristAngle(landmarks);
  const wrist = landmarks[WRIST];
  const rawPosition = mapLandmarkTo3D(wrist);
  const handPosition = smoothPoint(rawPosition);

  // Calculate hand Y velocity from position history
  let handYVelocity = 0;
  if (gameState.positionHistory.length >= 2) {
    const recent = gameState.positionHistory.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt > 0.01) {
      handYVelocity = (last.y - first.y) / dt;
    }
  }

  // Grip and release detection
  const pinchDistance = calculatePinchDistance(landmarks);
  const fingerSpread = calculateFingerSpread(landmarks);
  const gripType = detectGripType(landmarks);
  const armRelease = detectArmRelease(handYVelocity);

  switch (gameState.phase) {
    case 'READY':
      // Grip detected when thumb pinches toward index/middle fingers
      if (pinchDistance < GRIP_PINCH_THRESHOLD) {
        gameState.phase = 'GRIPPING';
        gameState.gripStartTime = timestamp;
        gameState.positionHistory = [];
        gameState.gripType = gripType;
        showBallInHand(handPosition);
      }
      break;

    case 'GRIPPING':
      // Update grip type continuously
      gameState.gripType = gripType;

      gameState.positionHistory.push({
        x: handPosition.x,
        y: handPosition.y,
        z: handPosition.z,
        t: timestamp,
        wristAngle: wristAngle,
      });

      // Trim old history
      const cutoffGrip = timestamp - 600;
      gameState.positionHistory = gameState.positionHistory.filter(p => p.t > cutoffGrip);

      // Transition to BOWLING when arm starts moving down
      if (detectBowlingMotion(gameState.positionHistory)) {
        gameState.phase = 'BOWLING';
      }

      updateBallInHand(handPosition);
      break;

    case 'BOWLING':
      // Update position history
      gameState.positionHistory.push({
        x: handPosition.x,
        y: handPosition.y,
        z: handPosition.z,
        t: timestamp,
        wristAngle: wristAngle,
      });

      const cutoffBowl = timestamp - 600;
      gameState.positionHistory = gameState.positionHistory.filter(p => p.t > cutoffBowl);

      // Release ball when arm swings down
      if (armRelease.released) {
        releaseBall(timestamp, landmarks);
      } else {
        // Update grip type continuously
        gameState.gripType = gripType;
        updateBallInHand(handPosition);
      }
      break;

    case 'IN_FLIGHT':
      // Ball is flying, no input needed
      break;

    case 'RESULT':
      // Check for new pinch grip to start next bowl
      if (pinchDistance < GRIP_PINCH_THRESHOLD) {
        resetForNextBowl();
        gameState.phase = 'GRIPPING';
        gameState.gripStartTime = timestamp;
        gameState.positionHistory = [];
        gameState.gripType = gripType;
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

function releaseBall(timestamp, landmarks) {
  const history = gameState.positionHistory;
  if (history.length < 2) {
    resetToReady();
    return;
  }

  const velocity = calculateReleaseVelocity(history, timestamp);
  const wristSpinData = calculateSpinFromHistory(history);

  // Determine ball type based on grip type AND wrist rotation
  // PACE grip + no wrist rotation = Fast ball
  // PACE grip + wrist rotation = still counts as Fast (seam movement)
  // SPIN grip + wrist rotation = Leg spin or Off spin based on direction
  // SPIN grip + no rotation = defaults to Off spin
  let finalSpinType = 'FAST';
  let finalSpinMagnitude = 0;

  if (gameState.gripType === 'SPIN') {
    // Spin grip - use wrist rotation to determine leg spin vs off spin
    if (wristSpinData.type === 'LEG_SPIN') {
      finalSpinType = 'LEG_SPIN';
      finalSpinMagnitude = wristSpinData.magnitude;
    } else if (wristSpinData.type === 'OFF_SPIN') {
      finalSpinType = 'OFF_SPIN';
      finalSpinMagnitude = wristSpinData.magnitude;
    } else {
      // Spin grip but no clear wrist rotation - default to off spin
      finalSpinType = 'OFF_SPIN';
      finalSpinMagnitude = 1.0;
    }
  } else {
    // Pace grip - always Fast, but wrist rotation can add seam movement
    finalSpinType = 'FAST';
    finalSpinMagnitude = Math.abs(wristSpinData.magnitude) * 0.3; // Subtle seam movement
  }

  const lastPos = history[history.length - 1];

  // Get hand motion speed for delivery type selection
  const handVelocity = velocity;
  const speed = handVelocity.length();

  // NEW: Set realistic release position (high arm bowling action)
  // X from hand position for line control, fixed Y height, Z near crease
  gameState.releasePosition = new THREE.Vector3(
    clamp(lastPos.x, -0.5, 0.5),  // Limit horizontal range
    RELEASE_HEIGHT,               // Fixed height (2.0m)
    0.2                           // Near bowling crease
  );

  // NEW: Calculate target bounce point based on speed and grip
  const bounceZ = calculateBounceTarget(speed, gameState.gripType);
  gameState.targetBounceZ = bounceZ;
  gameState.deliveryType = getDeliveryType(bounceZ);

  // NEW: Calculate velocity for ballistic arc to bounce point
  const arcVelocity = calculateArcVelocity(gameState.releasePosition, bounceZ);

  // Add lateral movement from hand motion for line control
  arcVelocity.x += handVelocity.x * 0.15;

  gameState.releaseVelocity = arcVelocity;
  gameState.spinType = finalSpinType;
  gameState.spinMagnitude = clamp(finalSpinMagnitude, 0, 5);

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
  if (finalSpinType === 'FAST') gameState.fastBalls++;
  else if (finalSpinType === 'LEG_SPIN') gameState.legSpinBalls++;
  else gameState.offSpinBalls++;

  lastSmoothed = null;
  resetArmRelease();
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

  // Build delivery description: "Fast Yorker" or "Off Spin Good Length"
  const deliveryDesc = `${formatSpinType(gameState.spinType)} ${gameState.deliveryType || ''}`.trim();

  if (el.resultDisplay) {
    if (hit) {
      el.resultIcon.textContent = '\u{1F3AF}';
      el.resultText.textContent = 'WICKET!';
      el.resultText.className = 'result-text hit';
      el.resultDetails.textContent = `${deliveryDesc} knocks the stumps!`;
    } else {
      el.resultIcon.textContent = '\u274C';
      el.resultText.textContent = 'Missed';
      el.resultText.className = 'result-text miss';
      el.resultDetails.textContent = `${deliveryDesc} missed the wickets`;
    }

    el.resultDisplay.classList.remove('hidden');
    el.gameHint.classList.add('hidden');
  }
}

function updateGameStatus() {
  const gripHint = gameState.gripType === 'SPIN' ? '(Spin)' : '(Pace)';
  const phaseLabels = {
    'READY': 'Ready - Show hand to camera',
    'GRIPPING': `Gripping ${gripHint} - swing arm down`,
    'BOWLING': `Bowling ${gripHint} - release!`,
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
    // Show full delivery: "Fast Yorker" or "Leg Spin Good Length"
    const deliveryDesc = `${formatSpinType(gameState.spinType)} ${gameState.deliveryType || ''}`.trim();
    if (el.statusBallType) el.statusBallType.textContent = deliveryDesc;
  } else {
    if (el.statusSpeed) el.statusSpeed.textContent = 'Speed: --';
    if (el.statusBallType) el.statusBallType.textContent = '--';
  }

  if (el.statFast) el.statFast.textContent = gameState.fastBalls;
  if (el.statSpin) el.statSpin.textContent = gameState.legSpinBalls + gameState.offSpinBalls;
}

/////////////////////////
// Debug Display
/////////////////////////

function updateDebugDisplay(landmarks, timestamp) {
  if (!debugMode || !el.debugOutput) return;

  if (!landmarks) {
    // Show recording history when hand not detected
    if (debugRecording.length > 0) {
      const lines = [
        `=== NO HAND - SHOWING LAST RECORDING (${debugRecording.length} frames) ===`,
        ``,
        `Press "Clear Recording" to reset`,
        ``,
        `--- Key moments from recording ---`,
      ];

      // Show min/max values from recording
      const pinchValues = debugRecording.map(r => r.pinch);
      const yVelValues = debugRecording.map(r => r.handYVel);
      const minPinch = Math.min(...pinchValues);
      const maxPinch = Math.max(...pinchValues);
      const minYVel = Math.min(...yVelValues);
      const maxYVel = Math.max(...yVelValues);

      lines.push(`Pinch range: ${minPinch.toFixed(3)} - ${maxPinch.toFixed(3)}`);
      lines.push(`Y velocity range: ${minYVel.toFixed(2)} - ${maxYVel.toFixed(2)}`);
      lines.push(``);
      lines.push(`--- Last 15 frames ---`);

      // Show last 15 recorded frames
      const recent = debugRecording.slice(-15);
      recent.forEach((r, i) => {
        lines.push(`${r.phase.padEnd(8)} pinch:${r.pinch.toFixed(3)} yVel:${r.handYVel.toFixed(2)} zVel:${r.handZVel.toFixed(2)}`);
      });

      el.debugOutput.textContent = lines.join('\n');
    } else {
      el.debugOutput.textContent = 'No hand detected\n\nShow your hand and perform bowling motion.\nValues will be recorded automatically.';
    }
    return;
  }

  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  const middle = landmarks[MIDDLE_TIP];
  const wrist = landmarks[WRIST];

  // Calculate all distances
  const thumbIndexDist = distance3D(thumb, index);
  const thumbMiddleDist = distance3D(thumb, middle);
  const indexMiddleSpread = distance2D(index, middle);
  const pinchDist = calculatePinchDistance(landmarks);

  // Calculate velocities from history
  let handYVel = 0, handZVel = 0;
  const history = gameState.positionHistory;
  if (history.length >= 2) {
    const recent = history.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt > 0.01) {
      handYVel = (last.y - first.y) / dt;
      handZVel = (last.z - first.z) / dt;
    }
  }

  // Get arm release state
  const armRelease = detectArmRelease(handYVel);

  // Store for reference
  debugData = {
    thumbIndexDist,
    thumbMiddleDist,
    indexMiddleSpread,
    pinchDist,
    handYVel,
    handZVel,
    downwardFrames: armRelease.downwardFrames,
    released: armRelease.released
  };

  // Record every frame when hand is visible
  debugRecording.push({
    t: timestamp,
    phase: gameState.phase,
    pinch: pinchDist,
    thumbIndex: thumbIndexDist,
    thumbMiddle: thumbMiddleDist,
    spread: indexMiddleSpread,
    handYVel,
    handZVel,
    downwardFrames: armRelease.downwardFrames,
    grip: pinchDist < GRIP_PINCH_THRESHOLD,
    release: armRelease.released
  });

  // Keep last 200 frames
  if (debugRecording.length > 200) {
    debugRecording.shift();
  }

  // Format display
  const lines = [
    `Phase: ${gameState.phase}`,
    `Grip Type: ${gameState.gripType}`,
    `Recording: ${debugRecording.length} frames (auto-records when hand visible)`,
    ``,
    `=== DISTANCES ===`,
    `Thumb-Index:  ${thumbIndexDist.toFixed(3)}`,
    `Thumb-Middle: ${thumbMiddleDist.toFixed(3)}`,
    `Index-Middle: ${indexMiddleSpread.toFixed(3)}`,
    `Pinch (avg):  ${pinchDist.toFixed(3)}`,
    ``,
    `=== VELOCITIES ===`,
    `Hand Y vel:   ${handYVel.toFixed(2)}  (negative = moving down)`,
    `Hand Z vel:   ${handZVel.toFixed(2)}  (negative = moving forward)`,
    ``,
    `=== THRESHOLDS ===`,
    `Grip threshold:    ${GRIP_PINCH_THRESHOLD}`,
    `Release Y vel:     ${RELEASE_Y_VELOCITY} (need Y vel < this)`,
    `Release frames:    ${RELEASE_MIN_FRAMES}`,
    ``,
    `=== DETECTION ===`,
    `Grip: ${pinchDist < GRIP_PINCH_THRESHOLD ? 'YES' : 'NO'} (pinch ${pinchDist.toFixed(3)} < ${GRIP_PINCH_THRESHOLD})`,
    `Release: ${armRelease.released ? 'YES!' : 'no'}`,
    `  downward frames: ${armRelease.downwardFrames}/${RELEASE_MIN_FRAMES}`,
    `  Y velocity: ${handYVel.toFixed(3)} (need < ${RELEASE_Y_VELOCITY})`,
  ];

  el.debugOutput.textContent = lines.join('\n');
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

  // Update debug display
  updateDebugDisplay(landmarks, tNow);

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

  // Debug panel toggle
  if (el.btnDebug) {
    el.btnDebug.addEventListener("click", () => {
      debugMode = true;
      if (el.debugPanel) el.debugPanel.classList.remove("hidden");
      el.btnDebug.classList.add("hidden");
    });
  }

  if (el.btnDebugClose) {
    el.btnDebugClose.addEventListener("click", () => {
      debugMode = false;
      if (el.debugPanel) el.debugPanel.classList.add("hidden");
      if (el.btnDebug) el.btnDebug.classList.remove("hidden");
    });
  }

  if (el.btnDebugClear) {
    el.btnDebugClear.addEventListener("click", () => {
      debugRecording = [];
      if (el.debugOutput) el.debugOutput.textContent = 'Recording cleared.\n\nShow your hand and perform bowling motion.';
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
