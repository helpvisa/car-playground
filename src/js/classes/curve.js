// creates lookup curves to be used in the index file
class Curve { // should only take values between 0 and 1 on both axes
  constructor(points = []) {
    this.points = points;

    // sort points from lowest to highest along x axis
    this.points.sort((a, b) => {
      return a.x - b.x;
    });
  }

  // return a lerp'd value at a position on the curve
  getValueAtPos(p = 0) {
    p = Math.abs(p);
    // clamp p between 0 and 1
    p = Math.max(Math.min(1, p), 0);

    // find nearest values
    let min = 0;
    let minDiff = 1;
    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i].x === p) {
        min = this.points[i];
        break;
      } else if (this.points[i].x < p) {
        const diff = p - this.points[i].x;
        if (diff < minDiff) {
          minDiff = diff;
          min = this.points[i];
        }
      }
    }

    let max = 0;
    let maxDiff = 1;
    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i].x === p) {
        max = this.points[i];
        break;
      } else if (this.points[i].x > p) {
        const diff = this.points[i].x - p;
        if (diff < maxDiff) {
          maxDiff = diff;
          max = this.points[i];
        }
      }
    }

    // lerp between min and max at x position p
    let distBetween = max.x - min.x;
    if (distBetween === 0) {
      distBetween = 1;
    }
    const lerpRatio = (p - min.x) / distBetween;
    return min.y + lerpRatio * ( max.y - min.y );
  }
}

// test curve
let tirePoints = [
  {
    x: 0,
    y: 0,
  },
  {
    x: 0.05,
    y: 0.8
  },
  {
    x: 0.1,
    y: 0.98
  },
  {
    x: 0.15,
    y: 1
  },
  {
    x: 0.5,
    y: 0.935
  },
  {
    x: 1,
    y: 0.9
  }
]

let torquePoints = [
  {
    x: 0,
    y: 50,
  },
  {
    x: 0.33,
    y: 135,
  },
  {
    x: 0.5,
    y: 195,
  },
  {
    x: 0.67,
    y: 240,
  },
  {
    x: 0.83,
    y: 335,
  },
  {
    x: 0.92,
    y: 345,
  },
  {
    x: 0.96,
    y: 325
  },
  {
    x: 1,
    y: 300
  }
]

let pacejkaPoints = [
  {
    x: 0,
    y: 0
  },
  {
    x: 0.012,
    y: 1
  },
  {
    x: 0.25,
    y: 0.95
  },
  {
    x: 0.5,
    y: 0.9
  },
  {
    x: 0.75,
    y: 0.85
  },
  {
    x: 1,
    y: 0.8
  }
]

const slipCurve = new Curve(tirePoints);
const torqueCurve = new Curve(torquePoints);
const pacejkaCurve = new Curve(pacejkaPoints);