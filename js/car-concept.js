// Car Concept 3D Viewer with Hand Tracking
// Three.js + MediaPipe HandLandmarker

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

/////////////////////////
// Configuration
/////////////////////////

const CONFIG = {
    // Rotation: hand X position maps to full 360 degrees
    rotationRange: Math.PI * 2,       // Full 360 rotation

    // Zoom speed and range
    zoomSpeed: 2.0,                    // Faster zoom
    zoomRange: { min: 0.5, max: 2.5 }, // Scale limits

    // Fist detection threshold (higher = easier to trigger fist)
    fistThreshold: 0.22,

    // Smoothing (lower = faster response)
    smoothing: 0.3,

    // Model path
    modelPath: "/images/CarConcept.glb",
};

// Hand landmark indices
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const FINGERTIPS = [4, 8, 12, 16, 20];

/////////////////////////
// DOM Elements
/////////////////////////

const el = {
    threeCanvas: document.getElementById("threeCanvas"),
    webcam: document.getElementById("webcam"),
    overlay2d: document.getElementById("overlay2d"),
    webcamPreview: document.getElementById("webcamPreview"),
    btnWebcam: document.getElementById("btnWebcam"),
    webcamError: document.getElementById("webcamError"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    statusHand: document.getElementById("statusHand"),
    statusGesture: document.getElementById("statusGesture"),
    instructions: document.getElementById("instructions"),
};

/////////////////////////
// State
/////////////////////////

let scene, camera, renderer, controls;
let carModel = null;
let handLandmarker = null;
let webcamRunning = false;
let lastVideoTime = -1;
let envMap = null;

// Smoothed values for gesture control
let smoothedRotation = 0;
let smoothedZoom = 1;
let targetRotation = 0;
let targetZoom = 1;

// Fist tracking for zoom
let lastHandZ = null;
let isFist = false;

/////////////////////////
// Utilities
/////////////////////////

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function distance2D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
    const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
    return outMin + t * (outMax - outMin);
}

/////////////////////////
// Three.js Setup
/////////////////////////

function initScene() {
    // Scene with light background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);

    // Add fog for depth
    scene.fog = new THREE.Fog(0xf0f4f8, 15, 60);

    // Renderer (must be created before environment map)
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
    renderer.toneMappingExposure = 1.5;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Create environment map for PBR reflections (metallic/clearcoat materials)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Create a studio-like environment for reflections
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xffffff);

    // Studio lights for environment reflections
    const envLight1 = new THREE.DirectionalLight(0xffffff, 3);
    envLight1.position.set(1, 1, 1);
    envScene.add(envLight1);

    const envLight2 = new THREE.DirectionalLight(0xddeeff, 2);
    envLight2.position.set(-1, 0.5, -1);
    envScene.add(envLight2);

    const envLight3 = new THREE.DirectionalLight(0xffeedd, 1.5);
    envLight3.position.set(0, -1, 0);
    envScene.add(envLight3);

    const envLight4 = new THREE.DirectionalLight(0xffffff, 2);
    envLight4.position.set(0, 1, -1);
    envScene.add(envLight4);

    envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();

    // Camera
    camera = new THREE.PerspectiveCamera(
        45,
        canvas.clientWidth / canvas.clientHeight,
        0.1,
        100
    );
    camera.position.set(-5, 3, -8);
    camera.lookAt(0, 0, 0);

    // OrbitControls (fallback for mouse/touch)
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.target.set(0, 0.5, 0);
    controls.update();

    // Lighting - Studio setup (brighter for metallic materials)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(5, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaabbff, 1.0);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffccaa, 0.8);
    rimLight.position.set(0, 5, -10);
    scene.add(rimLight);

    // Additional front light for better visibility
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.0);
    frontLight.position.set(0, 3, 10);
    scene.add(frontLight);

    // Ground plane (reflective surface)
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.8,
        metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Handle window resize
    window.addEventListener("resize", onResize, { passive: true });
}

function onResize() {
    const canvas = el.threeCanvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

/////////////////////////
// Model Loading
/////////////////////////

async function loadCarModel() {
    const loader = new GLTFLoader();

    try {
        const gltf = await loader.loadAsync(CONFIG.modelPath);
        carModel = gltf.scene;

        // Center the model and place on ground
        const box = new THREE.Box3().setFromObject(carModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Scale to reasonable size first
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        carModel.scale.setScalar(scale);

        // Recalculate bounding box after scaling
        box.setFromObject(carModel);
        const scaledCenter = box.getCenter(new THREE.Vector3());
        const scaledMin = box.min;

        // Center horizontally, place bottom on ground (y=0)
        carModel.position.x = -scaledCenter.x;
        carModel.position.z = -scaledCenter.z;
        carModel.position.y = -scaledMin.y;  // Lift so bottom touches ground

        // Enable shadows
        carModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(carModel);

        // Hide loading overlay
        el.loadingOverlay.classList.add("hidden");

        console.log("Car model loaded successfully");
    } catch (error) {
        console.error("Failed to load car model:", error);
        el.loadingOverlay.innerHTML = `
            <p style="color: #f87171;">Failed to load 3D model</p>
            <p style="font-size: 12px; color: #94a3b8;">${error.message}</p>
        `;
    }
}

/////////////////////////
// MediaPipe Setup
/////////////////////////

async function createHandLandmarker() {
    try {
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

        console.log("Hand landmarker created");
    } catch (error) {
        console.error("Failed to create hand landmarker:", error);
        showWebcamError("Failed to load hand tracking model");
    }
}

/////////////////////////
// Webcam Control
/////////////////////////

function hasGetUserMedia() {
    return !!navigator.mediaDevices?.getUserMedia;
}

async function toggleWebcam() {
    if (!hasGetUserMedia()) {
        showWebcamError("Your browser does not support webcam access");
        return;
    }

    if (!handLandmarker) {
        showWebcamError("Hand tracking is still loading...");
        return;
    }

    if (webcamRunning) {
        // Stop webcam
        webcamRunning = false;
        const stream = el.webcam.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        el.webcam.srcObject = null;

        el.btnWebcam.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            Enable Hand Tracking
        `;
        el.btnWebcam.classList.remove("active");
        document.querySelector(".webcam-preview__stack").classList.remove("active");

        // Re-enable orbit controls
        controls.enabled = true;

        updateStatus(false, "");
        return;
    }

    // Start webcam
    hideWebcamError();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 }
        });

        el.webcam.srcObject = stream;
        await el.webcam.play();

        webcamRunning = true;
        el.btnWebcam.textContent = "Disable Hand Tracking";
        el.btnWebcam.classList.add("active");
        document.querySelector(".webcam-preview__stack").classList.add("active");

        // Store current transform as starting point
        if (carModel) {
            targetRotation = carModel.rotation.y;
            smoothedRotation = targetRotation;
            targetZoom = carModel.scale.x;
            smoothedZoom = targetZoom;
            lastHandZ = null;
        }

        resizeOverlayToVideo();
        lastVideoTime = -1;
        requestAnimationFrame(predictLoop);

    } catch (error) {
        showWebcamError("Camera access denied: " + error.message);
    }
}

function showWebcamError(msg) {
    el.webcamError.textContent = msg;
    el.webcamError.classList.remove("hidden");
}

function hideWebcamError() {
    el.webcamError.classList.add("hidden");
}

/////////////////////////
// 2D Overlay Drawing
/////////////////////////

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],           // index
    [0, 9], [9, 10], [10, 11], [11, 12],      // middle
    [0, 13], [13, 14], [14, 15], [15, 16],    // ring
    [0, 17], [17, 18], [18, 19], [19, 20],    // pinky
    [5, 9], [9, 13], [13, 17],                // palm
];

function drawHandOverlay(landmarks) {
    const canvas = el.overlay2d;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    if (!landmarks) return;

    // Mirror X for camera preview
    const px = (x) => (1 - x) * w;
    const py = (y) => y * h;

    // Draw connections
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
        const A = landmarks[a];
        const B = landmarks[b];
        if (!A || !B) continue;
        ctx.moveTo(px(A.x), py(A.y));
        ctx.lineTo(px(B.x), py(B.y));
    }
    ctx.stroke();

    // Draw points
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    for (let i = 0; i < landmarks.length; i++) {
        const p = landmarks[i];
        const r = FINGERTIPS.includes(i) ? 5 : 3;
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Show fist status indicator
    const wrist = landmarks[WRIST];
    let totalDist = 0;
    for (const tipIdx of FINGERTIPS) {
        const tip = landmarks[tipIdx];
        const dx = tip.x - wrist.x;
        const dy = tip.y - wrist.y;
        totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    const fistScore = totalDist / FINGERTIPS.length;
    const isFistNow = fistScore < CONFIG.fistThreshold;

    // Visual indicator
    ctx.font = "bold 12px sans-serif";
    if (isFistNow) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
        ctx.fillText("FIST - Move to zoom", 8, 18);
    } else {
        ctx.fillStyle = "rgba(59, 130, 246, 0.7)";
        ctx.fillText("OPEN - Move to rotate", 8, 18);
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
// Gesture Processing
/////////////////////////

function calculateFistScore(landmarks) {
    // Calculate how closed the hand is (lower = more closed/fist)
    const wrist = landmarks[WRIST];
    let totalDist = 0;

    for (const tipIdx of FINGERTIPS) {
        const tip = landmarks[tipIdx];
        const dx = tip.x - wrist.x;
        const dy = tip.y - wrist.y;
        totalDist += Math.sqrt(dx * dx + dy * dy);
    }

    return totalDist / FINGERTIPS.length;
}

function processHandInput(landmarks) {
    if (!landmarks || !carModel) return;

    const wrist = landmarks[WRIST];
    const fistScore = calculateFistScore(landmarks);
    const currentIsFist = fistScore < CONFIG.fistThreshold;

    if (currentIsFist) {
        // FIST MODE: Zoom based on hand Y position (up = zoom in, down = zoom out)
        // Using Y instead of Z because Y is more reliable
        if (lastHandZ !== null) {
            const yDelta = lastHandZ - wrist.y;  // Moving up = positive delta
            targetZoom += yDelta * CONFIG.zoomSpeed;
            targetZoom = clamp(targetZoom, CONFIG.zoomRange.min, CONFIG.zoomRange.max);
        }
        lastHandZ = wrist.y;  // Track Y position
        isFist = true;

        updateStatus(true, `Fist: Move up/down to zoom (${targetZoom.toFixed(1)}x)`);
    } else {
        // OPEN HAND MODE: Hand X position directly controls rotation angle
        // Full 360 degree rotation based on hand position
        const handX = 1 - wrist.x;  // Mirror for camera (0 = right, 1 = left)
        targetRotation = handX * CONFIG.rotationRange;  // Direct mapping to 0-360

        lastHandZ = null;  // Reset tracking when switching modes
        isFist = false;

        updateStatus(true, "Open hand: Move left/right to rotate 360°");
    }

    // Apply smooth interpolation
    smoothedRotation = lerp(smoothedRotation, targetRotation, 1 - CONFIG.smoothing);
    smoothedZoom = lerp(smoothedZoom, targetZoom, 1 - CONFIG.smoothing);

    // Apply transforms
    carModel.rotation.y = smoothedRotation;
    carModel.scale.setScalar(smoothedZoom);

    // Disable orbit controls while hand is detected
    controls.enabled = false;
}

function updateStatus(handDetected, gestureText) {
    if (handDetected) {
        el.statusHand.textContent = "Hand: Detected";
        el.statusHand.classList.add("status-badge--active");
        el.statusGesture.textContent = gestureText;
    } else {
        el.statusHand.textContent = "Hand: Not detected";
        el.statusHand.classList.remove("status-badge--active");
        el.statusGesture.textContent = webcamRunning ? "Show your hand" : "Use mouse or enable hand tracking";
    }
}

/////////////////////////
// Prediction Loop
/////////////////////////

async function predictLoop() {
    if (!webcamRunning) return;

    const video = el.webcam;

    if (video.currentTime === lastVideoTime) {
        requestAnimationFrame(predictLoop);
        return;
    }
    lastVideoTime = video.currentTime;

    const results = handLandmarker.detectForVideo(video, performance.now());
    const landmarks = results?.landmarks?.[0] || null;

    drawHandOverlay(landmarks);

    if (landmarks) {
        processHandInput(landmarks);
    } else {
        updateStatus(false, "");
        // Re-enable orbit controls when no hand
        controls.enabled = true;
    }

    requestAnimationFrame(predictLoop);
}

/////////////////////////
// Render Loop
/////////////////////////

function animate() {
    requestAnimationFrame(animate);

    if (controls.enabled) {
        controls.update();
    }

    renderer.render(scene, camera);
}

/////////////////////////
// UI Wiring
/////////////////////////

function wireUI() {
    el.btnWebcam.addEventListener("click", toggleWebcam);

    // Hide instructions after first interaction
    el.threeCanvas.addEventListener("pointerdown", () => {
        el.instructions.style.opacity = "0";
        setTimeout(() => {
            el.instructions.style.display = "none";
        }, 300);
    }, { once: true });
}

/////////////////////////
// Boot
/////////////////////////

(async function boot() {
    initScene();
    wireUI();
    animate();

    // Load model and hand tracker in parallel
    await Promise.all([
        loadCarModel(),
        createHandLandmarker(),
    ]);

    console.log("Car Concept Viewer initialized");
})();
