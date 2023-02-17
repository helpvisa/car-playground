// import our library dependencies
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.module.min.js';

// initialize Ammo, and call our main function
// our main function executor
Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  main();
});

// define our main function
function main() {
// define our classes
class RigidBody {
  constructor() {
  }

  createBox(mass, pos, rot, size) {
    this.transform = new Ammo.btTransform();
    this.transform.setIdentity();
    this.transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    this.transform.setRotation(new Ammo.btQuaternion(rot.x, rot.y, rot.z, rot.w));
    this.motionState = new Ammo.btDefaultMotionState(this.transform);

    const btSize = new Ammo.btVector3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this.shape = new Ammo.btBoxShape(btSize);
    this.shape.setMargin(0.05);

    this.inertia = new Ammo.btVector3(0, 0, 0);
    if (mass > 0) {
      this.shape.calculateLocalInertia(mass, this.inertia);
    }

    this.info = new Ammo.btRigidBodyConstructionInfo(
      mass, this.motionState, this.shape, this.inertia);
    this.body = new Ammo.btRigidBody(this.info);
  }
};

// register an event handler for keyboard input
const input = {
  accel: false,
  brake: false,
  left: false,
  right: false,
}
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case "w":
      input.accel = true;
      break;
    case "s":
      input.brake = true;
      break;
    case "a":
      input.left = true;
      break;
    case "d":
      input.right = true;
      break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.key) {
    case "w":
      input.accel = false;
      break;
    case "s":
      input.brake = false;
      break;
    case "a":
      input.left = false;
      break;
    case "d":
      input.right = false;
      break;
  }
});

// initialize ammo.js physics state before initializing our three.js scene
const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
const broadphase = new Ammo.btDbvtBroadphase();
const solver = new Ammo.btSequentialImpulseConstraintSolver();
const physicsWorld = new Ammo.btDiscreteDynamicsWorld(
  dispatcher, broadphase, solver, collisionConfiguration);
physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));

// construct our world scene and setup three.js
const threejs = new THREE.WebGLRenderer();
threejs.shadowMap.enabled = true;
threejs.shadowMap.type = THREE.PCFSoftShadowMap;
threejs.setPixelRatio(window.devicePixelRatio);
threejs.setSize(window.innerWidth * 0.6, window.innerHeight * 0.6);

document.body.appendChild(threejs.domElement);

// call resize function?

// setup our internal clock
const t = new THREE.Clock();

// setup camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 1000.0);
camera.position.set(0, 20, 30);
camera.rotation.set(-0.45, 0, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(100, 100, 100);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.bias = -0.004;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 1.0;
sun.shadow.camera.far = 500;
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
// setup ground rigidbody
const rbGround = new RigidBody();
rbGround.createBox(0, new THREE.Vector3(plane.position.x, plane.position.y - 1, plane.position.z), plane.quaternion, new THREE.Vector3(100, 100, 1));
rbGround.body.setRestitution(1.0);
physicsWorld.addRigidBody(rbGround.body);

const box = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 4),
  new THREE.MeshStandardMaterial({
    color: 0x808080
  }));
box.position.set(0, 30, 0);
box.rotation.set(-0.85, 0.85, 0);
box.castShadow = true;
box.receiveShadow = true;
// setup rigidbody for this box
const rbBox = new RigidBody();
rbBox.createBox(1, box.position, box.quaternion, new THREE.Vector3(4, 4, 4));
rbBox.body.setFriction(1);
rbBox.body.setRestitution(0.6);
physicsWorld.addRigidBody(rbBox.body);

// setup our rigidbodies list
const rigidBodies = [{mesh: box, rigidBody: rbBox}];

// setup scene
const scene = new THREE.Scene(); 
scene.add(sun, ambient, plane, box);
 
// setup step function (update function)
function step(delta) {
  physicsWorld.stepSimulation(delta, 10);

  for (let i = 0; i < rigidBodies.length; i++) {
    let tempTransform = new Ammo.btTransform();
    rigidBodies[i].rigidBody.motionState.getWorldTransform(tempTransform);
    const pos = tempTransform.getOrigin();
    const rot = tempTransform.getRotation();
    const pos3 = new THREE.Vector3(pos.x(), pos.y(), pos.z());
    const rot3 = new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());

    rigidBodies[i].mesh.position.copy(pos3);
    rigidBodies[i].mesh.quaternion.copy(rot3);
  }
}

// render function
function renderFrame() {
  requestAnimationFrame(() => {
    step(t.getDelta()); // call our update function
    threejs.render(scene, camera);
    renderFrame();
  });
}

// call our renderFrame function
renderFrame();
}