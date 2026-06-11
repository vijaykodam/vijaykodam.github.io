// Retro Racer - 3D racing game rendered with three.js.
// Gameplay (physics, track DSL, traffic, timing) is carried over from the
// original pseudo-3D version; the rendering layer builds a real world-space
// track from the same segment list and draws it with PBR materials, an HDRI
// sky, and GLB car models.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ----- tuning constants (gameplay - unchanged from the 2D version) -----
const SEGMENT_LENGTH = 200;          // world units per road segment
const RUMBLE_LENGTH = 3;             // segments per rumble strip stripe
const ROAD_WIDTH = 1000;             // half-width of the road in world units
const LANES = 3;
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
const STEP = 1 / 60;                 // fixed physics timestep (seconds)
const MAX_SPEED = SEGMENT_LENGTH / STEP;
const ACCEL = MAX_SPEED / 5;
const BRAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5;
const OFF_ROAD_DECEL = DECEL;              // same as coasting (was -MAX_SPEED / 2)
const OFF_ROAD_LIMIT = MAX_SPEED * 0.65;   // was MAX_SPEED / 4
const CENTRIFUGAL = 0.3;             // how hard curves pull the car outward
const STEER_RESPONSE = 8;            // steering ease-in/out rate (higher = snappier)
const OPPONENT_COUNT = 2;                  // player + 2 = 3 cars, one per lane
const LANE_OFFSETS = [-2 / 3, 0, 2 / 3];   // lane centers in playerX units (lane dashes sit at +-1/3)
const OPPONENT_CRUISE = [0.80, 0.87];      // cruise speed as fraction of MAX_SPEED
const CAR_GAP = 1300;                      // min nose-to-tail spacing, ~one car length in world units
const FOLLOW_GAP = 2400;                   // opponent matches player speed inside this range
const RUBBER_BAND = 0.08;                  // max +-8% cruise adjustment to keep the race close
const COUNTDOWN_SECONDS = 3;
const BEST_TIME_KEY = 'retro-racer-best-time';

// ----- tuning constants (3D rendering) -----
const YAW_PER_CURVE = 0.0042;        // radians of heading change per curve unit
const ELEVATION_SCALE = 0.35;        // tames the arcade hill heights for 3D
const EXTENSION_SEGMENTS = 60;       // straight run-off past the finish line
const PLAYER_CAR_LENGTH = 1180;      // world units (Miata)
const TRAFFIC_CAR_LENGTH = 1250;     // world units (AE86)
const CAM_DISTANCE = 1800;           // chase camera distance behind the player
const CAM_HEIGHT = 680;
const BASE_FOV = 62;
const FOG_DENSITY = 0.000055;
const FOG_COLOR = 0xc9a285;          // warm sunset haze, matches the HDRI horizon
const SUN_DIR = new THREE.Vector3(-0.55, 0.22, -0.8).normalize();
const ASSET_BASE = '/retro-racer/assets/';

const CAR_COLORS = [0xef4444, 0x3b82f6, 0xeab308, 0xf97316, 0xa855f7, 0x14b8a6, 0xf8fafc];

// ----- helpers -----
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const easeIn = (a, b, percent) => a + (b - a) * Math.pow(percent, 2);
const easeInOut = (a, b, percent) => a + (b - a) * ((-Math.cos(percent * Math.PI) / 2) + 0.5);

function increase(start, amount, max) {
    let result = start + amount;
    while (result >= max) { result -= max; }
    while (result < 0) { result += max; }
    return result;
}

function accelerate(speed, accel, dt) {
    return speed + accel * dt;
}

function overlap(x1, w1, x2, w2) {
    const half = (w1 + w2) / 2;
    return Math.abs(x1 - x2) < half;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

function loadBestTime() {
    try {
        const raw = window.localStorage.getItem(BEST_TIME_KEY);
        const value = parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch (err) {
        return null;
    }
}

function saveBestTime(seconds) {
    try {
        window.localStorage.setItem(BEST_TIME_KEY, String(seconds));
    } catch (err) {
        // private browsing or storage disabled - best time just won't persist
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('racerCanvas');
    const hudTime = document.getElementById('hudTime');
    const hudSpeed = document.getElementById('hudSpeed');
    const hudProgress = document.getElementById('hudProgress');
    const startOverlay = document.getElementById('racerStart');
    const startBtn = document.getElementById('racerStartBtn');
    const startBest = document.getElementById('racerStartBest');
    const loadingNote = document.getElementById('racerLoading');
    const banner = document.getElementById('racerBanner');
    const resultsOverlay = document.getElementById('racerResults');
    const resultTime = document.getElementById('racerResultTime');
    const resultBest = document.getElementById('racerResultBest');
    const againBtn = document.getElementById('racerAgainBtn');

    if (!canvas || !hudTime || !startOverlay || !startBtn || !resultsOverlay || !againBtn) {
        return; // game markup is not on this page
    }

    function showFatalError() {
        startOverlay.replaceChildren();
        const errorTitle = document.createElement('h2');
        errorTitle.textContent = 'Something went wrong';
        const errorText = document.createElement('p');
        errorText.textContent = 'The game could not start in this browser. Please try a recent version of Chrome, Firefox, or Safari.';
        startOverlay.append(errorTitle, errorText);
        startOverlay.classList.remove('hidden');
    }

    // ----- game state -----
    let segments = [];
    let trackLength = 0;             // raceable distance (excludes run-off)
    let cars = [];
    let state = 'ready';             // ready | countdown | racing | finished
    let position = 0;                // camera z position along the track
    let speed = 0;
    let playerX = 0;                 // -1 .. 1 spans the road width
    let raceDistance = 0;
    let elapsed = 0;
    let countdown = 0;
    let goTimer = 0;
    let bounceTimer = 0;
    let steerInput = 0;              // smoothed steer, -1..1 (+1 = left, matches playerX)
    let bestTime = loadBestTime();
    let assetsReady = false;

    const keys = { left: false, right: false, faster: false, slower: false };

    // ----- track construction (same DSL as the 2D version) -----
    function lastY() {
        return segments.length === 0 ? 0 : segments[segments.length - 1].p2y;
    }

    function addSegment(curve, y) {
        const n = segments.length;
        segments.push({
            index: n,
            p1y: lastY(),
            p2y: y,
            curve: curve,
            sprites: []
        });
    }

    function addRoad(enter, hold, leave, curve, y) {
        const startY = lastY();
        const endY = startY + (y || 0) * SEGMENT_LENGTH;
        const total = enter + hold + leave;
        for (let i = 0; i < enter; i++) {
            addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total));
        }
        for (let i = 0; i < hold; i++) {
            addSegment(curve, easeInOut(startY, endY, (enter + i) / total));
        }
        for (let i = 0; i < leave; i++) {
            addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total));
        }
    }

    const addStraight = (n) => addRoad(n, n, n, 0, 0);
    const addCurve = (n, curve, hill) => addRoad(n, n, n, curve, hill);
    const addHill = (n, h) => addRoad(n, n, n, 0, h);

    function addRoadsideScenery() {
        const span = segments.length - 20;
        // trees: a mix of conifers and deciduous, set well back from the road
        for (let n = 20; n < span; n += 3 + Math.floor(Math.random() * 5)) {
            const side = Math.random() < 0.5 ? -1 : 1;
            segments[n].sprites.push({
                type: Math.random() < 0.55 ? 'conifer' : 'deciduous',
                offset: side * (1.5 + Math.random() * 1.7),
                size: 500 + Math.random() * 350
            });
        }
        // bushes hug the road edge
        for (let n = 20; n < span; n += 2 + Math.floor(Math.random() * 4)) {
            const side = Math.random() < 0.5 ? -1 : 1;
            segments[n].sprites.push({
                type: 'bush',
                offset: side * (1.15 + Math.random() * 0.65),
                size: 90 + Math.random() * 110
            });
        }
        // occasional boulders
        for (let n = 25; n < span; n += 9 + Math.floor(Math.random() * 8)) {
            const side = Math.random() < 0.5 ? -1 : 1;
            segments[n].sprites.push({
                type: 'rock',
                offset: side * (1.2 + Math.random() * 1.3),
                size: 70 + Math.random() * 120
            });
        }
    }

    function buildTrack() {
        segments = [];

        // "?testtrack=1" builds a short straight track so the finish flow
        // can be exercised quickly in automated tests
        let shortTrack = false;
        try {
            shortTrack = new URLSearchParams(window.location.search).get('testtrack') === '1';
        } catch (err) {
            shortTrack = false;
        }
        if (shortTrack) {
            addStraight(110);
            trackLength = segments.length * SEGMENT_LENGTH;
            return;
        }

        addStraight(35);
        addCurve(40, 2, 10);
        addStraight(25);
        addCurve(50, -4, -20);
        addHill(40, 40);
        addCurve(50, 4, -40);
        addStraight(30);
        addCurve(35, -2, 0);
        addCurve(35, 2, 0);
        addCurve(35, -3, 0);
        addHill(45, 60);
        addCurve(55, 5, -60);
        addStraight(25);
        addCurve(45, -5, 20);
        addHill(35, -30);
        addCurve(40, 3, 10);
        addStraight(40);

        addRoadsideScenery();
        trackLength = segments.length * SEGMENT_LENGTH;
    }

    function resetCars() {
        cars = [];
        for (let n = 0; n < OPPONENT_COUNT; n++) {
            cars.push({
                z: PLAYER_Z,                            // three abreast with the player at the line
                offset: LANE_OFFSETS[n === 0 ? 0 : 2],  // left and right lanes; player keeps center
                speed: 0,
                cruise: MAX_SPEED * OPPONENT_CRUISE[n],
                finished: false,
                color: CAR_COLORS[n + 1],               // skip index 0 (red, matches player Miata)
                mesh: null
            });
        }
    }

    // player position never wraps (point-to-point sprint), so segment lookup
    // clamps at the ends; traffic still wraps and passes a wrapped z in here
    function findSegment(z) {
        return segments[clamp(Math.floor(z / SEGMENT_LENGTH), 0, segments.length - 1)];
    }

    // ----- physics update (fixed timestep) -----
    function updateCars(dt) {
        if (state !== 'racing' && state !== 'finished') { return; }   // grid holds until GO
        const playerZ = position + PLAYER_Z;
        for (const car of cars) {
            if (car.finished) {
                // coast to a stop in the run-off, like the player
                car.speed = Math.max(0, accelerate(car.speed, BRAKING, dt));
            } else {
                // gentle rubber-band: trail the player -> slightly faster, lead -> slightly slower
                const band = clamp(1 + ((playerZ - car.z) / trackLength) * 2 * RUBBER_BAND,
                    1 - RUBBER_BAND, 1 + RUBBER_BAND);
                const target = car.cruise * band;
                car.speed = car.speed < target
                    ? Math.min(target, accelerate(car.speed, ACCEL, dt))
                    : Math.max(target, accelerate(car.speed, DECEL, dt));
            }
            car.z += dt * car.speed;
            // follow, don't pass: an opponent closing on the player's rear bumper in the
            // same lane matches speed; the hard z-clamp is what guarantees no pass-through
            // even at equal speeds (float creep)
            const gap = playerZ - car.z;
            if (gap >= 0 && gap < FOLLOW_GAP && overlap(playerX, 0.6, car.offset, 0.6)) {
                car.speed = Math.min(car.speed, speed);
                if (gap < CAR_GAP) { car.z = playerZ - CAR_GAP; }
            }
            if (!car.finished && car.z >= trackLength) { car.finished = true; }
            car.z = Math.min(car.z, trackLength + (EXTENSION_SEGMENTS - 25) * SEGMENT_LENGTH);
        }
    }

    function update(dt) {
        if (state === 'countdown') {
            countdown -= dt;
            if (countdown <= 0) {
                state = 'racing';
                goTimer = 0.9;
            }
            return;
        }

        if (state === 'finished') {
            // let the car coast to a stop behind the results overlay,
            // rolling into the run-off straight past the finish line
            speed = Math.max(0, accelerate(speed, BRAKING, dt));
            position = Math.min(position + dt * speed, trackLength + (EXTENSION_SEGMENTS - 20) * SEGMENT_LENGTH);
            updateCars(dt);
            return;
        }

        if (state !== 'racing') {
            return;
        }

        elapsed += dt;
        goTimer = Math.max(0, goTimer - dt);
        bounceTimer += dt;
        updateCars(dt);

        const playerSegment = findSegment(position + PLAYER_Z);
        const speedPercent = speed / MAX_SPEED;
        const dx = dt * 2 * speedPercent;

        position += dt * speed;
        raceDistance += dt * speed;

        const steerTarget = keys.left ? 1 : keys.right ? -1 : 0;
        steerInput += (steerTarget - steerInput) * (1 - Math.exp(-STEER_RESPONSE * dt));
        playerX += dx * steerInput;
        playerX -= dx * speedPercent * playerSegment.curve * CENTRIFUGAL;

        if (keys.faster) { speed = accelerate(speed, ACCEL, dt); }
        else if (keys.slower) { speed = accelerate(speed, BRAKING, dt); }
        else { speed = accelerate(speed, DECEL, dt); }

        if ((playerX < -1 || playerX > 1) && speed > OFF_ROAD_LIMIT) {
            speed = accelerate(speed, OFF_ROAD_DECEL, dt);
        }

        // rear-end collisions: soft -- match the car's speed and hold a stand-off gap
        for (const car of cars) {
            const gap = car.z - (position + PLAYER_Z);
            if (gap >= 0 && gap < CAR_GAP && speed > car.speed && overlap(playerX, 0.6, car.offset, 0.6)) {
                speed = car.speed;
                position = Math.max(0, Math.min(position, car.z - CAR_GAP - PLAYER_Z));
                break;
            }
        }

        playerX = clamp(playerX, -2.2, 2.2);
        speed = clamp(speed, 0, MAX_SPEED);

        if (raceDistance >= trackLength) {
            finishRace();
        }
    }

    function finishRace() {
        state = 'finished';
        const finalTime = elapsed;
        let isRecord = false;
        if (bestTime === null || finalTime < bestTime) {
            bestTime = finalTime;
            saveBestTime(finalTime);
            isRecord = true;
        }
        resultTime.textContent = 'Time: ' + formatTime(finalTime);
        resultBest.textContent = isRecord
            ? 'New best time!'
            : 'Best: ' + formatTime(bestTime);
        resultsOverlay.classList.remove('hidden');
    }

    // ----- world-space centerline -----
    // The 2D renderer faked curves by accumulating screen offsets; here each
    // segment's curve value is integrated as a yaw rate to lay the same track
    // out in world space. Extra straight segments past the finish give the
    // car somewhere to coast after the race.
    let centerline = [];

    function buildCenterline() {
        centerline = [];
        let x = 0;
        let z = 0;
        let yaw = 0;
        const total = segments.length + EXTENSION_SEGMENTS;
        for (let i = 0; i <= total; i++) {
            const inTrack = i < segments.length;
            const y = (inTrack ? segments[i].p1y : segments[segments.length - 1].p2y) * ELEVATION_SCALE;
            centerline.push({ x, y, z, yaw });
            const curve = inTrack ? segments[i].curve : 0;
            yaw += curve * YAW_PER_CURVE;
            x += Math.sin(yaw) * SEGMENT_LENGTH;
            z += Math.cos(yaw) * SEGMENT_LENGTH;
        }
    }

    // sample the centerline at a distance along the track; returns position,
    // heading (yaw) and the lateral basis. NOTE: the basis named rightX/rightZ,
    // (cos yaw, -sin yaw), actually points to the car's LEFT (screen-left) for
    // the forward convention (sin yaw, cos yaw). The whole world (ribbons,
    // traffic, trees, camera) is built consistently in this mirrored basis, so
    // positive lateral units / positive playerX mean screen-LEFT. The steering
    // input signs in the update loop (keys.left -> playerX += dx) are chosen
    // to match. Do not flip this basis without reversing ribbon winding too.
    const sampleOut = { x: 0, y: 0, z: 0, yaw: 0, rightX: 0, rightZ: 0 };

    function sampleCenterline(dist) {
        const f = clamp(dist / SEGMENT_LENGTH, 0, centerline.length - 1.001);
        const i = Math.floor(f);
        const t = f - i;
        const a = centerline[i];
        const b = centerline[i + 1];
        sampleOut.x = a.x + (b.x - a.x) * t;
        sampleOut.y = a.y + (b.y - a.y) * t;
        sampleOut.z = a.z + (b.z - a.z) * t;
        sampleOut.yaw = a.yaw + (b.yaw - a.yaw) * t;
        sampleOut.rightX = Math.cos(sampleOut.yaw);
        sampleOut.rightZ = -Math.sin(sampleOut.yaw);
        return sampleOut;
    }

    // ----- three.js scene -----
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    } catch (err) {
        showFatalError();
        return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 10, 50, 150000);

    const sun = new THREE.DirectionalLight(0xffd9b0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1000;
    sun.shadow.camera.far = 30000;
    sun.shadow.camera.left = -2200;
    sun.shadow.camera.right = 2200;
    sun.shadow.camera.top = 2200;
    sun.shadow.camera.bottom = -2200;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);
    scene.add(new THREE.HemisphereLight(0xc9b2e8, 0x2a2018, 0.25));

    // ----- asset loading -----
    const manager = new THREE.LoadingManager();
    const textureLoader = new THREE.TextureLoader(manager);
    const gltfLoader = new GLTFLoader(manager);
    const rgbeLoader = new RGBELoader(manager);

    manager.onProgress = (url, loaded, total) => {
        if (loadingNote) {
            loadingNote.textContent = 'Loading 3D assets... ' + loaded + ' / ' + total;
        }
    };
    manager.onLoad = () => {
        assetsReady = true;
        startBtn.disabled = false;
        if (loadingNote) {
            loadingNote.textContent = '';
            loadingNote.classList.add('hidden');
        }
    };
    manager.onError = (url) => {
        // missing textures or models degrade visuals but the game still runs
        console.error('Retro Racer: failed to load ' + url);
    };

    function loadRepeatingTexture(file, srgb) {
        const tex = textureLoader.load(ASSET_BASE + file);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (srgb) { tex.colorSpace = THREE.SRGBColorSpace; }
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return tex;
    }

    rgbeLoader.load(ASSET_BASE + 'venice_sunset_1k.hdr', (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = hdr;
        scene.environment = hdr;
    });

    // ----- car model handling -----
    // GLB scenes arrive with arbitrary size and origin; wrap each in a group
    // scaled so the car is `targetLength` long, sitting on y=0, centered.
    function normalizeCar(object, targetLength) {
        // precise=true measures actual vertices; the default corner-transformed
        // AABBs overshoot on rotated FBX-style node trees (the Miata read ~60
        // model units too low, leaving the player car hovering above the road)
        const box = new THREE.Box3().setFromObject(object, true);
        const size = box.getSize(new THREE.Vector3());
        const scale = targetLength / size.z;
        object.position.set(
            -(box.min.x + box.max.x) / 2,
            -box.min.y,
            -(box.min.z + box.max.z) / 2
        );
        const rig = new THREE.Group();
        rig.scale.setScalar(scale);
        rig.add(object);
        const wrapper = new THREE.Group();
        wrapper.add(rig);
        return wrapper;
    }

    // glass via KHR_materials_transmission forces an extra full render pass;
    // plain alpha transparency looks close enough at racing distance
    function simplifyGlass(object) {
        object.traverse((node) => {
            if (node.isMesh && node.material && node.material.transmission > 0) {
                node.material.transmission = 0;
                node.material.transparent = true;
                node.material.opacity = 0.45;
            }
        });
    }

    function createPlaceholderCar(colorHex, targetLength) {
        // fallback if a GLB fails to load: simple box car so the game stays playable
        const group = new THREE.Group();
        const w = targetLength * 0.45;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(w, targetLength * 0.2, targetLength),
            new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.6 })
        );
        body.position.y = targetLength * 0.16;
        const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, targetLength * 0.12, targetLength * 0.45),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.4 })
        );
        cabin.position.set(0, targetLength * 0.31, -targetLength * 0.05);
        group.add(body, cabin);
        const wheelGeo = new THREE.CylinderGeometry(targetLength * 0.08, targetLength * 0.08, w * 0.2, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(sx * w * 0.46, targetLength * 0.08, sz * targetLength * 0.32);
            group.add(wheel);
        }
        const wrapper = new THREE.Group();
        wrapper.add(group);
        return wrapper;
    }

    let playerCar = createPlaceholderCar(0xef4444, PLAYER_CAR_LENGTH);
    scene.add(playerCar);

    let trafficTemplate = null;       // normalized AE86 wrapper
    let trafficBodyMaterial = null;   // material to recolor per traffic car
    const tintedMaterials = new Map();

    gltfLoader.load(ASSET_BASE + 'miata.glb', (gltf) => {
        simplifyGlass(gltf.scene);
        gltf.scene.traverse((node) => {
            if (node.isMesh) { node.castShadow = true; }
        });
        scene.remove(playerCar);
        playerCar = normalizeCar(gltf.scene, PLAYER_CAR_LENGTH);
        scene.add(playerCar);
    });

    // the car body is assumed to be the largest untextured mesh in the model
    function findBodyMaterial(object) {
        let best = null;
        let bestTris = 0;
        object.traverse((node) => {
            if (node.isMesh && node.material && !node.material.map && node.geometry.index) {
                const tris = node.geometry.index.count / 3;
                if (tris > bestTris) {
                    bestTris = tris;
                    best = node.material;
                }
            }
        });
        return best;
    }

    function tintedMaterial(colorHex) {
        if (!tintedMaterials.has(colorHex)) {
            const mat = trafficBodyMaterial.clone();
            mat.color.set(colorHex);
            tintedMaterials.set(colorHex, mat);
        }
        return tintedMaterials.get(colorHex);
    }

    function spawnTrafficMeshes() {
        for (const car of cars) {
            if (car.mesh) { continue; }
            let mesh;
            if (trafficTemplate) {
                mesh = trafficTemplate.clone(true);
                if (trafficBodyMaterial) {
                    mesh.traverse((node) => {
                        if (node.isMesh && node.material === trafficBodyMaterial) {
                            node.material = tintedMaterial(car.color);
                        }
                    });
                }
            } else {
                mesh = createPlaceholderCar(car.color, TRAFFIC_CAR_LENGTH);
            }
            mesh.add(createBlobShadow());
            car.mesh = mesh;
            scene.add(mesh);
        }
    }

    function clearTrafficMeshes() {
        for (const car of cars) {
            if (car.mesh) {
                scene.remove(car.mesh);
                car.mesh = null;
            }
        }
    }

    gltfLoader.load(ASSET_BASE + 'ae86.glb', (gltf) => {
        simplifyGlass(gltf.scene);
        trafficTemplate = normalizeCar(gltf.scene, TRAFFIC_CAR_LENGTH);
        trafficBodyMaterial = findBodyMaterial(trafficTemplate);
        // initial traffic spawned as placeholders before the model arrived
        clearTrafficMeshes();
        spawnTrafficMeshes();
    });

    // soft dark disc under traffic cars - much cheaper than real shadow casters
    let blobTexture = null;

    function createBlobShadow() {
        if (!blobTexture) {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
            grad.addColorStop(0, 'rgba(0,0,0,0.55)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(0, 0, 128, 128);
            blobTexture = new THREE.CanvasTexture(c);
        }
        const blob = new THREE.Mesh(
            new THREE.PlaneGeometry(TRAFFIC_CAR_LENGTH * 0.62, TRAFFIC_CAR_LENGTH * 1.05),
            new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false })
        );
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 6;
        return blob;
    }

    // ----- track meshes -----
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    function buildRibbon(laterals, ys, uScale, getColor) {
        // generic triangle-strip ribbon along the centerline; laterals is the
        // lateral profile (world units from the centerline), ys optional
        // per-profile-point height offsets
        const cols = laterals.length;
        const rows = centerline.length;
        const positions = new Float32Array(rows * cols * 3);
        const uvs = new Float32Array(rows * cols * 2);
        const colors = getColor ? new Float32Array(rows * cols * 3) : null;
        const color = new THREE.Color();
        for (let i = 0; i < rows; i++) {
            const p = centerline[i];
            const rx = Math.cos(p.yaw);
            const rz = -Math.sin(p.yaw);
            for (let j = 0; j < cols; j++) {
                const k = i * cols + j;
                positions[k * 3] = p.x + rx * laterals[j];
                positions[k * 3 + 1] = p.y + (ys ? ys[j] : 0);
                positions[k * 3 + 2] = p.z + rz * laterals[j];
                uvs[k * 2] = laterals[j] / (1000 / uScale);
                uvs[k * 2 + 1] = i * (SEGMENT_LENGTH / (1000 / uScale)) / 1;
                if (colors) {
                    getColor(i, color);
                    colors[k * 3] = color.r;
                    colors[k * 3 + 1] = color.g;
                    colors[k * 3 + 2] = color.b;
                }
            }
        }
        const indices = [];
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < cols - 1; j++) {
                const a = i * cols + j;
                const b = a + cols;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        if (colors) { geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); }
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }

    function buildPartialRibbon(fromIndex, toIndex, laterals, yLift, uRepeat, vRepeat) {
        // ribbon spanning only part of the track (lane dashes, checkered strips)
        const rows = toIndex - fromIndex + 1;
        const cols = laterals.length;
        const positions = new Float32Array(rows * cols * 3);
        const uvs = new Float32Array(rows * cols * 2);
        for (let i = 0; i < rows; i++) {
            const p = centerline[fromIndex + i];
            const rx = Math.cos(p.yaw);
            const rz = -Math.sin(p.yaw);
            for (let j = 0; j < cols; j++) {
                const k = i * cols + j;
                positions[k * 3] = p.x + rx * laterals[j];
                positions[k * 3 + 1] = p.y + yLift;
                positions[k * 3 + 2] = p.z + rz * laterals[j];
                uvs[k * 2] = (j / (cols - 1)) * uRepeat;
                uvs[k * 2 + 1] = (i / (rows - 1)) * vRepeat;
            }
        }
        const indices = [];
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < cols - 1; j++) {
                const a = i * cols + j;
                const b = a + cols;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }

    // thin strip across the road at an arbitrary track distance (finish line edges)
    function buildCrossStrip(dist, length, yLift) {
        const s0 = sampleCenterline(dist);
        const x0 = s0.x, y0 = s0.y, z0 = s0.z, rx0 = s0.rightX, rz0 = s0.rightZ;
        const s1 = sampleCenterline(dist + length);
        const positions = new Float32Array([
            x0 - rx0 * ROAD_WIDTH, y0 + yLift, z0 - rz0 * ROAD_WIDTH,
            x0 + rx0 * ROAD_WIDTH, y0 + yLift, z0 + rz0 * ROAD_WIDTH,
            s1.x - s1.rightX * ROAD_WIDTH, s1.y + yLift, s1.z - s1.rightZ * ROAD_WIDTH,
            s1.x + s1.rightX * ROAD_WIDTH, s1.y + yLift, s1.z + s1.rightZ * ROAD_WIDTH
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex([0, 2, 1, 2, 3, 1]);   // same winding as buildPartialRibbon
        geo.computeVertexNormals();
        return geo;
    }

    function checkerTexture() {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 64;
        const g = c.getContext('2d');
        const cell = 32;
        for (let y = 0; y < c.height / cell; y++) {
            for (let x = 0; x < c.width / cell; x++) {
                g.fillStyle = (x + y) % 2 ? '#0f172a' : '#f8fafc';
                g.fillRect(x * cell, y * cell, cell, cell);
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function finishBannerTexture() {
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = '#0f172a';
        g.fillRect(0, 0, c.width, c.height);
        const cell = 16;   // checker bands along top and bottom edges
        for (let x = 0; x < c.width / cell; x++) {
            for (const y of [0, 1, 6, 7]) {
                g.fillStyle = (x + y) % 2 ? '#0f172a' : '#f8fafc';
                g.fillRect(x * cell, y * cell, cell, cell);
            }
        }
        g.fillStyle = '#f8fafc';
        g.font = 'bold 72px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('FINISH', c.width / 2, c.height / 2);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function buildFinishGantry() {
        const p = sampleCenterline(trackLength);
        const gantry = new THREE.Group();
        gantry.position.set(p.x, p.y, p.z);
        gantry.rotation.y = p.yaw;   // local +X = the road's lateral basis, +Z = down-track
        const postMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.4 });
        const postGeo = new THREE.BoxGeometry(60, 1100, 60);
        for (const side of [-1, 1]) {
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(side * (ROAD_WIDTH + 180), 550, 0);
            gantry.add(post);
        }
        const banner = new THREE.Mesh(
            new THREE.PlaneGeometry((ROAD_WIDTH + 180) * 2, 320),
            new THREE.MeshBasicMaterial({ map: finishBannerTexture(), side: THREE.DoubleSide })
        );
        banner.position.y = 920;
        banner.rotation.y = Math.PI;   // lateral basis points screen-left; face the text at the player
        gantry.add(banner);
        trackGroup.add(gantry);
    }

    function buildTrackMeshes() {
        trackGroup.clear();

        // road surface
        const roadMat = new THREE.MeshStandardMaterial({
            map: loadRepeatingTexture('asphalt_track_diff_1k.jpg', true),
            normalMap: loadRepeatingTexture('asphalt_track_nor_gl_1k.jpg', false),
            roughnessMap: loadRepeatingTexture('asphalt_track_rough_1k.jpg', false),
            roughness: 1.0
        });
        const road = new THREE.Mesh(buildRibbon([-ROAD_WIDTH, 0, ROAD_WIDTH], null, 1), roadMat);
        road.receiveShadow = true;
        trackGroup.add(road);

        // rumble strips: alternating red / white stripes via vertex colors
        const rumbleW = ROAD_WIDTH / 6;
        const rumbleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
        const red = new THREE.Color(0xb91c1c);
        const white = new THREE.Color(0xe2e8f0);
        const stripeColor = (i, out) => {
            out.copy(Math.floor(i / RUMBLE_LENGTH) % 2 ? red : white);
        };
        const rumbleYs = [2, 2];
        for (const side of [-1, 1]) {
            const inner = side * ROAD_WIDTH;
            const outer = side * (ROAD_WIDTH + rumbleW);
            const geo = buildRibbon([inner, outer], rumbleYs, 1, stripeColor);
            trackGroup.add(new THREE.Mesh(geo, rumbleMat));
        }

        // grass: ribbon hugging the road with an embankment falling away at
        // the edges, plus a huge base plane to fill the horizon
        const grassMat = new THREE.MeshStandardMaterial({
            map: loadRepeatingTexture('aerial_grass_rock_diff_1k.jpg', true),
            normalMap: loadRepeatingTexture('aerial_grass_rock_nor_gl_1k.jpg', false),
            roughness: 1.0
        });
        grassMat.map.repeat.set(1, 1);
        const grassLats = [-9000, -4500, -(ROAD_WIDTH + rumbleW + 20), ROAD_WIDTH + rumbleW + 20, 4500, 9000];
        const grassYs = [-900, -260, -4, -4, -260, -900];
        const grass = new THREE.Mesh(buildRibbon(grassLats, grassYs, 0.5), grassMat);
        grass.receiveShadow = true;
        trackGroup.add(grass);

        const basePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(400000, 400000),
            new THREE.MeshStandardMaterial({ color: 0x2c3b1e, roughness: 1.0 })
        );
        basePlane.rotation.x = -Math.PI / 2;
        basePlane.position.y = -950;
        trackGroup.add(basePlane);

        // dashed lane lines on stripe-aligned groups of segments
        const laneMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.85 });
        const laneHalf = 11;
        const laneGeos = [];
        for (let i = 0; i < segments.length; i += RUMBLE_LENGTH * 2) {
            const end = Math.min(i + RUMBLE_LENGTH, segments.length - 1);
            for (let lane = 1; lane < LANES; lane++) {
                const lx = -ROAD_WIDTH + (2 * ROAD_WIDTH / LANES) * lane;
                laneGeos.push(buildPartialRibbon(i, end, [lx - laneHalf, lx + laneHalf], 3, 1, 1));
            }
        }
        if (laneGeos.length > 0) {
            // one merged mesh instead of a draw call per dash
            trackGroup.add(new THREE.Mesh(mergeGeometries(laneGeos), laneMat));
        }

        // checkered strips across the road at the start and finish lines
        const checkerMap = checkerTexture();
        const checkerMat = new THREE.MeshStandardMaterial({
            map: checkerMap,
            emissive: 0xffffff,
            emissiveMap: checkerMap,
            emissiveIntensity: 0.35,
            roughness: 0.6
        });
        const checkerLats = [-ROAD_WIDTH, ROAD_WIDTH];
        trackGroup.add(new THREE.Mesh(buildPartialRibbon(1, 5, checkerLats, 4, 10, 3), checkerMat));
        trackGroup.add(new THREE.Mesh(
            buildPartialRibbon(segments.length - 2, segments.length, checkerLats, 4, 10, 2),
            checkerMat
        ));

        // white edge lines bracketing the finish checker
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
        trackGroup.add(new THREE.Mesh(buildCrossStrip(trackLength - 460, 60, 5), edgeMat));
        trackGroup.add(new THREE.Mesh(buildCrossStrip(trackLength, 60, 5), edgeMat));

        buildFinishGantry();
        buildSceneryMeshes();
    }

    // deterministic per-vertex noise: hashed from position so duplicated
    // (unwelded) vertices that share a position always move together
    function hashNoise(x, y, z, seed) {
        const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
        return s - Math.floor(s);
    }

    // organic silhouette: weld duplicate vertices (so displacement can't tear
    // the mesh), push each vertex radially by a position-hashed amount, then
    // smooth the normals. Call BEFORE translating the geometry into place.
    function jitterGeometry(geo, amount, seed) {
        const welded = mergeVertices(geo);
        const posAttr = welded.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
            const k = 1 + (hashNoise(x, y, z, seed) - 0.5) * 2 * amount;
            posAttr.setXYZ(i, x * k, y * k, z * k);
        }
        welded.computeVertexNormals();
        return welded;
    }

    function buildConiferGeos() {
        const trunk = new THREE.CylinderGeometry(20, 42, 320, 6);
        trunk.translate(0, 160, 0);
        // stacked irregular cones with slight lateral offsets per tier;
        // un-welded after jittering so the facets stay hard (reads as boughs)
        const tiers = [
            [300, 420, 380, 14, -10],
            [250, 390, 580, -16, 12],
            [195, 350, 790, 10, 14],
            [140, 310, 980, -12, -10],
            [90, 260, 1150, 8, -8]
        ].map(([r, h, y, ox, oz], i) => {
            const cone = jitterGeometry(new THREE.ConeGeometry(r, h, 9), 0.18, i + 1).toNonIndexed();
            cone.computeVertexNormals();
            cone.translate(ox, y, oz);
            return cone;
        });
        return { trunk, canopy: mergeGeometries(tiers) };
    }

    function buildDeciduousGeos() {
        const parts = [new THREE.CylinderGeometry(26, 58, 380, 7).translate(0, 190, 0)];
        // two branch stubs poking out below the canopy
        const left = new THREE.CylinderGeometry(11, 18, 190, 5);
        left.rotateZ(0.65); left.translate(70, 360, 20);
        const right = new THREE.CylinderGeometry(11, 18, 170, 5);
        right.rotateZ(-0.7); right.translate(-65, 330, -25);
        parts.push(left, right);
        const trunk = mergeGeometries(parts);
        // crown: a cluster of jittered blobs merged into one geometry
        const blobs = [
            [0, 640, 0, 230],
            [150, 560, 60, 165],
            [-160, 580, -40, 175],
            [40, 540, -150, 150],
            [-30, 560, 150, 155],
            [10, 760, 30, 160]
        ].map(([x, y, z, r], i) => {
            const blob = jitterGeometry(new THREE.IcosahedronGeometry(r, 1), 0.2, i + 11);
            blob.translate(x, y, z);
            return blob;
        });
        return { trunk, canopy: mergeGeometries(blobs) };
    }

    function buildBushGeo() {
        const bush = jitterGeometry(new THREE.IcosahedronGeometry(100, 1), 0.24, 21);
        bush.scale(1, 0.72, 1);
        bush.translate(0, 58, 0);
        return bush;
    }

    function buildRockGeo() {
        // jitter welded for shape, then un-weld so normals stay faceted
        const rock = jitterGeometry(new THREE.IcosahedronGeometry(80, 1), 0.3, 31).toNonIndexed();
        rock.computeVertexNormals();
        rock.scale(1.3, 0.8, 1);
        rock.translate(0, 36, 0); // sits half-buried at the p.y - 30 drop
        return rock;
    }

    function buildSceneryMeshes() {
        const byType = { conifer: [], deciduous: [], bush: [], rock: [] };
        for (const segment of segments) {
            for (const sprite of segment.sprites) {
                (byType[sprite.type] || byType.conifer).push({
                    index: segment.index, offset: sprite.offset, size: sprite.size
                });
            }
        }

        // base colors are white where setColorAt supplies the real color,
        // so per-instance variation reads true
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1.0 });
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 });

        const matrix = new THREE.Matrix4();
        const quat = new THREE.Quaternion();
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const color = new THREE.Color();

        // entries -> one InstancedMesh per geometry part; parts marked with a
        // colorFn get per-instance color variation
        function instantiate(entries, parts, sizeDivisor) {
            if (entries.length === 0) { return; }
            const meshes = parts.map((part) =>
                new THREE.InstancedMesh(part.geo, part.mat, entries.length));
            entries.forEach((e, n) => {
                const p = sampleCenterline(e.index * SEGMENT_LENGTH);
                const lateral = e.offset * ROAD_WIDTH;
                pos.set(p.x + p.rightX * lateral, p.y - 30, p.z + p.rightZ * lateral);
                const s = e.size / sizeDivisor;
                scl.set(s, s * (0.9 + Math.random() * 0.3), s);
                quat.setFromAxisAngle(up, Math.random() * Math.PI * 2);
                matrix.compose(pos, quat, scl);
                meshes.forEach((mesh, i) => {
                    mesh.setMatrixAt(n, matrix);
                    if (parts[i].colorFn) {
                        parts[i].colorFn(color);
                        mesh.setColorAt(n, color);
                    }
                });
            });
            trackGroup.add(...meshes);
        }

        const conifer = buildConiferGeos();
        const deciduous = buildDeciduousGeos();
        instantiate(byType.conifer, [
            { geo: conifer.trunk, mat: trunkMat },
            { geo: conifer.canopy, mat: foliageMat,
              colorFn: (c) => c.setHSL(0.3 + Math.random() * 0.05, 0.5, 0.08 + Math.random() * 0.07) }
        ], 650);
        instantiate(byType.deciduous, [
            { geo: deciduous.trunk, mat: trunkMat },
            { geo: deciduous.canopy, mat: foliageMat,
              colorFn: (c) => c.setHSL(0.24 + Math.random() * 0.09, 0.45, 0.16 + Math.random() * 0.1) }
        ], 650);
        instantiate(byType.bush, [
            { geo: buildBushGeo(), mat: foliageMat,
              colorFn: (c) => c.setHSL(0.21 + Math.random() * 0.1, 0.45, 0.14 + Math.random() * 0.09) }
        ], 130);
        instantiate(byType.rock, [
            { geo: buildRockGeo(), mat: rockMat,
              colorFn: (c) => c.setHSL(0.08, 0.05, 0.22 + Math.random() * 0.14) }
        ], 110);
    }

    // ----- per-frame scene updates -----
    let camLateral = 0;
    let camFov = BASE_FOV;
    const camPos = new THREE.Vector3();
    const camTarget = new THREE.Vector3();

    function placeCar(wrapper, dist, lateralUnits, steerLean) {
        const p = sampleCenterline(dist);
        wrapper.position.set(
            p.x + p.rightX * lateralUnits,
            p.y,
            p.z + p.rightZ * lateralUnits
        );
        wrapper.rotation.set(0, p.yaw + steerLean, 0);
    }

    function updateScene(frameDt) {
        const speedPercent = speed / MAX_SPEED;
        const steer = -steerInput * speedPercent;

        // player car
        const playerDist = position + PLAYER_Z;
        placeCar(playerCar, playerDist, playerX * ROAD_WIDTH, -steer * 0.18);
        playerCar.position.y += Math.abs(Math.sin(bounceTimer * 22)) * speedPercent * 6;
        playerCar.rotation.z = steer * 0.05;

        // traffic
        for (const car of cars) {
            if (car.mesh) {
                placeCar(car.mesh, car.z, car.offset * ROAD_WIDTH, 0);
            }
        }

        // chase camera: trails the player, smoothed laterally, FOV widens with speed
        const alpha = 1 - Math.exp(-6 * frameDt);
        camLateral += ((playerX * ROAD_WIDTH * 0.72) - camLateral) * alpha;
        const camSample = sampleCenterline(playerDist - CAM_DISTANCE);
        camPos.set(
            camSample.x + camSample.rightX * camLateral,
            camSample.y + CAM_HEIGHT,
            camSample.z + camSample.rightZ * camLateral
        );
        camera.position.lerp(camPos, state === 'ready' ? 1 : alpha * 1.6);
        const aheadSample = sampleCenterline(playerDist + 1000);
        camTarget.set(
            aheadSample.x + aheadSample.rightX * playerX * ROAD_WIDTH * 0.85,
            aheadSample.y + 230,
            aheadSample.z + aheadSample.rightZ * playerX * ROAD_WIDTH * 0.85
        );
        camera.lookAt(camTarget);
        camera.rotateZ(-steer * 0.04);

        const targetFov = BASE_FOV + 9 * speedPercent;
        camFov += (targetFov - camFov) * alpha;
        if (Math.abs(camera.fov - camFov) > 0.01) {
            camera.fov = camFov;
            camera.updateProjectionMatrix();
        }

        // keep the sun and its tight shadow frustum centered on the player
        sun.position.copy(playerCar.position).addScaledVector(SUN_DIR, 12000);
        sun.target.position.copy(playerCar.position);
    }

    function updateBanner() {
        if (!banner) { return; }
        if (state === 'countdown') {
            banner.textContent = String(Math.ceil(countdown));
            banner.classList.remove('hidden');
        } else if (state === 'racing' && goTimer > 0) {
            banner.textContent = 'GO!';
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    function updateHud() {
        hudTime.textContent = formatTime(elapsed);
        if (hudSpeed) {
            hudSpeed.textContent = Math.round((speed / MAX_SPEED) * 320) + ' km/h';
        }
        if (hudProgress) {
            hudProgress.textContent = Math.min(100, Math.floor((raceDistance / trackLength) * 100)) + '%';
        }
    }

    // ----- game flow -----
    function startRace() {
        if (!assetsReady) { return; }
        position = 0;
        speed = 0;
        playerX = 0;
        raceDistance = 0;
        elapsed = 0;
        goTimer = 0;
        bounceTimer = 0;
        steerInput = 0;
        camLateral = 0;
        countdown = COUNTDOWN_SECONDS;
        clearTrafficMeshes();
        resetCars();
        spawnTrafficMeshes();
        startOverlay.classList.add('hidden');
        resultsOverlay.classList.add('hidden');
        state = 'countdown';
    }

    function showBestOnStart() {
        if (startBest) {
            startBest.textContent = bestTime !== null ? 'Best time: ' + formatTime(bestTime) : '';
        }
    }

    // ----- input -----
    const KEY_MAP = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'faster', w: 'faster', W: 'faster',
        ArrowDown: 'slower', s: 'slower', S: 'slower'
    };

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (state === 'ready' || state === 'finished')) {
            event.preventDefault();
            startRace();
            return;
        }
        const action = KEY_MAP[event.key];
        if (action && (state === 'racing' || state === 'countdown')) {
            event.preventDefault();
            keys[action] = true;
        }
    });

    document.addEventListener('keyup', (event) => {
        const action = KEY_MAP[event.key];
        if (action) {
            keys[action] = false;
        }
    });

    function bindTouchButton(id, action) {
        const btn = document.getElementById(id);
        if (!btn) { return; }
        const press = (event) => {
            event.preventDefault();
            keys[action] = true;
            btn.classList.add('pressed');
        };
        const release = () => {
            keys[action] = false;
            btn.classList.remove('pressed');
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
    }

    bindTouchButton('racerBtnLeft', 'left');
    bindTouchButton('racerBtnRight', 'right');
    bindTouchButton('racerBtnGas', 'faster');
    bindTouchButton('racerBtnBrake', 'slower');

    startBtn.addEventListener('click', startRace);
    againBtn.addEventListener('click', startRace);

    // ----- sizing -----
    function resize() {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    window.addEventListener('resize', resize);

    // ----- main loop -----
    let lastTime = null;
    let accumulator = 0;

    function frame(now) {
        if (lastTime === null) { lastTime = now; }
        // clamp so a backgrounded tab doesn't fast-forward the race
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        accumulator += dt;
        while (accumulator >= STEP) {
            update(STEP);
            accumulator -= STEP;
        }
        updateScene(dt);
        updateBanner();
        updateHud();
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }

    try {
        buildTrack();
        buildCenterline();
        buildTrackMeshes();
        resetCars();
        spawnTrafficMeshes();
        showBestOnStart();
        resize();
        requestAnimationFrame(frame);
    } catch (err) {
        console.error('Retro Racer:', err);
        showFatalError();
    }
});
