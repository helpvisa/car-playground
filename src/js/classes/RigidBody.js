// import our dependencies
const CANNON = require('cannon-es');

// basic box-shape rigidbody
class RigidBody {
  constructor() {

  }

  createBox(mass, pos, rot, size) {
    // save mass within object
    this.mass = mass;

    this.size = size;
    const cannonSize = new CANNON.Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this.shape = new CANNON.Box(cannonSize);
    this.body = new CANNON.Body({ mass: mass, shape: this.shape });

    // add to compound shape with com offset
    this.body.position.set(pos.x, pos.y, pos.z);
    this.body.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }
}

module.exports = { RigidBody };