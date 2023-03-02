// import dependencies
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as TONE from 'tone';
import { torqueCurve, pacejkaCurve } from './Curve.js';

// create models / textures for use within class
const wheelTex = new THREE.TextureLoader().load("./src/textures/checker_02.jpg");
wheelTex.wrapS = THREE.RepeatWrapping;
wheelTex.wrapT = THREE.RepeatWrapping;
wheelTex.repeat.set(1, 1);

// vehicle rigidbody
class VehicleBody {
  constructor(group, input, collisionObjects = [], scene) {
    // store our parent transform for reuse and store our input obj
    this.scene = scene;
    this.parent = group;
    this.collisionObjects = collisionObjects
    this.input = input;
    // store a center of gravity offset
    this.centerOfGravity = new THREE.Vector3(0, 0, 0);

    // setup our raycaster for the wheels
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0;

    // setup engine
    this.currentRPM = 0;
    this.maxRPM = 7000;
    this.minRPM = 1000;
    this.currentGear = 1; // 0 is reverse
    this.gears = [-6, 5.5, 3.8, 2.5, 1.7, 1, 0.6];
    this.gearRatio = this.gears[this.currentGear]; // current gear ratio; set to constant for testing
    this.finalDrive = 3.42; // differential drive
    this.transmissionLoss = 0.7; // transmission efficiency
    this.currentSpeed = 0;
    this.throttle = 0;
    this.brake = 0;
    this.brakingPower = 4000;
    this.appliedTorque = 0;
    this.numPoweredWheels = 0;

    // is the vehicle emitting sound?
    this.isPlayingAudio = false;

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

    let compoundShape = new CANNON.Body({ mass: mass });

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

  // create our tone audio sources
  createAudio() {
    // setup effects and filters
    this.engineFilter = new TONE.Filter();
    this.engineFilter.set({
      type: 'lowpass',
      frequency: 270,
      rolloff: -48,
      Q: 4
    });
    this.engineDistortion = new TONE.Distortion();
    this.engineDistortion.set({
      distortion: 0.2,
      oversample: 'none'
    });
    // setup engine audio / oscillator
    this.engineSound = new TONE.FMSynth();
    this.engineSound.set({
      volume: -6,
      harmonicity: 0.5,
      modulationIndex: 0.8,
      oscillator: {
        type: 'sawtooth12'
      }
    });

    // start the tones
    this.engineSound.chain(this.engineFilter, this.engineDistortion, TONE.Destination);
    this.engineSound.triggerAttack();

    // now go through each wheel and add an audio source for wheel slip
    for (let i = 0; i < this.wheels.length; i++) {
      // create our filter and distortion
      this.wheels[i].slipFilter = new TONE.Filter();
      this.wheels[i].slipFilter.set({
        type: 'lowpass',
        frequency: 300,
        rolloff: -96,
        Q: 12
      });
      this.wheels[i].slipDistortion = new TONE.Distortion();
      this.wheels[i].slipDistortion.set({
        distortion: 0.8,
        oversample: '4x'
      });
      // create our slippage sounds
      this.wheels[i].longSlipSound = new TONE.FMSynth();
      this.wheels[i].longSlipSound.set({
        volume: -100,
        harmonicity: 0.1,
        modulationIndex: 1,
        oscillator: {
          type: 'sine'
        }
      });
      this.wheels[i].longSlipSound.chain(this.wheels[i].slipFilter, this.wheels[i].slipDistortion, TONE.Destination);
      this.wheels[i].longSlipSound.triggerAttack();

      this.wheels[i].latSlipSound = new TONE.FMSynth();
      this.wheels[i].latSlipSound.set({
        volume: -100,
        harmonicity: 0.1,
        modulationIndex: 1,
        oscillator: {
          type: 'sine'
        }
      });
      this.wheels[i].latSlipSound.chain(this.wheels[i].slipFilter, this.wheels[i].slipDistortion, TONE.Destination);
      this.wheels[i].latSlipSound.triggerAttack();
    }
  }

  // mute or re-enable audio
  startAudio() {
    if (this.engineSound && !this.isPlayingAudio) {
      this.engineSound.triggerAttack();

      // loop through wheels
      for (let i = 0; i < this.wheels.length; i++) {
        this.wheels[i].longSlipSound.triggerAttack();
        this.wheels[i].latSlipSound.triggerAttack();
      }

      this.isPlayingAudio = true;
    }
  }
  stopAudio() {
    if (this.engineSound && this.isPlayingAudio) {
      this.engineSound.triggerRelease();

      // loop through wheels
      for (let i = 0; i < this.wheels.length; i++) {
        this.wheels[i].longSlipSound.triggerRelease();
        this.wheels[i].latSlipSound.triggerRelease();
      }

      this.isPlayingAudio = false;
    }
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
        downFromBody: new THREE.Vector3(0, 0, 0),
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
      wheel.springLine.renderOrder = 1;
      wheel.accelLine.renderOrder = 1;
      wheel.slipLine.renderOrder = 1;
      this.scene.add(wheel.springLine);
      this.scene.add(wheel.accelLine);
      this.scene.add(wheel.slipLine);

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
      wheel.mesh.rotation.z = 90 * Math.PI / 180;
      // add the mesh to the parent group
      this.parent.add(wheel.obj);
      this.parent.add(wheel.mesh);
      this.wheels.push(wheel);
    }
  }

  // determine RPM of engine based on user input
  updateEngine(delta) {
    // get input to drive engine
    if (this.input.accel) {
      this.throttle += 2 * delta;
    } else {
      this.throttle -= 4 * delta;
    }
    this.throttle = Math.max(0, Math.min(1, this.throttle));
    // get brakes
    if (this.input.brake) {
      this.brake += 2 * delta;
    } else {
      this.brake -= 4 * delta;
    }
    this.brake = Math.max(0, Math.min(1, this.brake));

    // change gears
    if (this.input.shiftUp) {
      this.currentGear += 1;
      if (this.currentGear > this.gears.length - 1) {
        this.currentGear = this.gears.length - 1;
      }
      this.gearRatio = this.gears[this.currentGear];
      this.input.shiftUp = false;
    }
    if (this.input.shiftDown) {
      this.currentGear -= 1;
      if (this.currentGear < 0) {
        this.currentGear = 0;
      }
      this.gearRatio = this.gears[this.currentGear];
      this.input.shiftDown = false;
    }

    // get our engine rpm back from the wheel rpm
    let averageSpeed = 0; // in rad/s
    let averageRPM = 0;
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].powered) {
        averageSpeed += this.wheels[i].angularVelocity * this.wheels[i].wheelRadius;
        averageRPM += (this.wheels[i].angularVelocity / (2 * Math.PI)) * 60;
      }
    }
    averageSpeed /= this.numPoweredWheels; // divide by number of wheels connected to engine
    averageRPM /= this.numPoweredWheels;
    this.currentRPM = averageRPM * this.gearRatio * this.finalDrive; // convert to RPM from rad/s

    // clamp RPM values
    this.currentRPM = Math.max(this.minRPM, Math.min(this.maxRPM, this.currentRPM));

    // update audio ramps
    if (this.engineSound) {
      // main oscillator
      this.engineSound.set({
        frequency: this.currentRPM / 25 + (Math.random() * 6 - 3),
      });
      // lowpass
      this.engineFilter.set({
        frequency: 270 + this.throttle * 10,
        Q: 4 + this.throttle * 1.6
      });
      // distortion
      this.engineDistortion.set({
        distortion: 0.2 + this.throttle * 0.1
      });
    }

    // look up torque curve
    this.appliedTorque = torqueCurve.getValueAtPos((this.currentRPM) / this.maxRPM) * this.throttle;

    // update OSD
    let gearText = "1st";
    switch (this.currentGear) {
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
      const downFromBody = direction.clone().multiplyScalar(-this.wheels[i].wheelRadius).applyQuaternion(this.wheels[i].obj.quaternion);
      this.wheels[i].downFromBody = downFromBody; // store for other functions
      position.add(downFromBody);
      // set max length for raycaster
      this.raycaster.far = this.wheels[i].wheelRadius * 2;
      // now cast the ray
      this.raycaster.set(position, direction); // cast ray directly down
      const intersects = this.raycaster.intersectObjects(this.collisionObjects); // intersect our plane
      if (intersects.length > 0) {
        this.wheels[i].target = intersects[0].point;
        this.wheels[i].target.add(downFromBody);
        this.wheels[i].isGrounded = true;
        this.wheels[i].normal = intersects[0].face.normal;
      } else {
        this.wheels[i].target = position.sub(downFromBody);
        this.wheels[i].isGrounded = false;
        this.wheels[i].normal = new THREE.Vector3(0, 0, 0);
      }

      // set visual mesh position
      this.scene.attach(this.wheels[i].mesh); // attach to scene, modify global transform
      // directly setting position does not seem to work correctly; each axis must be updated individually
      this.wheels[i].mesh.position.x = this.wheels[i].target.x;
      this.wheels[i].mesh.position.y = this.wheels[i].target.y;
      this.wheels[i].mesh.position.z = this.wheels[i].target.z;
      this.parent.attach(this.wheels[i].mesh); // reattach to parent group for rotation

      // compute this wheel's angular acceleration and velocity
      let directionalForwardVelocityLength = this.wheels[i].previousForwardVelocity.length();
      if (this.wheels[i].isGrounded) {
        this.wheels[i].angularVelocity = this.wheels[i].previousForwardVelocity.length() / this.wheels[i].wheelRadius;
        if (this.wheels[i].previousForwardVelocity.dot(this.wheels[i].forwardDir) < 0) {
          this.wheels[i].angularVelocity *= -1;
          directionalForwardVelocityLength *= -1;
        }
      }

      const wheelInertia = (25 * (this.wheels[i].wheelRadius * this.wheels[i].wheelRadius) / 2); // 25 = 25kg (wheel weight)
      // calculate rolling resistance
      let rollingResistance = 0;
      rollingResistance = 0.012 * this.wheels[i].maxDriveForce;
      if (this.wheels[i].angularVelocity > 0) {
        rollingResistance *= -1;
      }

      // calculate acceleration force from engine if wheel is connected
      let engineAccel = 0;
      if (this.wheels[i].powered) {
        // calculate max allowed angular velocity at current gear
        let maxAllowedWheelVelocity = (this.maxRPM * (2 * Math.PI) / 60 / this.gearRatio / this.finalDrive);

        if (Math.abs(this.wheels[i].angularVelocity) > Math.abs(maxAllowedWheelVelocity)) {
          this.wheels[i].angularVelocity = maxAllowedWheelVelocity;
        } else {
          engineAccel = (this.appliedTorque * this.gearRatio * this.finalDrive) / this.numPoweredWheels;
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
          slipRatio = ((this.wheels[i].angularVelocity + ((engineAccel + brakingAccel) / wheelInertia * delta)) * this.wheels[i].wheelRadius - directionalForwardVelocityLength)
            / ((this.wheels[i].angularVelocity + (engineAccel / wheelInertia * delta)) * this.wheels[i].wheelRadius);
          slipRatio = Math.max(-1, Math.min(1, slipRatio));
        } else if (this.brake > 0) {
          slipRatio = -1;
        } else {
          slipRatio = 1;
        }
      }
      let grip = pacejkaCurve.getValueAtPos(slipRatio); // check slip curve
      this.wheels[i].grip = grip;

      // calculate wheel acceleration
      if (this.wheels[i].isGrounded) {
        this.wheels[i].angularAcceleration = (engineAccel - Math.max(-this.wheels[i].maxDriveForce, Math.min((engineAccel) * grip, this.wheels[i].maxDriveForce)) + rollingResistance) / wheelInertia;
      } else {
        this.wheels[i].angularAcceleration = (engineAccel + brakingAccel + rollingResistance) / wheelInertia;
      }
      this.wheels[i].angularVelocity += this.wheels[i].angularAcceleration * delta;
      // derive this from new angularAccel - old angularAccel? would allow for stuff like downshifts to slow the car + engine braking
      this.wheels[i].appliedAcceleration = (Math.max(-this.wheels[i].maxDriveForce, Math.min((engineAccel + brakingAccel) * grip, this.wheels[i].maxDriveForce)) + rollingResistance) / this.wheels[i].wheelRadius;

      // rotate the wheel mesh
      if (slipRatio > -1) {
        this.wheels[i].mesh.children[0].rotation.y -= (this.wheels[i].angularVelocity) * delta;
      }

      // trigger wheel slip tire screech audio
      if (this.wheels[i].longSlipSound) {
        if (Math.abs(slipRatio) > 0.1 && this.wheels[i].isGrounded && this.wheels[i].previousForwardVelocity.length() > 0.2) {
          this.wheels[i].longSlipSound.set({
            volume: -100 + Math.abs(32 * slipRatio),
            frequency: Math.max(1200, Math.min(2000, 200 * this.wheels[i].previousForwardVelocity.length())),
          });
        } else {
          this.wheels[i].longSlipSound.set({
            volume: -100
          });
        }
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
  calcSuspension(delta) {
    // get transform
    let transform = this.getTransform();

    // iterate through each of our wheels and calculate their suspension forces
    for (let i = 0; i < this.wheels.length; i++) {
      if (this.wheels[i].isGrounded) {
        // cumulative force
        let totalAppliedForce = new THREE.Vector3();
        // get local position for target
        let localTarget = new THREE.Vector3();
        localTarget = this.wheels[i].target.clone();
        localTarget.sub(transform.position);
        localTarget.add(this.wheels[i].previousForwardVelocity.clone().multiplyScalar(delta)); // ensure the target keeps up w the vehicle's update

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
        velocity.projectOnVector(this.wheels[i].downFromBody);
        // use it to calc our spring damping force
        let dampingForce = velocity.multiplyScalar(-this.wheels[i].suspensionDamping); // invert damping force to negate suspension force

        // cumuluative suspension force
        let cumulativeForce = springForce.clone();
        cumulativeForce.add(dampingForce);
        this.wheels[i].suspensionForceAtWheel = cumulativeForce.length();
        // apply total force to wheel
        totalAppliedForce.set(cumulativeForce.x, cumulativeForce.y, cumulativeForce.z);
        this.body.applyImpulse(totalAppliedForce.multiplyScalar(delta), btWheelPos);

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
        if (this.input.right) {
          wheelTarget.y -= 35 * Math.PI / 180;
          meshTarget.y -= 35 * Math.PI / 180;
        }
        if (this.input.left) {
          wheelTarget.y += 35 * Math.PI / 180;
          meshTarget.y += 35 * Math.PI / 180;
        }

        let targetQuatWheel = new THREE.Quaternion();
        let targetQuatMesh = new THREE.Quaternion();
        targetQuatWheel.setFromEuler(wheelTarget);
        targetQuatMesh.setFromEuler(meshTarget);

        // set wheel's rotation
        this.wheels[i].obj.quaternion.rotateTowards(targetQuatWheel, 1.2 * Math.PI / 180);
        this.wheels[i].mesh.quaternion.rotateTowards(targetQuatMesh, 1.2 * Math.PI / 180);
      }

      // get velocity
      let velocity = this.getVelocityAtPoint(this.wheels[i].target);
      velocity.projectOnPlane(new THREE.Vector3(0, 1, 0));
      let forwardVelocity = velocity.clone().projectOnVector(forwardDir);
      this.wheels[i].previousVelocity = velocity;
      this.wheels[i].previousForwardVelocity = forwardVelocity;

      // determine slip force
      let slipVelocity = velocity.clone();
      let normForwardVel = forwardVelocity.clone();
      slipVelocity.normalize();
      normForwardVel.normalize();
      let slipAngle = slipVelocity.angleTo(normForwardVel) * 180/Math.PI;
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
      let accelForce = new THREE.Vector3();
      accelForce.set(
        (forwardDir.x * acceleration),
        (forwardDir.y * acceleration),
        (forwardDir.z * acceleration)
      );
      slipVelocity.projectOnVector(slipDir);
      slipVelocity.multiplyScalar(appliedSlipForce);
      let slipForce = new THREE.Vector3();
      slipForce.set(-slipVelocity.x, 0, -slipVelocity.z);

      // get local location of wheel target
      let localTarget = new THREE.Vector3();
      localTarget = this.wheels[i].target.clone();
      localTarget.sub(transform.position);
      localTarget.add(forwardVelocity.clone().multiplyScalar(delta)); // ensure the force is applied at the right spot while vehicle is moving

      // convert it into something the physics engine can understand
      let btWheelPos = new CANNON.Vec3();
      btWheelPos.set(localTarget.x, localTarget.y, localTarget.z);

      if (this.wheels[i].isGrounded) {
        this.body.applyImpulse(slipForce.multiplyScalar(delta), btWheelPos); // we apply impulse for an immediate velocity change
        this.body.applyImpulse(accelForce.multiplyScalar(delta), btWheelPos);
      }

      // play tirescreech based on slip angle
      if (this.wheels[i].latSlipSound) {
        if (Math.abs(slipAngle) > 5 && this.wheels[i].isGrounded && this.wheels[i].previousForwardVelocity.length() > 0.2) {
          this.wheels[i].latSlipSound.set({
            volume: -100 + Math.abs(slipAngle),
            frequency: Math.max(1200, Math.min(1600, appliedSlipForce / 4)),
          });
        } else {
          this.wheels[i].latSlipSound.set({
            volume: -100,
          });
        }
      }

      // setup drawing of debug lines
      if (this.drawDebug) {
        // get forward force and make a line w it to demonstrate acceleration
        let pos = this.wheels[i].target.clone();
        let accelForcePoint = pos.clone();
        if (this.wheels[i].powered && this.wheels[i].isGrounded) {
          accelForcePoint.set(accelForce.x, accelForce.y, accelForce.z);
          accelForcePoint.multiplyScalar(100 / this.mass).add(pos);
        }

        // render accel / decel / braking
        this.wheels[i].accelPoints = [pos, accelForcePoint];
        this.wheels[i].accelGeometry.setFromPoints(this.wheels[i].accelPoints);
        // render slip
        let slipPos = new THREE.Vector3();
        slipPos = pos.clone();
        if (this.wheels[i].isGrounded) {
          slipPos.add(new THREE.Vector3(slipForce.x, slipForce.y, slipForce.z).multiplyScalar(100 / this.mass));
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
  applyDrag(delta) {
    // calculate aerodynamic drag applied to entire car body
    let aeroDrag = this.body.velocity;
    aeroDrag = new THREE.Vector3(aeroDrag.x, aeroDrag.y, aeroDrag.z); // convert to three.js vector
    aeroDrag.multiplyScalar(-aeroDrag.length() * 0.01);
    let dragForce = new THREE.Vector3();
    dragForce.set(aeroDrag.x, aeroDrag.y, aeroDrag.z);
    this.body.applyImpulse(dragForce.multiplyScalar(delta));
  }

  // update entire vehicle with above functions
  updateVehicle(delta) {
    this.updateEngine(delta);
    this.updateWheels(delta);
    this.calcSuspension(delta);
    this.calcWeightTransfer();
    this.calcSteering(delta);
    this.applyDrag(delta);
  }
}

export { VehicleBody };