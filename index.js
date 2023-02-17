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
// basic 3D box rigidbody
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
// vehicle rigidbody
class VehicleBody {
  constructor() {
    this.wheelRadius = 1.5;
    this.suspensionStrength = 50;
    this.suspensionDamping = 12;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0;
    this.raycaster.far = this.wheelRadius * 2;
  }

  // create our ammo.js box collider
  createBox(mass, pos, rot, size) {
    this.transform = new Ammo.btTransform();
    this.transform.setIdentity();
    this.transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    this.transform.setRotation(new Ammo.btQuaternion(rot.x, rot.y, rot.z, rot.w));
    this.motionState = new Ammo.btDefaultMotionState(this.transform);

    this.size = size;
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

  // get transform position
  getTransform() {
    let tempTransform = new Ammo.btTransform();
    this.motionState.getWorldTransform(tempTransform);
    const pos = tempTransform.getOrigin();
    const rot = tempTransform.getRotation();

    return {
      position: new THREE.Vector3(pos.x(), pos.y(), pos.z()),
      rotation: new THREE.Vector3(rot.x(), rot.y(), rot.z()),
      root: tempTransform
    }
  }

  // create the wheels for our vehicle
  createWheels() {
    let transform = this.getTransform();
    this.wheels = [];

    // create 4 wheels
    for (let i = 0; i < 4; i++) {
      const wheel = {
        position: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        target: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        type: i,
        isGrounded: false,
        debugMesh: new THREE.Mesh(
          new THREE.SphereGeometry(this.wheelRadius),
          new THREE.MeshStandardMaterial({
            color: 0x202020
          }))
      }
      wheel.position.y -= this.size.y / 2;
      wheel.position.y -= 1;

      switch (i) {
        case 0:
          wheel.position.x += this.size.x / 2;
          wheel.position.z += this.size.z / 2;
          break;
        case 1:
          wheel.position.x -= this.size.x / 2;
          wheel.position.z += this.size.z / 2;
          break;
        case 2:
          wheel.position.x += this.size.x / 2;
          wheel.position.z -= this.size.z / 2;
          break;
        case 3:
          wheel.position.x -= this.size.x / 2;
          wheel.position.z -= this.size.z / 2;
          break;
      }
      
      // rotate our wheel about the center point
      // wheel.position.applyQuaternion(transform.rotation);
      wheel.debugMesh.position.x = wheel.position.x;
      wheel.debugMesh.position.y = wheel.position.y;
      wheel.debugMesh.position.z = wheel.position.z;
      wheel.debugMesh.castShadow = true;
      this.wheels.push(wheel);

      // add the debug mesh to the scene
      scene.add(wheel.debugMesh);
    }
  }

  // update the position of the wheels
  updateWheels() {
    let transform = this.getTransform();

    for (let i = 0; i < this.wheels.length; i++) {
      // update the wheel position on chassis
      this.wheels[i].position = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z);
      this.wheels[i].position.y -= this.size.y / 2;
      this.wheels[i].position.y -= 1;

      switch (i) {
        case 0:
          this.wheels[i].position.x += this.size.x / 2;
          this.wheels[i].position.z += this.size.z / 2;
          break;
        case 1:
          this.wheels[i].position.x -= this.size.x / 2;
          this.wheels[i].position.z += this.size.z / 2;
          break;
        case 2:
          this.wheels[i].position.x += this.size.x / 2;
          this.wheels[i].position.z -= this.size.z / 2;
          break;
        case 3:
          this.wheels[i].position.x -= this.size.x / 2;
          this.wheels[i].position.z -= this.size.z / 2;
          break;
      }
    
      // apply rotation
      // this.wheels[i].position.applyQuaternion(transform.rotation);
      this.wheels[i].debugMesh.position.x = this.wheels[i].target.x;
      this.wheels[i].debugMesh.position.y = this.wheels[i].target.y;
      this.wheels[i].debugMesh.position.z = this.wheels[i].target.z;

      // cast a ray to see if the wheel is touching the ground
      let tempWheelPos = new THREE.Vector3(this.wheels[i].position.x, this.wheels[i].position.y, this.wheels[i].position.z);
      tempWheelPos.add(new THREE.Vector3(0, this.wheelRadius, 0));
      this.raycaster.set(tempWheelPos, new THREE.Vector3(0, -1, 0));
      const intersects = this.raycaster.intersectObject(plane); // intersect our plane
      if (intersects.length > 0) {
        this.wheels[i].target = intersects[0].point;
        this.wheels[i].target.y += this.wheelRadius;
        this.wheels[i].isGrounded = true;
      } else {
        this.wheels[i].target = this.wheels[i].position;
        this.wheels[i].isGrounded = false;
      }
    }
  }

  // spring force calculator for a wheel
  calcSuspension() {
    // iterate through each of our wheels and calculate their suspension forces
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].isGrounded) {
        let btWheelPos = new Ammo.btVector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);

        let offset = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        offset.sub(this.wheels[i].position);

        // calculate a spring force and apply it
        let springForce = offset.multiplyScalar(this.suspensionStrength);
        springForce = new Ammo.btVector3(springForce.x, springForce.y, springForce.z);
        this.body.applyForce(springForce, btWheelPos);

        // calculate a damping force and apply it
        let velocity = this.body.getLinearVelocity();
        velocity = new THREE.Vector3(velocity.x(), velocity.y(), velocity.z()); 
        let dampingForce = velocity.multiplyScalar(-this.suspensionDamping);
        dampingForce = new Ammo.btVector3(dampingForce.x, dampingForce.y, dampingForce.z);
        this.body.applyForce(dampingForce, btWheelPos);
      }
    }
  }
}

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

// create a scene
const scene = new THREE.Scene(); 

// setup camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 1000.0);
camera.position.set(0, 20, 30);
camera.rotation.set(-0.45, 0, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(0, 100, 60);
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
box.position.set(0, 15, 0);
box.rotation.set(0, 0, 0);
box.castShadow = true;
box.receiveShadow = true;
// setup rigidbody for this box
const vehicleBox = new VehicleBody();
vehicleBox.createBox(10, box.position, box.quaternion, new THREE.Vector3(4, 4, 4));
vehicleBox.createWheels();
vehicleBox.body.setFriction(0);
vehicleBox.body.setRestitution(0);
physicsWorld.addRigidBody(vehicleBox.body);

// setup our rigidbodies list
const rigidBodies = [{mesh: box, rigidBody: vehicleBox}];

// add objects to scene
scene.add(sun, ambient, plane, box);
 
// setup step function (update function)
function step(delta) {
  // update our vehicle
  vehicleBox.updateWheels();
  vehicleBox.calcSuspension();

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