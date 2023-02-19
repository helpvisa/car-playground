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
  constructor(group) {
    // store our parent transform for reuse
    this.parent = group;

    // setup our raycaster for the wheels
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0;

    // setup debug line materials
    this.drawDebug = true;
    this.springMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
    this.springMat.depthTest = false;
    this.accelMat = new THREE.LineBasicMaterial({ color: 0x0000FF });
    this.accelMat.depthTest = false;
    this.slipMat = new THREE.LineBasicMaterial({ color: 0xFF0000 });
    this.slipMat.depthTest = false;
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

    // create wheels based on array
    for (let i = 0; i < wheelArray.length; i++) {
      // setup geometry outside our wheel object so it is more easily referenced
      const springGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const accelGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const slipGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

      const wheel = {
        target: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        isGrounded: false,
        obj: new THREE.Object3D(),
        wheelRadius: wheelArray[i].wheelRadius,
        suspensionStrength: wheelArray[i].suspensionStrength,
        suspensionDamping: wheelArray[i].suspensionDamping,
        powered: wheelArray[i].powered,
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(wheelArray[i].wheelRadius, wheelArray[i].wheelRadius, 0.5),
          new THREE.MeshStandardMaterial({
          map: texture
        })),
        // setup debug lines
        // setup geometry rendering
        springGeometry: springGeometry,
        springLine: new THREE.Line(springGeometry, this.springMat),
        accelGeometry: accelGeometry,
        accelLine: new THREE.Line(accelGeometry, this.accelMat),
        slipGeometry: accelGeometry,
        slipLine: new THREE.Line(slipGeometry, this.slipMat),
      }
      // add our debug renderers to the scene (always render above geometry)
      wheel.springLine.renderOrder = THREE.zindex || 999;
      wheel.accelLine.renderOrder = THREE.zindex || 999;
      wheel.slipLine.renderOrder = THREE.zindex || 999;
      scene.add(wheel.springLine);
      scene.add(wheel.accelLine);
      scene.add(wheel.slipLine);

      // assign position from the input array vector
      // this is a relative offset
      // directly setting position does not seem to work correctly; each axis must be updated individually
      wheel.obj.position.x = wheelArray[i].pos.x;
      wheel.obj.position.y = wheelArray[i].pos.y;
      wheel.obj.position.z = wheelArray[i].pos.z;

      // setup the meshes
      wheel.mesh.castShadow = true;
      wheel.mesh.rotation.z = 90 * Math.PI/180;
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
      position.add(new THREE.Vector3(0, this.wheels[i].wheelRadius, 0));
      // set max length for raycaster
      this.raycaster.far = this.wheels[i].wheelRadius * 2;
      // now cast the ray
      this.raycaster.set(position, direction); // down vector is relative to wheel
      const intersects = this.raycaster.intersectObject(plane); // intersect our plane
      if (intersects.length > 0) {
        this.wheels[i].target = intersects[0].point;
        this.wheels[i].target.y += this.wheels[i].wheelRadius;
        this.wheels[i].isGrounded = true;
      } else {
        this.wheels[i].target = position.sub(new THREE.Vector3(0, this.wheels[i].wheelRadius, 0));
        this.wheels[i].isGrounded = false;
      }

      // set visual mesh position
      scene.attach(this.wheels[i].mesh); // attach to scene, modify global transform
      // directly setting position does not seem to work correctly; each axis must be updated individually
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
        let springForce = offset.multiplyScalar(this.wheels[i].suspensionStrength);
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

        let dampingForce = velocity.multiplyScalar(-this.wheels[i].suspensionDamping); // invert damping force to negate suspension force
        dampingForce = new Ammo.btVector3(dampingForce.x, dampingForce.y, dampingForce.z);
        this.body.applyForce(dampingForce, btWheelPos);

        // setup drawing of debug lines
        if (this.drawDebug) {
          this.wheels[i].springPoints = [new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z)];
          let springDestination = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
          springDestination.add(new THREE.Vector3(springForce.x(), springForce.y(), springForce.z()).multiplyScalar(0.25)); // add spring force
          springDestination.add(new THREE.Vector3(dampingForce.x(), dampingForce.y(), dampingForce.z()).multiplyScalar(0.25)); // add damping force
          // add it to our line points
          this.wheels[i].springPoints.push(springDestination);
          // setup our geometry
          this.wheels[i].springGeometry.setFromPoints(this.wheels[i].springPoints);
        }
      }
    }
  }

  calcSteering() {
    for (let i = 0; i < this.wheels.length; i++) {
      // setup drawing of debug lines
      if (this.drawDebug) {
        // get forward direction and make a line w it to demonstrate acceleration
        let pos = new THREE.Vector3();
        this.wheels[i].mesh.getWorldPosition(pos)
        let dir = new THREE.Vector3(0, 0, 1);
        dir.applyQuaternion(this.wheels[i].obj.quaternion);
        dir.add(pos);

        this.wheels[i].accelPoints = [pos, dir];
        this.wheels[i].accelGeometry.setFromPoints(this.wheels[i].accelPoints);
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
camera.position.set(20, 25, 0);
camera.rotation.y = 90 * Math.PI/180;
camera.lookAt(0, 0, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(150, 100, -80);
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
  new THREE.BoxGeometry(6, 3, 10),
  new THREE.MeshStandardMaterial({
    color: 0x808080
  }));
box.castShadow = true;
box.receiveShadow = true;
vehicleGroup.add(box);
vehicleGroup.position.set(0, 8, 0);
// setup rigidbody for this box
const vehicleBox = new VehicleBody(vehicleGroup);
vehicleBox.createBox(10, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(6, 3, 10));
// create wheels by using an array of relative wheel positions
vehicleBox.createWheels([
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 2, vehicleBox.size.z / 2), suspensionStrength: 80, suspensionDamping: 12, wheelRadius: 1.5, powered: false },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 2, vehicleBox.size.z / 2), suspensionStrength: 80, suspensionDamping: 12, wheelRadius: 1.5, powered: false },
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 0.5, -vehicleBox.size.z / 2), suspensionStrength: 80, suspensionDamping: 12, wheelRadius: 1.5, powered: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 2 - 0.5, -vehicleBox.size.z / 2), suspensionStrength: 80, suspensionDamping: 12, wheelRadius: 1.5, powered: true }
]);
vehicleBox.body.setFriction(0);
vehicleBox.body.setRestitution(0);
vehicleBox.body.setActivationState(4); // prevent the rigidbody from sleeping
physicsWorld.addRigidBody(vehicleBox.body);
vehicleBox.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0)); // set an angular velocity for testing

// setup our rigidbodies list
const rigidBodies = [{mesh: vehicleGroup, rigidBody: vehicleBox}];

// add objects to scene
scene.add(sun, ambient, plane, vehicleGroup);
 
// setup step function (update function)
function step(delta) {
  // update our vehicle
  vehicleBox.updateWheels();
  vehicleBox.calcSteering();
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