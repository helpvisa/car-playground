// import our library dependencies
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.module.min.js';

// initialize Ammo, and call our main function
// our main function executor
Ammo().then(function(AmmoLib) {
  Ammo = AmmoLib;
  main();
});

/***********************************************************************************/
// define our main function
function main() {
// load textures
// load our wheel texture
const checker = new THREE.TextureLoader().load("./src/textures/wheel_test_tex.jpg");
checker.wrapS = THREE.RepeatWrapping;
checker.wrapT = THREE.RepeatWrapping;
checker.repeat.set(100, 100);

// set up a temp ammo vector
const tempTrans0 = new Ammo.btTransform();

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
    // store a center of gravity offset
    this.centerOfGravity = new THREE.Vector3(0, 0, 0);

    // setup our raycaster for the wheels
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0;

    // setup engine
    this.maxSpeed = 200 / 3.6; // in meters per second, at a gear ratio of 1.0
    this.currentGear = 1;
    this.gearRatio = 2.66; // current gear ratio; set to constant for testing
    this.finalDrive = 3.42; // differential drive
    this.transmissionLoss = 0.7; // transmission efficiency
    this.currentSpeed = 0;
    this.brakingPower = 5000;
    this.throttle = 0;
    this.brake = 0;
    this.appliedTorque = 0;

    // setup debug line materials
    this.drawDebug = true;
    this.springMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
    this.springMat.depthTest = false;
    this.accelMat = new THREE.LineBasicMaterial({ color: 0x0000FF });
    this.accelMat.depthTest = false;
    this.slipMat = new THREE.LineBasicMaterial({ color: 0xFF0000 });
    this.slipMat.depthTest = false;
    
    // setup reusable ammo vectors
    this.btVec0 = new Ammo.btVector3(0, 0, 0);
    this.btVec1 = new Ammo.btVector3(0, 0, 0);
    this.btVec2 = new Ammo.btVector3(0, 0, 0);
    this.btVec3 = new Ammo.btVector3(0, 0, 0);
    this.btVec4 = new Ammo.btVector3(0, 0, 0);
  }

  // create our ammo.js box collider
  createBox(mass, pos, rot, size, com) {
    // save mass within object
    this.mass = mass;
    this.centerOfGravity = com;

    let localTransform = new Ammo.btTransform();
    let compoundShape = new Ammo.btCompoundShape();
    localTransform.setIdentity();
    localTransform.setOrigin(new Ammo.btVector3(com.x, com.y, com.z));

    this.transform = new Ammo.btTransform();
    this.transform.setIdentity();
    this.transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    this.transform.setRotation(new Ammo.btQuaternion(rot.x, rot.y, rot.z, rot.w));
    this.motionState = new Ammo.btDefaultMotionState(this.transform);

    this.size = size;
    const btSize = new Ammo.btVector3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this.shape = new Ammo.btBoxShape(btSize);
    this.shape.setMargin(0.05);

    // add both to compound shape
    compoundShape.addChildShape(localTransform, this.shape);

    this.inertia = new Ammo.btVector3(0, 0, 0);
    if (mass > 0) {
      compoundShape.calculateLocalInertia(mass, this.inertia);
    }

    this.info = new Ammo.btRigidBodyConstructionInfo(
      mass, this.motionState, compoundShape, this.inertia);
    this.body = new Ammo.btRigidBody(this.info);
  }

  // get transform position
  getTransform() {
    let tempTransform = tempTrans0;
    this.motionState.getWorldTransform(tempTransform);
    const pos = tempTransform.getOrigin();
    const rot = tempTransform.getRotation();

    return {
      position: new THREE.Vector3(pos.x(), pos.y(), pos.z()),
      rotation: new THREE.Vector3(rot.x(), rot.y(), rot.z()),
      root: tempTransform
    }
  }

  // toggle visible wheels
  toggleWheelVisibility() {
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].mesh.visible = !this.wheels[i].mesh.visible;
    }
  }

  // toggle debug lines
  toggleDebug() {
    this.drawDebug = !this.drawDebug;
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
        previousVelocity: new THREE.Vector3(0, 0, 0),
        previousForwardVelocity: new THREE.Vector3(0, 0, 0),
        forwardDir: new THREE.Vector3(0, 0, 1),
        isGrounded: false,
        obj: new THREE.Object3D(),
        wheelRadius: wheelArray[i].wheelRadius,
        suspensionStrength: wheelArray[i].suspensionStrength,
        suspensionDamping: wheelArray[i].suspensionDamping,
        powered: wheelArray[i].powered,
        steering: wheelArray[i].steering,
        brakes: wheelArray[i].brakes,
        currentRPM: 0,
        slip: 1, // wheel slip percentage
        grip: 1, // grip percentage
        suspensionForceAtWheel: 1, // suspension force applied to this wheel
        weightAtWheel: 1, // amount of weight applied to this wheel
        maxDriveForce: this.mass * 9.8,
        currentDrive: 0,
        tractionTorque: 0,
        brakingTorque: 0,
        angularAcceleration: 0,
        angularVelocity: 0,
        mesh: new THREE.Mesh(
          new THREE.CylinderGeometry(wheelArray[i].wheelRadius, wheelArray[i].wheelRadius, 0.225),
          new THREE.MeshStandardMaterial({
          color: 0x404040
        })),
        // setup debug lines
        // setup geometry rendering
        springGeometry: springGeometry,
        springLine: new THREE.Line(springGeometry, this.springMat),
        accelGeometry: accelGeometry,
        accelLine: new THREE.Line(accelGeometry, this.accelMat),
        slipGeometry: slipGeometry,
        slipLine: new THREE.Line(slipGeometry, this.slipMat),
      }

      // add wheels to our virtual drivetrain
      if (wheelArray[i].powered) {
        this.numPoweredWheels += 1;
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
      wheel.obj.position.x = wheelArray[i].pos.x + this.centerOfGravity.x;
      wheel.obj.position.y = wheelArray[i].pos.y + this.centerOfGravity.y;
      wheel.obj.position.z = wheelArray[i].pos.z + this.centerOfGravity.z;

      // setup the meshes
      wheel.mesh.castShadow = true;
      wheel.mesh.rotation.z = 90 * Math.PI/180;
      // add the mesh to the parent group
      this.parent.add(wheel.obj);
      this.parent.add(wheel.mesh);
      this.wheels.push(wheel);
    }
  }

  // determine RPM of engine based on user input
  updateEngine(delta) {
    // get input to drive engine
    if (input.accel) {
      this.throttle += 1 * delta;
    } else {
      this.throttle = 0;
    }
    this.throttle = Math.max(0, Math.min(1, this.throttle));

    if (input.brake) {
      this.brake = 1;
    } else {
      this.brake = 0;
    }

    // get our velocity as a percentage of the vehicle's max to check our torque curve
    let speed = this.body.getLinearVelocity();
    speed = new THREE.Vector3(speed.x(), speed.y(), speed.z()).length();
    this.currentSpeed = speed;

    // look up torque curve
    this.appliedTorque = torqueCurve.getValueAtPos(speed / this.maxSpeed * this.gearRatio) * this.throttle;
  }

  // update the position of the wheels
  updateWheels(delta) {
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
      const intersects = this.raycaster.intersectObjects([plane]); // intersect our plane
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

      // compute debug bounding spheres
      if (this.drawDebug) {
        this.wheels[i].springGeometry.computeBoundingSphere();
        this.wheels[i].accelGeometry.computeBoundingSphere();
        this.wheels[i].slipGeometry.computeBoundingSphere();
      }
    }
  }

  // spring force calculator for a wheel
  calcSuspension() {
    // get transform
    let transform = this.getTransform();

    // iterate through each of our wheels and calculate their suspension forces
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].isGrounded) {
        // cumulative force
        let totalAppliedForce = this.btVec1;
        // get local position for target
        let localTarget = new THREE.Vector3();
        localTarget = this.wheels[i].target.clone();
        localTarget.sub(transform.position);

        // convert his local position into something the physics engine can understand
        let btWheelPos = this.btVec0;
        btWheelPos.setValue(localTarget.x, localTarget.y, localTarget.z);
        let wheelWorldPos = new THREE.Vector3();
        this.wheels[i].obj.getWorldPosition(wheelWorldPos);

        let offset = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        offset.sub(wheelWorldPos);

        // calculate a spring force and apply it
        let springForce = offset.multiplyScalar(this.wheels[i].suspensionStrength);
        // this.body.applyForce(springForce, btWheelPos);

        // calculate a damping force and apply it
        // calculate the velocity at the point of our wheel
        let velocity = this.getVelocityAtPoint(this.wheels[i].target);
        velocity.projectOnVector(new THREE.Vector3(0, 1, 0));
        // use it to calc our spring damping force
        let dampingForce = velocity.multiplyScalar(-this.wheels[i].suspensionDamping); // invert damping force to negate suspension force
        
        // cumuluative suspension force
        let cumulativeForce = springForce.clone();
        cumulativeForce.add(dampingForce);
        this.wheels[i].suspensionForceAtWheel = cumulativeForce.length();
        // apply total force to wheel
        totalAppliedForce.setValue(cumulativeForce.x, cumulativeForce.y, cumulativeForce.z);
        this.body.applyForce(totalAppliedForce, btWheelPos);

        // setup drawing of debug lines
        if (this.drawDebug) {
          this.wheels[i].springPoints = [new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z)];
          let destination = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
          destination.add(cumulativeForce.multiplyScalar(1 / this.mass));
          // add it to our line points
          this.wheels[i].springPoints.push(destination);
          // setup our geometry
          this.wheels[i].springGeometry.setFromPoints(this.wheels[i].springPoints);
        } else {
          this.wheels[i].springPoints = [];
          this.wheels[i].springGeometry.setFromPoints(this.wheels[i].springPoints);
        }
      } else { // clear suspension lines
        this.wheels[i].springPoints = [];
        this.wheels[i].springGeometry.setFromPoints(this.wheels[i].springPoints);
      }
    }
  }

  // use suspension forces to calculate weight transfer at wheel
  calcWeightTransfer() {
    let totalForce = 0;
    for (let i = 0; i < this.wheels.length; i++) {
      totalForce += this.wheels[i].suspensionForceAtWheel;
    }
    // console.log('total force:', totalForce);

    // iterate through wheels and apply weight as percentage of force applied
    for (let i = 0; i < this.wheels.length; i++) {
      let percentage = this.wheels[i].suspensionForceAtWheel / totalForce;
      this.wheels[i].weightAtWheel = this.mass * percentage;
      this.wheels[i].maxDriveForce = this.wheels[i].weightAtWheel * 9.8
      // console.log('wheel', i, "drive:", this.wheels[i].maxDriveForce);
      // console.log('wheel', i, "sus:", this.wheels[i].suspensionForceAtWheel);
    }
  }

  // determine accelerating / steering forces
  calcSteering(delta) {
    // get our transform
    let transform = this.getTransform();

    for (let i = 0; i < this.wheels.length; i++) {
      // find directional vectors
      let wheelWorldQuat = new THREE.Quaternion(); // get the world instead of local quaternion
      this.wheels[i].obj.getWorldQuaternion(wheelWorldQuat); 
      let forwardDir = new THREE.Vector3(0, 0, 1);
      forwardDir.applyQuaternion(wheelWorldQuat); // get forward-facing vector
      forwardDir.projectOnPlane(new THREE.Vector3(0, 1, 0));
      this.wheels[i].forwardDir = forwardDir;
      let slipDir = new THREE.Vector3(1, 0, 0);
      slipDir.applyQuaternion(wheelWorldQuat); // get right-facing vector

      // manage shifting the wheel in the steering direction
      if (this.wheels[i].steering) {
        // first decide the steering direction
        let wheelTarget = new THREE.Euler(this.wheels[i].obj.rotation.x, 0, this.wheels[i].obj.rotation.z);
        let meshTarget = new THREE.Euler(this.wheels[i].mesh.rotation.x, 0, this.wheels[i].mesh.rotation.z)

        // default rest position (no angle)
        if (input.right) {
          wheelTarget.y -= 15 * Math.PI/180;
          meshTarget.y -= 15 * Math.PI/180;
        }
        if (input.left) {
          wheelTarget.y += 15 * Math.PI/180;
          meshTarget.y += 15 * Math.PI/180;
        }

        let targetQuatWheel = new THREE.Quaternion();
        let targetQuatMesh = new THREE.Quaternion();
        targetQuatWheel.setFromEuler(wheelTarget);
        targetQuatMesh.setFromEuler(meshTarget);

        // set wheel's rotation
        this.wheels[i].obj.quaternion.rotateTowards(targetQuatWheel, 0.5 * Math.PI/180);
        this.wheels[i].mesh.quaternion.rotateTowards(targetQuatMesh, 0.5 * Math.PI/180);
      }

      // get velocity
      let velocity = this.getVelocityAtPoint(this.wheels[i].target);
      velocity.projectOnPlane(new THREE.Vector3(0, 1, 0));
      let forwardVelocity = velocity.clone().projectOnVector(forwardDir);
      this.wheels[i].previousVelocity = velocity;
      this.wheels[i].previousForwardVelocity = forwardVelocity;

      // determine slip force
      let slipVelocity = velocity.clone();
      slipVelocity.projectOnVector(slipDir);
      let slipAngle = 0;
      if (forwardVelocity.length() !== 0) {
        slipAngle = Math.atan((slipVelocity.length() + slipVelocity.dot(forwardVelocity)) / forwardVelocity.length());
      }
      this.wheels[i].slip = 1 - slipCurve.getValueAtPos(slipAngle); // replace with lookup curve
      slipVelocity.multiplyScalar(this.wheels[i].slip * this.wheels[i].weightAtWheel);
      let slipForce = this.btVec0;
      slipForce.setValue(-slipVelocity.x, 0, -slipVelocity.z);

      // apply acceleration force and determine current wheel grip
      let acceleration = this.appliedTorque * this.gearRatio * this.finalDrive * this.transmissionLoss / this.wheels[i].wheelRadius;

      // calculate rolling resistance
      let rollResistance = velocity.clone();
      rollResistance.multiplyScalar(-0.3);

      let accelForce = this.btVec2;
      accelForce.setValue(
        rollResistance.x + (forwardDir.x * acceleration),
        rollResistance.y + (forwardDir.y * acceleration),
        rollResistance.z + (forwardDir.z * acceleration)
      );

      // determine braking force
      let brakes = this.brake * this.brakingPower;
      // get direction
      let dot = this.wheels[i].previousForwardVelocity.dot(forwardDir);
      if (dot > 0) {
        brakes *= -1;
      }
      let brakeVelocity = forwardDir.clone();
      if (this.wheels[i].previousForwardVelocity.length() < 0.5) {
        brakeVelocity.multiplyScalar(delta * brakes);
      } else {
        brakeVelocity.multiplyScalar(brakes);
      }
      let brakingForce = this.btVec1;
      brakingForce.setValue(brakeVelocity.x, brakeVelocity.y, brakeVelocity.z);

      // get local location of wheel target
      let localTarget = new THREE.Vector3();
      localTarget = this.wheels[i].target.clone();
      localTarget.sub(transform.position);

      // convert it into something the physics engine can understand
      let btWheelPos = this.btVec3;
      btWheelPos.setValue(localTarget.x, localTarget.y, localTarget.z);

      if (this.wheels[i].isGrounded) {
        this.body.applyImpulse(slipForce, btWheelPos); // we apply impulse for an immediate velocity change
        if (this.wheels[i].powered) {
          this.body.applyForce(accelForce, btWheelPos);
        }
        if (this.wheels[i].brakes) {
          this.body.applyForce(brakingForce, btWheelPos);
        }
      } else if (!this.wheels[i].powered) {
        accelForce.setValue(0, 0, 0); // clear accelForce vector
      }

      // setup drawing of debug lines
      if (this.drawDebug) {
        // get forward force and make a line w it to demonstrate acceleration
        let pos = this.wheels[i].target.clone();
        let accelForcePoint = new THREE.Vector3(accelForce.x(), accelForce.y(), accelForce.z()).multiplyScalar(1 / this.mass);
        if (!this.wheels[i].powered || !this.wheels[i].isGrounded) {
          accelForcePoint = new THREE.Vector3(0, 0, 0);
        }
        accelForcePoint.add(pos);
        if (this.wheels[i].brakes && this.wheels[i].isGrounded) {
          accelForcePoint.add(new THREE.Vector3(brakingForce.x(), brakingForce.y(), brakingForce.z()).multiplyScalar(0.25 / this.mass));
        }

        // render accel / decel / braking
        this.wheels[i].accelPoints = [pos, accelForcePoint];
        this.wheels[i].accelGeometry.setFromPoints(this.wheels[i].accelPoints);
        // render slip
        let slipPos = new THREE.Vector3();
        slipPos = pos.clone();
        if (this.wheels[i].isGrounded) {
          slipPos.add(new THREE.Vector3(slipForce.x(), slipForce.y(), slipForce.z()).multiplyScalar(50 / this.mass));
        }
        this.wheels[i].slipPoints = [pos, slipPos];
        this.wheels[i].slipGeometry.setFromPoints(this.wheels[i].slipPoints);
      } else {
        this.wheels[i].accelGeometry.setFromPoints([]);
        this.wheels[i].slipGeometry.setFromPoints([]);
      }
    }
  }

  // apply aerodynamic and surface drag
  applyDrag() {
    // calculate aerodynamic drag applied to entire car body
    let aeroDrag = this.body.getLinearVelocity();
    aeroDrag = new THREE.Vector3(aeroDrag.x(), aeroDrag.y(), aeroDrag.z()); // convert to three.js vector
    aeroDrag.multiplyScalar(-aeroDrag.length() * 0.01);
    let dragForce = this.btVec0;
    dragForce.setValue(aeroDrag.x, aeroDrag.y, aeroDrag.z);
    this.body.applyForce(dragForce);
  }
}

/*************************************************************************/
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

let accEl = document.createElement("button");
accEl.textContent = "accel";
let decEl = document.createElement("button");
decEl.textContent = "rev";
let brakEl = document.createElement("button");
brakEl.textContent = "brk";
let steerLEl = document.createElement("button");
steerLEl.textContent = "left";
let steerREl = document.createElement("button");
steerREl.textContent = "right";
movementDiv.append(accEl, decEl, brakEl);
steerDiv.append(steerLEl, steerREl);
controlDiv.append(movementDiv, steerDiv);

// add toggles
let toggleDebugEl = document.createElement("button");
let toggleWheelsEl = document.createElement("button");
toggleDebugEl.textContent = "toggle debug lines";
toggleWheelsEl.textContent = "toggle wheel drawing";
toggleDebugEl.className = "toggle";
toggleWheelsEl.className = "toggle";
// add functionality to toggles
toggleDebugEl.addEventListener("click", () => {
  vehicleBox.toggleDebug();
});
toggleWheelsEl.addEventListener("click", () => {
  vehicleBox.toggleWheelVisibility();
});

canvasDiv.appendChild(controlDiv);
document.body.append(toggleDebugEl, toggleWheelsEl);
// add the canvas body to the page
document.body.appendChild(canvasDiv);

// window resize function (resizes canvas)
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  threejs.setSize(window.innerWidth * 0.6, window.innerHeight * 0.6);
}, false);

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
      input.decel = true;
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
    case "s":
      input.decel = false;
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
decEl.addEventListener("touchstart", () => {
  input.decel = true;
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
decEl.addEventListener("mousedown", () => {
  input.decel = true;
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
decEl.addEventListener("touchend", () => {
  input.decel = false;
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
decEl.addEventListener("mouseup", () => {
  input.decel = false;
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

// setup our internal clock
const t = new THREE.Clock();

// create a scene
const scene = new THREE.Scene(); 

// setup camera
const camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 1.0, 1000.0);
camera.position.set(100, 100, 0);
camera.rotation.y = 90 * Math.PI/180;
camera.lookAt(0, 0, 0);

// setup lights
const sun = new THREE.DirectionalLight(0xFFFFFF);
sun.position.set(0, 10, 0);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.bias = 0;
sun.shadow.mapSize.width = 256;
sun.shadow.mapSize.height = 256;
sun.shadow.camera.near = 1.0;
sun.shadow.camera.far = 200;
let shadowCamera = 10;
sun.shadow.camera.left = -shadowCamera;
sun.shadow.camera.right = shadowCamera;
sun.shadow.camera.top = shadowCamera;
sun.shadow.camera.bottom = -shadowCamera;

const ambient = new THREE.AmbientLight(0x606060);

// setup basic test meshes
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    map: checker,
  }));
plane.castShadow = false;
plane.receiveShadow = true;
plane.rotation.x = -Math.PI / 2;
// setup ground rigidbody
const rbGround = new RigidBody();
rbGround.createBox(0, new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z), plane.quaternion, new THREE.Vector3(1000, 1000, 0.01));
rbGround.body.setRestitution(0.0);
physicsWorld.addRigidBody(rbGround.body);

// create our testing vehicle
let centerOfGravity = new THREE.Vector3(0, 0.7, 0);
const vehicleGroup = new THREE.Group();
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 1.6, 4),
  new THREE.MeshStandardMaterial({
    color: 0x408080
  }));
box.position.copy(centerOfGravity); // acount for offset
box.castShadow = true;
box.receiveShadow = true;
vehicleGroup.add(box);
vehicleGroup.position.set(0, 5, 0);
// setup rigidbody for this box
const vehicleBox = new VehicleBody(vehicleGroup);
vehicleBox.createBox(1000, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(1.8, 1.6, 4), centerOfGravity);
// create wheels by using an array of relative wheel positions
vehicleBox.createWheels([
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 12000, suspensionDamping: 1000, wheelRadius: 0.5, powered: false, steering: true, brakes: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 12000, suspensionDamping: 1000, wheelRadius: 0.5, powered: false, steering: true, brakes: true },
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 12000, suspensionDamping: 1000, wheelRadius: 0.5, powered: true, steering: false, brakes: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 12000, suspensionDamping: 1000, wheelRadius: 0.5, powered: true, steering: false, brakes: true }
]);
vehicleBox.body.setFriction(0.9); // car will stop moving if body touches anything
vehicleBox.body.setRestitution(0);
vehicleBox.body.setActivationState(4); // prevent the rigidbody from sleeping
physicsWorld.addRigidBody(vehicleBox.body);
vehicleBox.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0)); // set an angular velocity for testing

// setup our rigidbodies list
const rigidBodies = [{mesh: vehicleGroup, rigidBody: vehicleBox}];

// add objects to scene
scene.add(sun, sun.target, ambient, plane, vehicleGroup);
 
// setup step function (update function)
function step(delta) {
  // update our vehicle
  vehicleBox.updateEngine(delta);
  vehicleBox.updateWheels(delta);
  vehicleBox.calcWeightTransfer();
  vehicleBox.calcSteering(delta); // needs delta time to get rpm
  vehicleBox.calcSuspension();
  vehicleBox.applyDrag();

  physicsWorld.stepSimulation(delta, 10);

  for (let i = 0; i < rigidBodies.length; i++) {
    let tempTransform = tempTrans0;
    rigidBodies[i].rigidBody.motionState.getWorldTransform(tempTransform);
    const pos = tempTransform.getOrigin();
    const rot = tempTransform.getRotation();
    let pos3 = new THREE.Vector3(pos.x(), pos.y(), pos.z());
    const rot3 = new THREE.Quaternion(rot.x(), rot.y(), rot.z(), rot.w());

    rigidBodies[i].mesh.quaternion.copy(rot3);
    rigidBodies[i].mesh.position.copy(pos3);
  }

  // update camera to follow vehicle
  camera.position.set(vehicleGroup.position.x + 100, vehicleGroup.position.y + 100, vehicleGroup.position.z);
  // update directional light
  sun.position.set(vehicleGroup.position.x, vehicleGroup.position.y + 5, vehicleGroup.position.z);
  sun.target.position.set(vehicleGroup.position.x, vehicleGroup.position.y, vehicleGroup.position.z)
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