import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.module.min.js'

// construct our world scene
const threejs = new THREE.WebGLRenderer();
threejs.shadowMap.enabled = true;
threejs.shadowMap.type = THREE.PCFSoftShadowMap;
threejs.setPixelRatio(window.devicePixelRatio);
threejs.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(threejs.domElement);

// call resize function?

// setup camera
const camera = new THREE.PerspectiveCamera(60, window.devicePixelRatio, 1.0, 1000.0);
camera.position.set(75, 20, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(100, 100, 100);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;

const ambient = new THREE.AmbientLight(0x404040);

// setup scene
const scene = new THREE.Scene();
scene.add(sun, ambient);

// render function
function renderFrame() {
  requestAnimationFrame(() => {
    threejs.render(scene, camera);
    renderFrame();
  });
}
// call render function
renderFrame();