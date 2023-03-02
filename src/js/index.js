// import our library dependencies
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import * as TONE from 'tone';

// import our custom classes / objects
import { RigidBody } from './classes/RigidBody.js';
import { VehicleBody } from './classes/Vehicle.js';

/***********************************************************************************/
// load textures
// load our wheel texture
const checker = new THREE.TextureLoader().load("./src/textures/wheel_test_tex.jpg");
checker.wrapS = THREE.RepeatWrapping;
checker.wrapT = THREE.RepeatWrapping;
checker.repeat.set(100, 100);

/*************************************************************************/
// initalize our model loader
const loader = new GLTFLoader();

// initialize cannon-es
const physicsWorld = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.8, 0),
  defaultContactMaterial: {
    friction: 0.9,
    restitution: 0
  }
});

// construct our world scene and setup three.js
const threejs = new THREE.WebGLRenderer({ antialias: true });
threejs.shadowMap.enabled = true;
threejs.shadowMap.type = THREE.PCFSoftShadowMap;
threejs.setPixelRatio(window.devicePixelRatio);
threejs.setSize(window.innerWidth * 0.6, window.innerHeight * 0.6);

// setup our internal clock
const t = new THREE.Clock();

// create a scene
const scene = new THREE.Scene();

// setup camera
let viewRatio = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(viewRatio * 20 / -2, viewRatio * 20 / 2, 20 / 2, 20 / -2, -1000, 1000);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);
// window resize function (resizes canvas)
window.addEventListener("resize", () => {
  viewRatio = window.innerWidth / window.innerHeight;
  camera.left = viewRatio * 20 / -2;
  camera.right = viewRatio * 20 / 2;
  camera.top = 20 / 2;
  camera.bottom = 20 / -2;
  camera.updateProjectionMatrix();
  threejs.setSize(window.innerWidth * 0.6, window.innerHeight * 0.6);
}, false);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(0, 10, 0);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.bias = 0;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
sun.shadow.camera.near = 1.0;
sun.shadow.camera.far = 200;
let shadowCamera = 20;
sun.shadow.camera.left = -shadowCamera;
sun.shadow.camera.right = shadowCamera;
sun.shadow.camera.top = shadowCamera;
sun.shadow.camera.bottom = -shadowCamera;
const ambient = new THREE.AmbientLight(0x606060);
// add the lights to our scene
scene.add(sun, sun.target, ambient);

// load our playground model
const playground = [];
loader.load('./src/models/environment/car-playground.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    // enable shadowcasting
    child.castShadow = true;
    child.receiveShadow = true;

    // create collisions
    if (child.geometry) {
      if (child.name.includes("Cube")) { // create box colliders for materials that can use them
        // get attributes from child
        const size = child.scale;
        const pos = child.position;
        const rot = child.quaternion;
        // create our cannon shape
        const cannonSize = new CANNON.Vec3(size.x, size.y, size.z);
        const shape = new CANNON.Box(cannonSize);
        const body = new CANNON.Body({ mass: 0, shape: shape });
        // transform the body
        body.position.set(pos.x, pos.y, pos.z);
        body.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        // add it to our world
        physicsWorld.addBody(body);
      } else {
        const geometry = child.geometry.clone();
        geometry.scale(child.scale.x, child.scale.y, child.scale.z);
        geometry.rotateX(child.rotation.x);
        geometry.rotateY(child.rotation.y);
        geometry.rotateZ(child.rotation.z);
        geometry.translate(child.position.x, child.position.y, child.position.z);
        const vertIndex = geometry.attributes.position.array;
        const faceIndex = geometry.index.array;
        // build an array of our vertices
        const vertices = [];
        for (let i = 0; i < vertIndex.length; i += 3) {
          let vertex = new CANNON.Vec3(vertIndex[i], vertIndex[i+1], vertIndex[i+2]);
          vertices.push(vertex);
        }
        // build an array of our faces
        const faces = [];
        for (let i = 0; i < faceIndex.length; i += 3) {
          let face = [faceIndex[i], faceIndex[i+1], faceIndex[i+2]];
          faces.push(face);
        }
        // build our shape and add it to the physics world
        const convexShape = new CANNON.ConvexPolyhedron({ vertices: vertices, faces: faces});
        const convexBody = new CANNON.Body({ mass: 0, shape: convexShape });
        physicsWorld.addBody(convexBody);
      }
    }

    // update material
    if (child.material) {
      const mat = new THREE.MeshStandardMaterial({
        map: checker,
      });
      child.material = mat;
    }
    playground.push(child);
  });

  scene.add(gltf.scene);
}, undefined, (err) => { console.log(err) });

// create our testing vehicle
let centerOfGravity = new THREE.Vector3(0, 0.55, 0);
const vehicleGroup = new THREE.Group();
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1.65, 1.23, 4.1),
  new THREE.MeshStandardMaterial({
    color: 0x408080
  }));
box.position.copy(centerOfGravity); // acount for offset
box.castShadow = true;
box.receiveShadow = true;
// add box or model to vehicle parent
vehicleGroup.add(box);
scene.add(vehicleGroup);
vehicleGroup.position.set(0, 1, 0);
// setup rigidbody for this box, with an input object to pass in user inputs
const input = {
  accel: false,
  shiftDown: false,
  shiftUp: false,
  brake: false,
  left: false,
  right: false,
}
const vehicle = new VehicleBody(vehicleGroup, input, playground, scene);
vehicle.createBox(1400, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(1.65, 1.23, 4.1), centerOfGravity);
// create wheels by using an array of relative wheel positions
vehicle.createWheels([
  { pos: new THREE.Vector3(vehicle.size.x / 2, -vehicle.size.y / 1.3, vehicle.size.z / 3), suspensionStrength: 24000, suspensionDamping: 900, wheelRadius: 0.33, powered: true, steering: true, brakes: true },
  { pos: new THREE.Vector3(-vehicle.size.x / 2, -vehicle.size.y / 1.3, vehicle.size.z / 3), suspensionStrength: 24000, suspensionDamping: 900, wheelRadius: 0.33, powered: true, steering: true, brakes: true },
  { pos: new THREE.Vector3(vehicle.size.x / 2, -vehicle.size.y / 1.3, -vehicle.size.z / 3), suspensionStrength: 24000, suspensionDamping: 900, wheelRadius: 0.33, powered: false, steering: false, brakes: true },
  { pos: new THREE.Vector3(-vehicle.size.x / 2, -vehicle.size.y / 1.3, -vehicle.size.z / 3), suspensionStrength: 24000, suspensionDamping: 900, wheelRadius: 0.33, powered: false, steering: false, brakes: true }
]);
physicsWorld.addBody(vehicle.body);

// setup our rigidbodies list
const rigidBodies = [{ mesh: vehicleGroup, rigidBody: vehicle }];

// setup cannon debugger
const cannonDebugger = new CannonDebugger(scene, physicsWorld);

// setup step function (update function)
function step(delta) {
  // step our physics simulation
  physicsWorld.fixedStep(1 / 120, 10);
  cannonDebugger.update();

  // update our vehicle
  vehicle.updateVehicle(delta);

  // make meshes match physics world
  for (let i = 0; i < rigidBodies.length; i++) {
    rigidBodies[i].mesh.position.copy(rigidBodies[i].rigidBody.body.position);
    rigidBodies[i].mesh.quaternion.copy(rigidBodies[i].rigidBody.body.quaternion);
  }

  // update camera to follow vehicle
  camera.position.set(vehicleGroup.position.x + 10, vehicleGroup.position.y + 10, vehicleGroup.position.z + 10);
  // update directional light
  sun.position.set(vehicleGroup.position.x, vehicleGroup.position.y + 5, vehicleGroup.position.z);
  sun.target.position.set(vehicleGroup.position.x, vehicleGroup.position.y, vehicleGroup.position.z)
}

// render function
let shouldStep = true;
function renderFrame() {
  let delta = t.getDelta();
  if (delta > 0.05) {
    delta = 0;
    console.log('framerate too low; resetting delta time');
  }

  if (shouldStep) {
    step(delta); // call our update function
  }
  threejs.render(scene, camera);

  requestAnimationFrame(renderFrame);
}

// create a div to hold the canvas
let canvasDiv = document.createElement("div");
canvasDiv.id = "canvas-body";
// add our three.js element
canvasDiv.appendChild(threejs.domElement);
// add our controls
let controlDiv = document.createElement("div");
controlDiv.id = "controls";
let movementDiv = document.createElement("div");
let steerDiv = document.createElement("div");
let shiftDiv = document.createElement("div");

let accEl = document.createElement("button");
accEl.textContent = "accel";
accEl.className = "accelerator";
let brakEl = document.createElement("button");
brakEl.textContent = "brk";
brakEl.className = "brakes";
let shiftDownEl = document.createElement("button");
shiftDownEl.textContent = "dwn";
let shiftUpEl = document.createElement("button");
shiftUpEl.textContent = "up";
let steerLEl = document.createElement("button");
steerLEl.textContent = "left";
steerLEl.className = "steering";
let steerREl = document.createElement("button");
steerREl.textContent = "right";
steerREl.className = "steering"
movementDiv.append(accEl, brakEl);
steerDiv.append(steerLEl, steerREl);
shiftDiv.append(shiftDownEl, shiftUpEl);
controlDiv.append(movementDiv, shiftDiv, steerDiv);

// add toggles
let toggleDebugEl = document.createElement("button");
let toggleWheelsEl = document.createElement("button");
toggleDebugEl.textContent = "toggle debug lines";
toggleWheelsEl.textContent = "toggle wheel drawing";
toggleDebugEl.className = "toggle";
toggleWheelsEl.className = "toggle";
// add functionality to toggles
toggleDebugEl.addEventListener("click", () => {
  vehicle.toggleDebug();
});
toggleWheelsEl.addEventListener("click", () => {
  vehicle.toggleWheelVisibility();
});

canvasDiv.appendChild(controlDiv);
// capture our game div
document.getElementById('game-div').append(toggleDebugEl, toggleWheelsEl);
// add the canvas body to the page
document.getElementById('game-div').appendChild(canvasDiv);

// register an event handler for keyboard input
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case "w":
      input.accel = true;
      break;
    case "j":
      input.shiftDown = true;
      break;
    case "k":
      input.shiftUp = true;
      break;
    case "a":
      input.left = true;
      break;
    case "d":
      input.right = true;
      break;
    case " ":
      e.preventDefault();
      input.brake = true;
      break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.key) {
    case "w":
      input.accel = false;
      break;
    case "j":
      input.shiftDown = false;
      break;
    case "k":
      input.shiftUp = false;
      break;
    case "a":
      input.left = false;
      break;
    case "d":
      input.right = false;
      break;
    case " ":
      input.brake = false;
      break;
  }
});
///////////////
// now register for touch controls and button presses
accEl.addEventListener("touchstart", () => {
  input.accel = true;
});
shiftDownEl.addEventListener("touchstart", () => {
  input.shiftDown = true;
});
shiftUpEl.addEventListener("touchstart", () => {
  input.shiftUp = true;
});
brakEl.addEventListener("touchstart", () => {
  input.brake = true;
});
steerLEl.addEventListener("touchstart", () => {
  input.left = true;
});
steerREl.addEventListener("touchstart", () => {
  input.right = true;
});
/////////////////
accEl.addEventListener("mousedown", () => {
  input.accel = true;
});
shiftDownEl.addEventListener("mousedown", () => {
  input.shiftDown = true;
});
shiftUpEl.addEventListener("mousedown", () => {
  input.shiftUp = true;
});
brakEl.addEventListener("mousedown", () => {
  input.brake = true;
});
steerLEl.addEventListener("mousedown", () => {
  input.left = true;
});
steerREl.addEventListener("mousedown", () => {
  input.right = true;
});
//////////
/* now unregister touches and clicks too */
/////////
accEl.addEventListener("touchend", () => {
  input.accel = false;
});
shiftDownEl.addEventListener("touchend", () => {
  input.shiftDown = false;
});
shiftUpEl.addEventListener("touchend", () => {
  input.shiftUp = false;
});
brakEl.addEventListener("touchend", () => {
  input.brake = false;
});
steerLEl.addEventListener("touchend", () => {
  input.left = false;
});
steerREl.addEventListener("touchend", () => {
  input.right = false;
});
//////////////////////
accEl.addEventListener("mouseup", () => {
  input.accel = false;
});
shiftDownEl.addEventListener("mouseup", () => {
  input.shiftDown = false;
});
shiftUpEl.addEventListener("mouseup", () => {
  input.shiftUp = false;
});
brakEl.addEventListener("mouseup", () => {
  input.brake = false;
});
steerLEl.addEventListener("mouseup", () => {
  input.left = false;
});
steerREl.addEventListener("mouseup", () => {
  input.right = false;
});
///////////
// now disable context clicking to avoid popups
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  return false;
});

// listen for a user event to trigger audio
let audioStarted = false;
document.addEventListener('click', async () => {
  if (!audioStarted) {
    await TONE.start();
    vehicle.createAudio();
    audioStarted = true;
  } else {
    vehicle.startAudio();
  }
});

// mute audio when window not in focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    shouldStep = true;
    vehicle.startAudio();
  } else {
    shouldStep = false;
    vehicle.stopAudio();
  }
});

// finally, call our renderFrame function and start the app
renderFrame();