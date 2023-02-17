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
camera.position.set(0, 40, 140);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(100, 100, 100);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.bias = -0.001;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 1.0;
sun.shadow.camera.far = 1000;
sun.shadow.camera.left = 200;
sun.shadow.camera.right = -200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;

const ambient = new THREE.AmbientLight(0x404040);

// setup basic test meshes
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xFFFFFF
  }));
plane.castShadow = false;
plane.receiveShadow = true;
plane.rotation.x = -Math.PI / 2;

const box = new THREE.Mesh(
  new THREE.BoxGeometry(20, 20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x808080
  }));
box.position.set(0, 10, 0);
box.castShadow = true;
box.receiveShadow = true;

// setup scene
const scene = new THREE.Scene();
scene.add(sun, ambient, plane, box);

// render function
function renderFrame() {
  requestAnimationFrame(() => {
    threejs.render(scene, camera);
    renderFrame();
  });
}
// call render function
renderFrame();