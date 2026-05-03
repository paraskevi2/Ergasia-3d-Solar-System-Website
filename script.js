import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);

document.body.appendChild(renderer.domElement);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.zIndex = '1';
renderer.domElement.style.cursor = 'grab';
document.body.style.margin = '0';
document.body.style.padding = '0';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 1, 1000);
camera.position.set(0, 0, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI;
controls.minPolarAngle = 0;
controls.autoRotate = false;
controls.target = new THREE.Vector3(0, 0, 0);
controls.update();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let zoomedObject = null;
const defaultCameraPosition = new THREE.Vector3(0, 0, 10);
const defaultCameraTarget = new THREE.Vector3(0, 0, 0);
const animationState = {
    active: false,
    t: 0,
    startCamera: new THREE.Vector3(),
    endCamera: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
};
const infoBox = document.getElementById('info-box');

function createGlowTexture() {
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext('2d');
    const gradient = glowCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 236, 145, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 173, 59, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 173, 59, 0)');
    glowCtx.fillStyle = gradient;
    glowCtx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(glowCanvas);
}

function createSunSurfaceTexture() {
    const surfaceCanvas = document.createElement('canvas');
    surfaceCanvas.width = 512;
    surfaceCanvas.height = 512;
    const surfaceCtx = surfaceCanvas.getContext('2d');

    const gradient = surfaceCtx.createRadialGradient(256, 256, 20, 256, 256, 256);
    gradient.addColorStop(0, '#fff8c1');
    gradient.addColorStop(0.35, '#ffd05a');
    gradient.addColorStop(0.7, '#ffb430');
    gradient.addColorStop(1, '#c65f05');
    surfaceCtx.fillStyle = gradient;
    surfaceCtx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = 2 + Math.random() * 6;
        const alpha = 0.08 + Math.random() * 0.2;
        surfaceCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        surfaceCtx.beginPath();
        surfaceCtx.arc(x, y, radius, 0, Math.PI * 2);
        surfaceCtx.fill();
    }

    return new THREE.CanvasTexture(surfaceCanvas);
}

const loader = new GLTFLoader().setPath('public/solar system/');
let solarSystemMesh;
loader.load('SolarSystem.gltf', (gltf) => {
    solarSystemMesh = gltf.scene;
    solarSystemMesh.scale.set(0.15, 0.15, 0.15);
    solarSystemMesh.position.set(0, -0.9, 0);
    scene.add(solarSystemMesh);

    let sunMesh = null;
    solarSystemMesh.traverse((child) => {
        if (child.isMesh && child.material) {
            const name = (child.name || '').toLowerCase();
            if (name.includes('sun')) {
                sunMesh = child;
                const originalMap = child.material.map;
                if (originalMap) {
                    child.material.emissiveMap = originalMap;
                } else {
                    child.material.emissiveMap = createSunSurfaceTexture();
                }
                child.material.emissive = new THREE.Color(0xffd16f);
                child.material.emissiveIntensity = 3.0;
                child.material.color = new THREE.Color(0xffd77a);
                child.material.needsUpdate = true;
            }
            if (child.name === 'Sphere.001') {
                child.material.emissive = new THREE.Color(0xffffff);
                child.material.emissiveIntensity = 1.0;
            }
        }
    });

    if (sunMesh) {
        const glowMap = createGlowTexture();
        const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowMap,
            color: 0xffd974,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        const sunPosition = new THREE.Vector3();
        sunMesh.getWorldPosition(sunPosition);
        glowSprite.position.copy(sunPosition);
        glowSprite.scale.set(3.5, 3.5, 1);
        scene.add(glowSprite);

        const sunLight = new THREE.PointLight(0xffe5b4, 1.3, 45, 2);
        sunLight.position.copy(sunPosition);
        scene.add(sunLight);
    }
}, undefined, (error) => {
    console.error('DEN LEITOURGEIIIIII:', error);
});

function getTopLevelObject(object) {
    while (object.parent && object.parent !== solarSystemMesh) {
        object = object.parent;
    }
    return object;
}

function startZoomAnimation(targetCamera, targetFocus) {
    animationState.active = true;
    animationState.t = 0;
    animationState.startCamera.copy(camera.position);
    animationState.startTarget.copy(controls.target);
    animationState.endCamera.copy(targetCamera);
    animationState.endTarget.copy(targetFocus);
}

function setZoomState(object) {
    const objectPosition = new THREE.Vector3();
    object.getWorldPosition(objectPosition);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const cameraOffset = direction.multiplyScalar(4.4);
    const targetCameraPosition = objectPosition.clone().add(cameraOffset);

    startZoomAnimation(targetCameraPosition, objectPosition);
    zoomedObject = object;
    infoBox.classList.remove('hidden');
    infoBox.textContent = ` ${object.name || 'object'} - click again to return`;
}

function resetZoom() {
    startZoomAnimation(defaultCameraPosition, defaultCameraTarget);
    zoomedObject = null;
    infoBox.classList.add('hidden');
}

function onModelClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (!solarSystemMesh) {
        return;
    }

    const intersects = raycaster.intersectObject(solarSystemMesh, true);
    if (intersects.length > 0) {
        const clickedObject = getTopLevelObject(intersects[0].object);

        if (zoomedObject === clickedObject) {
            resetZoom();
        } else {
            setZoomState(clickedObject);
        }
    } else if (zoomedObject) {
        resetZoom();
    }
}

renderer.domElement.addEventListener('click', onModelClick);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
canvas.width = 512;
canvas.height = 128;
context.font = 'Bold 60px Arial';
context.fillStyle = 'white';
context.textAlign = 'center';
context.fillText('Solar System', canvas.width / 2, canvas.height / 2);

const texture = new THREE.CanvasTexture(canvas);
const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
const titleSprite = new THREE.Sprite(spriteMaterial);
titleSprite.position.set(0, 1.3, 0);
titleSprite.scale.set(6, 1.5, 1); 
scene.add(titleSprite);

function animate() {
    requestAnimationFrame(animate);
    if (solarSystemMesh && !zoomedObject) {
        solarSystemMesh.rotation.y += 0.01;
    }

    if (animationState.active) {
        animationState.t += 0.04;
        if (animationState.t >= 1) {
            animationState.t = 1;
            animationState.active = false;
        }
        camera.position.lerpVectors(animationState.startCamera, animationState.endCamera, animationState.t);
        controls.target.lerpVectors(animationState.startTarget, animationState.endTarget, animationState.t);
    }

    controls.update();
    renderer.render(scene, camera);
}
animate();