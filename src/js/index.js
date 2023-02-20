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
// load textures
// load our wheel texture
const texture = new THREE.TextureLoader().load("./src/textures/wheel_test_tex.jpg");
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(1, 1);
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

  getVelocityAtPoint(point) {
    let centerOfMass = this.getTransform().position;
    let lever = new THREE.Vector3(point.x, point.y, point.z);
    lever.sub(centerOfMass);
    let velocity = this.body.getLinearVelocity();
    velocity = new THREE.Vector3(velocity.x(), velocity.y(), velocity.z());
    let angularVelocity = this.body.getAngularVelocity();
    angularVelocity = new THREE.Vector3(angularVelocity.x(), angularVelocity.y(), angularVelocity.z());
    velocity.add(angularVelocity.cross(lever)); // this is our velocity at point of wheel
    return velocity;
  }

  // create the wheels for our vehicle
  createWheels(wheelArray = []) {
    let transform = this.getTransform();
    this.wheels = [];

    // create wheels based on array
    for (let i = 0; i < wheelArray.length; i++) {
      // setup geometry outside our wheel object so it is more easily referenced
      const springGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const accelGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const slipGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

      const wheel = {
        target: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        previousPosition: new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
        isGrounded: false,
        obj: new THREE.Object3D(),
        wheelRadius: wheelArray[i].wheelRadius,
        suspensionStrength: wheelArray[i].suspensionStrength,
        suspensionDamping: wheelArray[i].suspensionDamping,
        powered: wheelArray[i].powered,
        steering: wheelArray[i].steering,
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(wheelArray[i].wheelRadius, wheelArray[i].wheelRadius, 0.5),
          new THREE.MeshStandardMaterial({
          map: texture
        })),
        spin: 0,
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
        this.wheels[i].normal = intersects[0].face.normal;
      } else {
        this.wheels[i].target = position.sub(new THREE.Vector3(0, this.wheels[i].wheelRadius, 0));
        this.wheels[i].isGrounded = false;
        this.wheels[i].normal = new THREE.Vector3(0, 0, 0);
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
    // get transform
    let transform = this.getTransform();

    // iterate through each of our wheels and calculate their suspension forces
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].isGrounded) {
        // get local position for target
        let localTarget = new THREE.Vector3();
        localTarget = this.wheels[i].target.clone();
        localTarget.sub(transform.position);

        // convert his local position into something the physics engine can understand
        let btWheelPos = new Ammo.btVector3(localTarget.x, localTarget.y, localTarget.z);
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
        let velocity = this.getVelocityAtPoint(this.wheels[i].target);
        velocity.projectOnVector(new THREE.Vector3(0, 1, 0));

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
      } else if (this.drawDebug) { // clear suspension lines
        this.wheels[i].springPoints = [];
        this.wheels[i].springGeometry.setFromPoints(this.wheels[i].springPoints);
      }
    }
  }

  calcSteering() {
    // get our transform
    let transform = this.getTransform();

    for (let i = 0; i < this.wheels.length; i++) {
      // find directional vectors
      let wheelWorldQuat = new THREE.Quaternion(); // get the world instead of local quaternion
      this.wheels[i].obj.getWorldQuaternion(wheelWorldQuat); 
      let forwardDir = new THREE.Vector3(0, 0, 1);
      forwardDir.applyQuaternion(wheelWorldQuat); // get forward-facing vector
      forwardDir.y = 0; // negate y component (wheels don't add upward or downward acceleration force)
      let slipDir = new THREE.Vector3(1, 0, 0);
      slipDir.applyQuaternion(wheelWorldQuat); // get right-facing vector

      // manage shifting the wheel in the steering direction
      if (this.wheels[i].steering) {
        // first decide the steering direction
        let wheelTarget = new THREE.Euler(this.wheels[i].obj.rotation.x, 0, this.wheels[i].obj.rotation.z);
        let meshTarget = new THREE.Euler(this.wheels[i].mesh.rotation.x, 0, this.wheels[i].mesh.rotation.z)

        // default rest position (no angle)
        if (input.right) {
          wheelTarget.y -= 45 * Math.PI/180;
          meshTarget.y -= 45 * Math.PI/180;
        }
        if (input.left) {
          wheelTarget.y += 45 * Math.PI/180;
          meshTarget.y += 45 * Math.PI/180;
        }

        let targetQuatWheel = new THREE.Quaternion();
        let targetQuatMesh = new THREE.Quaternion();
        targetQuatWheel.setFromEuler(wheelTarget);
        targetQuatMesh.setFromEuler(meshTarget);

        // set wheel's rotation
        this.wheels[i].obj.quaternion.rotateTowards(targetQuatWheel, 2.5 * Math.PI/180);
        // and the rotation of the visual mesh to match
        // this.wheels[i].mesh.quaternion.rotateTowards(targetQuatMesh, 2.5 * Math.PI/180);
      }

      // apply a constant acceleration force and determine current wheel grip
      let acceleration = input.accel ? 1 : 0;
      acceleration *= 1000;
      let accelForce = new Ammo.btVector3(forwardDir.x * acceleration, forwardDir.y * acceleration, forwardDir.z * acceleration);
      let currentGrip = 0;

      // determine braking force
      let braking = input.brake ? 1 : 0;
      braking *= 1000;
      let velocity = this.getVelocityAtPoint(this.wheels[i].target);
      velocity.projectOnVector(forwardDir);
      let speed = velocity.length();
      if (speed != 0) {
        braking = braking / speed;
      }
      let brakingForce = new Ammo.btVector3(velocity.x * -braking, 0, velocity.z * -braking);

      // get local location of wheel target
      let localTarget = new THREE.Vector3();
      localTarget = this.wheels[i].target.clone();
      localTarget.sub(transform.position);

      // convert it into something the physics engine can understand
      let btWheelPos = new Ammo.btVector3(localTarget.x, localTarget.y, localTarget.z);

      if (this.wheels[i].isGrounded) {
        if (this.wheels[i].powered) {
          this.body.applyForce(accelForce, btWheelPos);
        }
        currentGrip = 1;
        this.wheels[i].spin = 0;
        this.body.applyForce(brakingForce, btWheelPos);
      } else if (!this.wheels[i].powered) {
        currentGrip = 1;
        accelForce = new Ammo.btVector3(0, 0, 0); // clear accelForce vector
      }

      // find distance traveled and rotate wheel accordingly
      let currentWheelPos = new THREE.Vector3();
      this.wheels[i].obj.getWorldPosition(currentWheelPos);
      let distanceTraveled = new THREE.Vector3(currentWheelPos.x, currentWheelPos.y, currentWheelPos.z);
      distanceTraveled.sub(this.wheels[i].previousPosition);
      distanceTraveled.projectOnVector(forwardDir);
      let dot = distanceTraveled.dot(forwardDir);
      if (dot > 0) {
        dot = 1;
      } else {
        dot = -1;
      }
      // set wheel spin to be equivalent to this force
      let engineSpin = new THREE.Vector3(accelForce.x(), accelForce.y(), accelForce.z());
      engineSpin.projectOnVector(forwardDir);
      this.wheels[i].spin *= 0.9;
      this.wheels[i].spin += (distanceTraveled.length() * dot) * currentGrip;
      this.wheels[i].spin += engineSpin.length() * (1 - currentGrip)
      this.wheels[i].mesh.rotateOnAxis(new THREE.Vector3(0, -1, 0), this.wheels[i].spin);

      // set old position to current position
      this.wheels[i].previousPosition = currentWheelPos;

      // setup drawing of debug lines
      if (this.drawDebug) {
        // get forward force and make a line w it to demonstrate acceleration
        let pos = this.wheels[i].target.clone();
        let accelForcePoint = new THREE.Vector3(accelForce.x(), accelForce.y(), accelForce.z());
        accelForcePoint.add(pos);
        accelForcePoint.add(new THREE.Vector3(brakingForce.x(), brakingForce.y(), brakingForce.z()));

        this.wheels[i].accelPoints = [pos, accelForcePoint];
        this.wheels[i].accelGeometry.setFromPoints(this.wheels[i].accelPoints);
      }
    }

    // store our current position as the previous position
    this.previousPosition = transform.position;
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
physicsWorld.setGravity(new Ammo.btVector3(0, -19.6, 0));

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
camera.position.set(100, 100, 0);
camera.rotation.y = 90 * Math.PI/180;
camera.lookAt(0, 0, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(150, 100, -80);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.bias = -0.001;
sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;
sun.shadow.camera.near = 1.0;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = 200;
sun.shadow.camera.right = -200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;

const ambient = new THREE.AmbientLight(0x606060);

// setup basic test meshes
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    map: texture
  }));
plane.castShadow = false;
plane.receiveShadow = true;
plane.rotation.x = -Math.PI / 2;
// setup ground rigidbody
const rbGround = new RigidBody();
rbGround.createBox(0, new THREE.Vector3(plane.position.x, plane.position.y - 1, plane.position.z), plane.quaternion, new THREE.Vector3(1000, 1000, 1));
rbGround.body.setRestitution(1.0);
physicsWorld.addRigidBody(rbGround.body);

// create our testing vehicle
const vehicleGroup = new THREE.Group();
const box = new THREE.Mesh(
  new THREE.BoxGeometry(6, 4, 14),
  new THREE.MeshStandardMaterial({
    color: 0x808080
  }));
box.castShadow = true;
box.receiveShadow = true;
vehicleGroup.add(box);
vehicleGroup.position.set(0, 20, 0);
// setup rigidbody for this box
const vehicleBox = new VehicleBody(vehicleGroup);
vehicleBox.createBox(100, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(6, 4, 14));
// create wheels by using an array of relative wheel positions
vehicleBox.createWheels([
  { pos: new THREE.Vector3(vehicleBox.size.x / 2 + 1, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 800, suspensionDamping: 120, wheelRadius: 2, powered: false, steering: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2 - 1, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 800, suspensionDamping: 120, wheelRadius: 2, powered: false, steering: true },
  { pos: new THREE.Vector3(vehicleBox.size.x / 2 + 1, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 800, suspensionDamping: 120, wheelRadius: 2, powered: true, steering: false },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2 - 1, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 800, suspensionDamping: 120, wheelRadius: 2, powered: true, steering: false }
]);
vehicleBox.body.setFriction(0.85); // car will stop moving if body touches anything
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