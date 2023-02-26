// import our library dependencies
const THREE = require('three');
const CANNON = require('cannon-es');
// const CannonDebugger = require('cannon-es-debugger');
const { torqueCurve, pacejkaCurve } = require('./classes/curve.js');

// initialize cannon-es
const physicsWorld = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.8, 0),
});

/***********************************************************************************/
let currentEnginePoint = [{x: 0, y: 0}];
// load textures
// load our wheel texture
const checker = new THREE.TextureLoader().load("./src/textures/wheel_test_tex.jpg");
checker.wrapS = THREE.RepeatWrapping;
checker.wrapT = THREE.RepeatWrapping;
checker.repeat.set(1000, 1000);
const wheelTex = new THREE.TextureLoader().load("./src/textures/checker_02.jpg");
wheelTex.wrapS = THREE.RepeatWrapping;
wheelTex.wrapT = THREE.RepeatWrapping;
wheelTex.repeat.set(1, 1);

// define our classes
// vehicle rigidbody
class RigidBody {
  constructor() {

  }

  createBox(mass, pos, rot, size) {
    // save mass within object
    this.mass = mass;

    this.size = size;
    const cannonSize = new CANNON.Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this.shape = new CANNON.Box(cannonSize);
    this.body = new CANNON.Body({mass: mass, shape: this.shape});

    // add to compound shape with com offset
    this.body.position.set(pos.x, pos.y, pos.z);
    this.body.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }
}

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
    this.currentRPM = 0;
    this.maxRPM = 6000;
    this.minRPM = 1000;
    this.currentGear = 1; // 0 is reverse
    this.gears = [-2.9, 2.66, 1.78, 1.3, 1.0, 0.74, 0.5];
    this.gearRatio = this.gears[this.currentGear]; // current gear ratio; set to constant for testing
    this.finalDrive = 3.42; // differential drive
    this.transmissionLoss = 0.7; // transmission efficiency
    this.currentSpeed = 0;
    this.throttle = 0;
    this.brake = 0;
    this.brakingPower = 8000;
    this.appliedTorque = 0;
    this.numPoweredWheels = 0;

    // graphical bools
    this.appliedSteerAngle = false;

    // setup debug line materials
    this.drawDebug = false;
    this.springMat = new THREE.LineBasicMaterial({ color: 0x00FF00 });
    this.springMat.depthTest = false;
    this.accelMat = new THREE.LineBasicMaterial({ color: 0x0000FF });
    this.accelMat.depthTest = false;
    this.slipMat = new THREE.LineBasicMaterial({ color: 0xFF0000 });
    this.slipMat.depthTest = false;
  }

  // create our ammo.js box collider
  createBox(mass, pos, rot, size, com) {
    // save mass within object
    this.mass = mass;
    this.centerOfGravity = com;

    let compoundShape = new CANNON.Body({mass: mass});

    this.size = size;
    const cannonSize = new CANNON.Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this.shape = new CANNON.Box(cannonSize);

    // add to compound shape with com offset
    compoundShape.addShape(this.shape, new CANNON.Vec3(com.x, com.y, com.z));
    compoundShape.position.set(pos.x, pos.y, pos.z);
    compoundShape.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    // store as body for reference later
    this.body = compoundShape;
  }

  // get transform position
  getTransform() {
    const pos = this.body.position;
    const quat = this.body.quaternion;
    const rot = new THREE.Euler(0, 0, 0);
    rot.setFromQuaternion(quat);

    return {
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
      quaternion: quat,
      rotation: new THREE.Vector3(rot.x, rot.y, rot.z)
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
    let velocity = this.body.velocity;
    velocity = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    let angularVelocity = this.body.angularVelocity;
    angularVelocity = new THREE.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
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
        appliedAcceleration: 0,
        mesh: new THREE.Group(),
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
      const wheelVisual = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelArray[i].wheelRadius, wheelArray[i].wheelRadius, 0.225),
        new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        map: wheelTex,
      }))
      wheelVisual.castShadow = true;
      wheel.mesh.add(wheelVisual);
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
      this.throttle -= 2 * delta;
    }
    this.throttle = Math.max(0, Math.min(1, this.throttle));
    // get brakes
    if (input.brake) {
      this.brake += 2 * delta;
    } else {
      this.brake -= 4 * delta;
    }
    this.brake = Math.max(0, Math.min(1, this.brake));

    // change gears
    if (input.shiftUp) {
      this.currentGear += 1;
      if (this.currentGear > this.gears.length - 1) {
        this.currentGear = this.gears.length - 1;
      }
      this.gearRatio = this.gears[this.currentGear];
      input.shiftUp = false;
    }
    if (input.shiftDown) {
      this.currentGear -= 1;
      if (this.currentGear < 0) {
        this.currentGear = 0;
      }
      this.gearRatio = this.gears[this.currentGear];
      input.shiftDown = false;
    }

    // get our engine rpm back from the wheel rpm
    let averageSpeed = 0; // in rad/s
    let averageRPM = 0;
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].powered) {
        averageSpeed += this.wheels[i].angularVelocity * this.wheels[i].wheelRadius;
        averageRPM += (this.wheels[i].angularVelocity / (2*Math.PI)) * 60;
      }
    }
    averageSpeed /= this.numPoweredWheels; // divide by number of wheels connected to engine
    averageRPM /= this.numPoweredWheels;
    this.currentRPM = averageRPM * this.gearRatio * this.finalDrive; // convert to RPM from rad/s

    // clamp RPM values
    this.currentRPM = Math.max(this.minRPM, Math.min(this.maxRPM, this.currentRPM));

    // look up torque curve
    this.appliedTorque = torqueCurve.getValueAtPos((this.currentRPM) / this.maxRPM) * this.throttle;

    // update OSD
    let gearText = "1st";
    switch(this.currentGear) {
      case 0:
        gearText = 'Reverse';
        break;
      case 1:
        gearText = '1st';
        break;
      case 2:
        gearText = '2nd';
        break;
      case 3:
        gearText = '3rd';
        break;
      case 4:
        gearText = '4th';
        break;
      case 5:
        gearText = '5th';
        break;
      case 6:
        gearText = '6th';
        break;
    }
    document.getElementById("sub-info").textContent = gearText + " Gear // " + "Engine RPM: " + parseInt(this.currentRPM) + " // " + parseInt(Math.abs(averageSpeed * 3.6)) + ' kmh';
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

      // compute this wheel's angular acceleration and velocity
      if (this.wheels[i].isGrounded) {
        this.wheels[i].angularVelocity = this.wheels[i].previousForwardVelocity.length() / this.wheels[i].wheelRadius;
        if (this.wheels[i].previousForwardVelocity.dot(this.wheels[i].forwardDir) < 0) {
          this.wheels[i].angularVelocity *= -1;
        }
      }

      const wheelInertia = (25 * (this.wheels[i].wheelRadius * this.wheels[i].wheelRadius) / 2); // 25 = 25kg (wheel weight)
      // calculate rolling resistance
      let rollingResistance = 0;
      rollingResistance = 0.005 * this.wheels[i].maxDriveForce;
      if (this.wheels[i].angularVelocity > 0) {
        rollingResistance *= -1;
      }

      // calculate acceleration force from engine if wheel is connected
      let engineAccel = 0;
      if (this.wheels[i].powered) {
        // calculate max allowed angular velocity at current gear
        let maxAllowedWheelVelocity = (this.maxRPM * (2*Math.PI) / 60 / this.gearRatio / this.finalDrive);

        if (Math.abs(this.wheels[i].angularVelocity) > Math.abs(maxAllowedWheelVelocity)) {
          this.wheels[i].angularVelocity = maxAllowedWheelVelocity;
        } else {
          engineAccel = (this.appliedTorque * this.gearRatio * this.finalDrive); // / this.numPoweredWheels;
        }
      }

      // calculate braking force
      let brakingAccel = 0;
      if (this.wheels[i].brakes) {
        brakingAccel = (this.brakingPower * this.brake);
        if (this.wheels[i].angularVelocity > 0) {
          brakingAccel *= -1;
        }

        if (Math.abs(this.wheels[i].angularVelocity) < 0.1) {
          brakingAccel = this.wheels[i].angularVelocity * wheelInertia;
        }
      }

      let slipRatio = 0;
      let forwardVelocity = this.getVelocityAtPoint(this.wheels[i].target);
      forwardVelocity.projectOnVector(this.wheels[i].forwardDir);
      if (this.wheels[i].previousForwardVelocity.length() !== 0) {
        if (this.wheels[i].isGrounded) {
          // calculate slip ratio based on torque applied by engine / braking
          slipRatio = ((this.wheels[i].angularVelocity + ((engineAccel + brakingAccel) / wheelInertia * delta)) * this.wheels[i].wheelRadius - this.wheels[i].previousForwardVelocity.length())
          / ((this.wheels[i].angularVelocity + ((engineAccel) / wheelInertia * delta)) * this.wheels[i].wheelRadius);
          slipRatio = Math.max(-2, Math.min(2, slipRatio));
        } else if (this.brake > 0) {
          slipRatio = -1;
        } else {
          slipRatio = 1;
        }
      }
      let grip = pacejkaCurve.getValueAtPos(slipRatio / 2); // check slip curve
      this.wheels[i].grip = grip;

      // calculate wheel acceleration
      if (this.wheels[i].isGrounded) {
        this.wheels[i].angularAcceleration = (engineAccel + rollingResistance - Math.max(-this.wheels[i].maxDriveForce, Math.min((engineAccel) * grip, this.wheels[i].maxDriveForce)) + rollingResistance) / wheelInertia;
      } else {
        this.wheels[i].angularAcceleration = (engineAccel + brakingAccel + rollingResistance) / wheelInertia;
      }
      this.wheels[i].angularVelocity += this.wheels[i].angularAcceleration * delta;
      this.wheels[i].appliedAcceleration = (Math.max(-this.wheels[i].maxDriveForce, Math.min((engineAccel + brakingAccel) * grip, this.wheels[i].maxDriveForce)) + rollingResistance) / this.wheels[i].wheelRadius;

      // rotate the wheel mesh
      if (slipRatio > -1) {
        this.wheels[i].mesh.children[0].rotation.y -= (this.wheels[i].angularVelocity) * delta;
      }

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
        let totalAppliedForce = new CANNON.Vec3();
        // get local position for target
        let localTarget = new THREE.Vector3();
        localTarget = this.wheels[i].target.clone();
        localTarget.sub(transform.position);

        // convert his local position into something the physics engine can understand
        let btWheelPos = new CANNON.Vec3();
        btWheelPos.set(localTarget.x, localTarget.y, localTarget.z);
        let wheelWorldPos = new THREE.Vector3();
        this.wheels[i].obj.getWorldPosition(wheelWorldPos);

        let offset = new THREE.Vector3(this.wheels[i].target.x, this.wheels[i].target.y, this.wheels[i].target.z);
        offset.sub(wheelWorldPos);

        // calculate a spring force and apply it
        let springForce = offset.multiplyScalar(this.wheels[i].suspensionStrength);

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
        totalAppliedForce.set(cumulativeForce.x, cumulativeForce.y, cumulativeForce.z);
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

    // iterate through wheels and apply weight as percentage of force applied
    for (let i = 0; i < this.wheels.length; i++) {
      let percentage = this.wheels[i].suspensionForceAtWheel / totalForce;
      this.wheels[i].weightAtWheel = this.mass * percentage;
      this.wheels[i].maxDriveForce = this.wheels[i].weightAtWheel * 9.8
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
        let meshTarget = new THREE.Euler(this.wheels[i].mesh.rotation.x, 0, this.wheels[i].mesh.rotation.z);

        // default rest position (no angle)
        if (input.right) {
          wheelTarget.y -= 35 * Math.PI/180;
          meshTarget.y -= 35 * Math.PI/180;
        }
        if (input.left) {
          wheelTarget.y += 35 * Math.PI/180;
          meshTarget.y += 35 * Math.PI/180;
        }

        let targetQuatWheel = new THREE.Quaternion();
        let targetQuatMesh = new THREE.Quaternion();
        targetQuatWheel.setFromEuler(wheelTarget);
        targetQuatMesh.setFromEuler(meshTarget);

        // set wheel's rotation
        this.wheels[i].obj.quaternion.rotateTowards(targetQuatWheel, 1.2 * Math.PI/180);
        this.wheels[i].mesh.quaternion.rotateTowards(targetQuatMesh, 1.2 * Math.PI/180);
      }

      // get velocity
      let velocity = this.getVelocityAtPoint(this.wheels[i].target);
      velocity.projectOnPlane(new THREE.Vector3(0, 1, 0));
      let forwardVelocity = velocity.clone().projectOnVector(forwardDir);
      this.wheels[i].previousVelocity = velocity;
      this.wheels[i].previousForwardVelocity = forwardVelocity;

      // determine slip force
      let slipVelocity = velocity.clone();
      slipVelocity.normalize();
      let slipAngle = 1;
      this.wheels[i].slip = pacejkaCurve.getValueAtPos(slipAngle / 20); // replace with lookup curve; 20 degrees = max slip angle
      let appliedSlipForce = 0;
      appliedSlipForce = (this.wheels[i].slip * this.wheels[i].maxDriveForce) / this.wheels[i].wheelRadius

      // calculate max applied force in forward + slip directions based on max allowed drive force at wheel
      // compare magnitude of accel and slip forces then divide by allowed maximum
      let totalForce = Math.abs(appliedSlipForce * this.wheels[i].wheelRadius) + Math.abs(this.wheels[i].appliedAcceleration * this.wheels[i].wheelRadius);
      let percentageAppliedForce = 1;
      if (this.wheels[i].maxDriveForce !== 0 && totalForce > this.wheels[i].maxDriveForce) {
        percentageAppliedForce = this.wheels[i].maxDriveForce / totalForce;
      }
      let appliedAcceleration = this.wheels[i].appliedAcceleration * percentageAppliedForce;
      appliedSlipForce *= percentageAppliedForce;

      // apply acceleration and slip force based on traction circle and determine current wheel grip
      let acceleration = appliedAcceleration;
      let accelForce = new CANNON.Vec3();
      // if brakes are being applied, don't apply braking relative to steering direction anymore
      if (this.brake) {
        forwardDir = new THREE.Vector3(0, 0, 1);
        forwardDir.applyQuaternion(transform.quaternion);
      }
      accelForce.set(
        (forwardDir.x * acceleration),
        (forwardDir.y * acceleration),
        (forwardDir.z * acceleration)
      );
      slipVelocity.projectOnVector(slipDir);
      slipVelocity.multiplyScalar(appliedSlipForce);
      let slipForce = new CANNON.Vec3();
      slipForce.set(-slipVelocity.x, 0, -slipVelocity.z);

      // get local location of wheel target
      let localTarget = new THREE.Vector3();
      localTarget = this.wheels[i].target.clone();
      localTarget.sub(transform.position);

      // convert it into something the physics engine can understand
      let btWheelPos = new CANNON.Vec3();
      btWheelPos.set(localTarget.x, localTarget.y, localTarget.z);

      if (this.wheels[i].isGrounded) {
        this.body.applyForce(slipForce, btWheelPos); // we apply impulse for an immediate velocity change
        this.body.applyForce(accelForce, btWheelPos);
      }

      // setup drawing of debug lines
      if (this.drawDebug) {
        // get forward force and make a line w it to demonstrate acceleration
        let pos = this.wheels[i].target.clone();
        let accelForcePoint = pos.clone();
        if (this.wheels[i].powered && this.wheels[i].isGrounded) {
          accelForcePoint.set(accelForce.x, accelForce.y, accelForce.z);
          accelForcePoint.multiplyScalar(1 / this.mass).add(pos);
        }

        // render accel / decel / braking
        this.wheels[i].accelPoints = [pos, accelForcePoint];
        this.wheels[i].accelGeometry.setFromPoints(this.wheels[i].accelPoints);
        // render slip
        let slipPos = new THREE.Vector3();
        slipPos = pos.clone();
        if (this.wheels[i].isGrounded) {
          slipPos.add(new THREE.Vector3(slipForce.x, slipForce.y, slipForce.z).multiplyScalar(1 / this.mass));
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
    let aeroDrag = this.body.velocity;
    aeroDrag = new THREE.Vector3(aeroDrag.x, aeroDrag.y, aeroDrag.z); // convert to three.js vector
    aeroDrag.multiplyScalar(-aeroDrag.length() * 0.01);
    let dragForce = new CANNON.Vec3();
    dragForce.set(aeroDrag.x, aeroDrag.y, aeroDrag.z);
    // this.body.applyForce(dragForce);
  }
}

/*************************************************************************/
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
  vehicleBox.toggleDebug();
});
toggleWheelsEl.addEventListener("click", () => {
  vehicleBox.toggleWheelVisibility();
});

canvasDiv.appendChild(controlDiv);
// capture our game div
document.getElementById('game-div').append(toggleDebugEl, toggleWheelsEl);
// add the canvas body to the page
document.getElementById('game-div').appendChild(canvasDiv);
// create our canvas
// const chartCanvas = document.createElement("canvas");
// chartCanvas.id = "curveChart";
// document.getElementById('chart-div').appendChild(chartCanvas);
// // plot torque curve to chart.js canvas
// const context = document.getElementById('curveChart');
// const torqueChart = new Chart(context, {
//   type: 'line',
//   data: {
//     datasets: [
//       {
//       label: 'Engine Torque',
//       data: torquePoints,
//       fill: false,
//       borderColor: 'rgb(255, 0, 0)',
//       tension: 0.5
//       },
//       {
//         label: 'Current Torque',
//         data: currentEnginePoint,
//         fill: true,
//         borderColor: 'rgb(0, 255, 0)',
//         tension: 0
//       }
//     ]
//   },
//   options: {
//     scales: {
//       y: {
//         beginAtZero: true,
//         type: 'linear'
//       },
//       x: {
//         beginAtZero: true,
//         type: 'linear'
//       }
//     }
//   }
// });

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

// setup our internal clock
const t = new THREE.Clock();

// create a scene
const scene = new THREE.Scene(); 

// setup camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 1000.0);
camera.position.set(100, 100, 0);
// camera.rotation.y = 90 * Math.PI/180;
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
  new THREE.PlaneGeometry(10000, 10000, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    map: checker,
  }));
plane.castShadow = false;
plane.receiveShadow = true;
plane.rotation.x = -Math.PI / 2;
// setup ground rigidbody
const rbGround = new RigidBody();
rbGround.createBox(0, new THREE.Vector3(plane.position.x, plane.position.y, plane.position.z), plane.quaternion, new THREE.Vector3(10000, 10000, 0.01));
physicsWorld.addBody(rbGround.body);

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
vehicleBox.createBox(1600, vehicleGroup.position, vehicleGroup.quaternion, new THREE.Vector3(1.8, 1.6, 4), centerOfGravity);
// create wheels by using an array of relative wheel positions
vehicleBox.createWheels([
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 18000, suspensionDamping: 800, wheelRadius: 0.33, powered: false, steering: true, brakes: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, vehicleBox.size.z / 3), suspensionStrength: 18000, suspensionDamping: 800, wheelRadius: 0.33, powered: false, steering: true, brakes: true },
  { pos: new THREE.Vector3(vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 18000, suspensionDamping: 800, wheelRadius: 0.33, powered: true, steering: false, brakes: true },
  { pos: new THREE.Vector3(-vehicleBox.size.x / 2, -vehicleBox.size.y / 1.5, -vehicleBox.size.z / 3), suspensionStrength: 18000, suspensionDamping: 800, wheelRadius: 0.33, powered: true, steering: false, brakes: true }
]);
physicsWorld.addBody(vehicleBox.body);

// setup our rigidbodies list
const rigidBodies = [{mesh: vehicleGroup, rigidBody: vehicleBox}];

// add objects to scene
scene.add(sun, sun.target, ambient, plane, vehicleGroup);

// setup cannon debugger
// const cannonDebugger = new CannonDebugger(scene, physicsWorld);
 
// setup step function (update function)
function step(delta) {
  // update our vehicle
  vehicleBox.updateEngine(delta);
  vehicleBox.updateWheels(delta);
  vehicleBox.calcWeightTransfer();
  vehicleBox.calcSteering(delta); // needs delta time to get rpm
  vehicleBox.calcSuspension();
  vehicleBox.applyDrag();

  // update current engine point
  currentEnginePoint = [{x: vehicleBox.currentRPM / vehicleBox.maxRPM, y: vehicleBox.appliedTorque}];
  // torqueChart.data.datasets[1].data = currentEnginePoint;
  // torqueChart.update();

  physicsWorld.step(1/120, delta, 10);
  // cannonDebugger.update();

  // make meshes match physics world
  for (let i = 0; i < rigidBodies.length; i++) {
    rigidBodies[i].mesh.position.copy(rigidBodies[i].rigidBody.body.position);
    rigidBodies[i].mesh.quaternion.copy(rigidBodies[i].rigidBody.body.quaternion);
  }

  // update camera to follow vehicle
  camera.position.set(vehicleGroup.position.x, vehicleGroup.position.y + 0.6, vehicleGroup.position.z);
  camera.rotation.set(-vehicleGroup.rotation.x, vehicleGroup.rotation.y, -vehicleGroup.rotation.z);
  camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI);
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