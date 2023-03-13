# Car Playground

An online environment to play around with a semi-accurately-simulated vehicle.

Currently implements semi-realistic tire modelling using the Pacejka Magic Formula, engine RPM / torque and gearing with engine braking, angular velocity / wheel slip + locking.

To-do:
  - Improve UI
  - Add particle effects for wheel slip / lock
  - Improve sound (sample instead of auto-generate, fix crackling on mobile)
  - Improve playground (heightmap?)

In active development with [three.js](https://github.com/mrdoob/three.js/) and [cannon-es](https://github.com/pmndrs/cannon-es).

Available to play online now at [https://helpvisa.github.io/car-playground/](https://helpvisa.github.io/car-playground/)!

![A preview of the car simulator in action.](./src/images/readme-preview.jpg)

If you'd like to download and setup the project yourself in a local server, either for curiosity or fiddling, make sure you've used `npm install` to acquire the necessary dependencies; you can type `npm run dev` in the root directory to start up a dev server with webpack!