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
  constructor(group, wheelRadius, suspensionStrength, suspensionDamping) {
    this.parent = group;

    this.wheelRadius = wheelRadius;
    this.suspensionStrength = suspensionStrength;
    this.suspensionDamping = suspensionDamping;

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
  createWheels(wheelArray = []) {
    let transform = this.getTransform();
    this.wheels = [];
    // load our wheel texture
    const texture = new THREE.TextureLoader().load("./src/textures/wheel_test_tex.jpg");
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);

    // create 4 wheels
    for (let i = 0; i < wheelArray.length; i++) {
      const wheel = {
        target: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        type: i,
        isGrounded: false,
        obj: new THREE.Object3D(),
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.5),
          new THREE.MeshStandardMaterial({
          map: texture
        })),
      }

      // assign position from the input array vector
      wheel.obj.position.x = wheelArray[i].x;
      wheel.obj.position.y = wheelArray[i].y;
      wheel.obj.position.z = wheelArray[i].z;

      // setup the meshes
      wheel.mesh.castShadow = true;
      wheel.mesh.rotation.x = 90 * Math.PI/180;
      // add the mesh to the parent group
      this.parent.add(wheel.obj);
      this.parent.add(wheel.mesh);
      this.wheels.push(wheel);
    }
  }

  // update the position of the wheels
  updateWheels() {
    for (let i = 0; i < this.wheels.length; i++) {
      let position = new THREE.Vector3();
      let direction = new THREE.Vector3(0, -1, 0);

      this.wheels[i].obj.getWorldPosition(position);
      direction.applyQuaternion(this.wheels[i].obj.quaternion); // get down vector of wheel

      // cast a ray to see if the wheel is touching the ground
      position.add(new THREE.Vector3(0, this.wheelRadius, 0));
      this.raycaster.set(position, direction); // down vector is relative to wheel
      const intersects = this.raycaster.intersectObject(plane); // intersect our plane
      if (intersects.length > 0) {
        this.wheels[i].target = intersects[0].point;
        this.wheels[i].target.y += this.wheelRadius;
        this.wheels[i].isGrounded = true;
      } else {
        this.wheels[i].target = position.sub(new THREE.Vector3(0, this.wheelRadius, 0));
        this.wheels[i].isGrounded = false;
      }

      // set visual mesh position
      scene.attach(this.wheels[i].mesh); // attach to scene, modify global transform
      this.wheels[i].mesh.position.x = this.wheels[i].target.x;
      this.wheels[i].mesh.position.y = this.wheels[i].target.y;
      this.wheels[i].mesh.position.z = this.wheels[i].target.z;
      this.parent.attach(this.wheels[i].mesh); // reattach to parent group for rotation
    }
  }

  // spring force calculator for a wheel
  calcSuspension() {
    // iterate through each of our wheels and calculate their suspension forces
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].isGrounded) {
        let btWheelPos = new Ammo.btVector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        let wheelWorldPos = new THREE.Vector3();
        this.wheels[i].obj.getWorldPosition(wheelWorldPos);

        let offset = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        offset.sub(wheelWorldPos);

        // calculate a spring force and apply it
        let springForce = offset.multiplyScalar(this.suspensionStrength);
        springForce = new Ammo.btVector3(springForce.x, springForce.y, springForce.z);
        this.body.applyForce(springForce, btWheelPos);

        // calculate a damping force and apply it
        // calculate the velocity at the point of our wheel
        let centerOfMass = this.getTransform().position;
        let lever = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        lever.sub(centerOfMass);
        let velocity = this.body.getLinearVelocity();
        velocity = new THREE.Vector3(velocity.x(), velocity.y(), velocity.z());
        let angularVelocity = this.body.getAngularVelocity();
        angularVelocity = new THREE.Vector3(angularVelocity.x(), angularVelocity.y(), angularVelocity.z());
        velocity.add(angularVelocity.cross(lever)); // this is our velocity at point of wheel

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

// create our testing vehicle
const vehicleGroup = new THREE.Group();
const box = new THREE.Mesh(
  new THREE.BoxGeometry(10, 3, 6),
  new THREE.MeshStandardMaterial({
    color: 0x808080
  }));
box.castShadow = true;
box.receiveShadow = true;
vehicleGroup.add(box);
vehicleGroup.position.set(0, 30, 0);
// setup rigidbody for this box
const vehicleBox = new VehicleBody(vehicleGroup, 1.5, 110, 12);
vehicleBox.createBox(10, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(10, 3, 6));
// create wheels by using an array of relative wheel positions
vehicleBox.createWheels([
  new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 1, vehicleBox.size.z / 2),
  new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 1, vehicleBox.size.z / 2),
  new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 1, -vehicleBox.size.z / 2),
  new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 1, -vehicleBox.size.z / 2)
]);
vehicleBox.body.setFriction(0);
vehicleBox.body.setRestitution(0);
vehicleBox.body.setActivationState(4); // prevent the rigidbody from sleeping
physicsWorld.addRigidBody(vehicleBox.body);
vehicleBox.body.setAngularVelocity(new Ammo.btVector3(0.5, 1, 0));

// setup our rigidbodies list
const rigidBodies = [{mesh: vehicleGroup, rigidBody: vehicleBox}];

// add objects to scene
scene.add(sun, ambient, plane, vehicleGroup);
 
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