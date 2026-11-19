import { FLEET, GOLD_CAR, ROAD, TRAFFIC, WORLD } from './config.js';
import { canOccupy, closest, directions, laneExit, moveCircle, nearestLane, randomRoadPoint } from './city.js';
import { angleDelta, choice, clamp, distance, range } from './random.js';

export function makeCar(point, type, color, role = 'parked') {
  return {
    ...point,
    angle: point.angle ?? 0,
    type,
    color,
    role,
    vx: 0,
    vy: 0,
    speed: 0,
    steering: 0,
    hp: FLEET[type].shell,
    radius: FLEET[type].height * 0.63,
    route: null,
    cruise: 0,
    hitDelay: 0,
    stolen: false,
    retired: false,
    stuck: 0,
  };
}

const models = ['sedan', 'sedan', 'van', 'sport', 'taxi'];

function randomCar(rng, point, role) {
  const type = choice(rng, models);
  const color = type === 'taxi' ? '#e7ad41' : choice(rng, TRAFFIC.palette);
  return makeCar(point, type, color, role);
}

export function resetGoldCar(state) {
  const old = state.gold;
  if (old) {
    state.cars = state.cars.filter(car => car !== old);
    if (state.player.car === old) state.player.car = null;
  }
  const gold = makeCar(GOLD_CAR, 'sport', '#f4c84d', 'parked');
  gold.marked = true;
  state.gold = gold;
  state.cars.push(gold);
}

export function populateTraffic(state) {
  resetGoldCar(state);
  for (let i = 0; i < TRAFFIC.moving * 5; i++) {
    if (state.cars.length > TRAFFIC.moving) break;
    const point = randomRoadPoint(state.rng);
    if (state.cars.some(car => distance(car, point) < 53)) continue;
    if (!laneExit(point.x, point.y, point.dir, point.lane)) continue;
    const car = randomCar(state.rng, point, 'traffic');
    car.cruise = range(state.rng, 83, 144);
    setSpeed(car, car.cruise * 0.7);
    state.cars.push(car);
  }

  let parked = 0;
  for (let i = 0; i < TRAFFIC.parked * 8 && parked < TRAFFIC.parked; i++) {
    const point = curbPoint(state.rng);
    if (!point || !canOccupy(state.city, point.x, point.y, 14)) continue;
    if (distance(point, state.player) < 66) continue;
    if (state.cars.some(car => distance(car, point) < 48)) continue;
    state.cars.push(randomCar(state.rng, point, 'parked'));
    parked++;
  }
}

function curbPoint(rng) {
  const point = randomRoadPoint(rng);
  const heading = directions[point.dir];
  const offset = 45 - ROAD.lanes[point.lane];
  const x = point.x - heading.y * offset;
  const y = point.y + heading.x * offset;
  const crossing = heading.x ? closest(ROAD.columns, x) : closest(ROAD.rows, y);
  if (Math.abs(crossing - (heading.x ? x : y)) < 86) return null;
  return { x, y, angle: point.angle };
}

export function setSpeed(car, speed) {
  car.speed = Math.abs(speed);
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
}

export function damageCar(state, car, amount) {
  if (car.hitDelay > 0 || amount < 4) return;
  car.hp = Math.max(0, car.hp - amount);
  car.hitDelay = 0.3;
  state.effects.push({ x: car.x, y: car.y - 14, life: 0.7, amount: Math.round(amount) });
  if (car === state.player.car && car.hp <= 0) {
    state.player.health = Math.max(0, state.player.health - amount * 0.46);
  }
}

function approach(current, target, change) {
  return current + clamp(target - current, -change, change);
}

export function driveCar(state, car, control, dt) {
  const tuning = FLEET[car.type];
  const headingX = Math.cos(car.angle);
  const headingY = Math.sin(car.angle);
  let forward = car.vx * headingX + car.vy * headingY;
  let sideways = -car.vx * headingY + car.vy * headingX;
  const throttle = control.throttle ?? 0;
  const limit = control.limit ?? tuning.top;
  const motor = car.hp > 0 ? 1 : 0.25;
  if (throttle < 0 && forward > 7) {
    forward = Math.max(0, forward - TRAFFIC.brake * -throttle * dt);
  } else if (throttle !== 0) {
    forward += tuning.accel * throttle * motor * dt;
  }
  if (!throttle) forward *= Math.exp(-1.45 * dt);
  if (control.brake) forward *= Math.exp(-3.7 * dt);
  forward = clamp(forward, -TRAFFIC.reverse, limit * motor);
  car.steering = approach(car.steering, control.steer ?? 0, dt * 9);
  const steeringPower = clamp(Math.abs(forward) / 72, 0, 1);
  const loss = control.brake ? 1.32 : 1 - 0.30 * clamp(Math.abs(forward) / tuning.top, 0, 1);
  const yaw = car.steering * tuning.steer * steeringPower * loss * Math.sign(forward) * dt;
  car.angle += yaw;
  sideways = (sideways - forward * yaw) * Math.exp(-tuning.grip * (control.brake ? 0.25 : 1) * dt);
  const co = Math.cos(car.angle);
  const si = Math.sin(car.angle);
  car.vx = co * forward - si * sideways;
  car.vy = si * forward + co * sideways;
  moveVehicle(state, car, dt);
}

function moveVehicle(state, car, dt) {
  const incoming = Math.hypot(car.vx, car.vy);
  const collision = moveCircle(state.city, car, car.vx * dt, car.vy * dt, car.radius);
  if (collision.blockedX) car.vx *= -0.28;
  if (collision.blockedY) car.vy *= -0.28;
  if (collision.blockedX || collision.blockedY) damageCar(state, car, (incoming - 33) * 0.10);
  car.speed = Math.hypot(car.vx, car.vy);
}

function hasContinuation(stop, dir) {
  const heading = directions[dir];
  if (heading.x > 0) return stop.x < ROAD.columns.at(-1);
  if (heading.x < 0) return stop.x > ROAD.columns[0];
  if (heading.y > 0) return stop.y < ROAD.rows.at(-1);
  return stop.y > ROAD.rows[0];
}

function laneAtIntersection(stop, dir, lane, shift) {
  const heading = directions[dir];
  const point = nearestLane(stop.x, stop.y, dir, lane);
  return { x: point.x + heading.x * shift, y: point.y + heading.y * shift };
}

function planTraffic(state, car) {
  const stop = laneExit(car.x, car.y, car.dir, car.lane);
  if (!stop) return recoverTraffic(state, car);
  const straight = car.dir;
  const turns = [(straight + 1) % 4, (straight + 3) % 4];
  const feasible = turns.filter(dir => hasContinuation(stop, dir));
  let next = straight;
  if (!hasContinuation(stop, straight) || state.rng() < TRAFFIC.turnChance) {
    next = feasible.length ? choice(state.rng, feasible) : (straight + 2) % 4;
  }
  const path = next === straight
    ? [laneAtIntersection(stop, straight, car.lane, 53)]
    : [laneAtIntersection(stop, straight, car.lane, -45), laneAtIntersection(stop, next, car.lane, 57)];
  car.route = { path, next, bend: next !== straight };
}

function recoverTraffic(state, car) {
  for (let i = 0; i < 18; i++) {
    const point = randomRoadPoint(state.rng);
    if (distance(state.player, point) < 680) continue;
    if (!laneExit(point.x, point.y, point.dir, point.lane)) continue;
    if (state.cars.some(other => other !== car && distance(point, other) < 52)) continue;
    Object.assign(car, point);
    car.route = null;
    car.stuck = 0;
    setSpeed(car, car.cruise * 0.6);
    return;
  }
}

function projectedObstacle(car, obstacle, width, limit) {
  const dx = obstacle.x - car.x;
  const dy = obstacle.y - car.y;
  const co = Math.cos(car.angle);
  const si = Math.sin(car.angle);
  const forward = co * dx + si * dy;
  const across = Math.abs(-si * dx + co * dy);
  if (forward > 2 && forward < limit && across < width) return forward;
  return limit;
}

function safeTrafficSpeed(state, car) {
  const reach = 44 + car.speed * 0.59;
  let speed = car.cruise;
  for (const other of state.cars) {
    if (other === car) continue;
    const gap = projectedObstacle(car, other, car.radius + other.radius - 6, reach);
    if (gap === reach) continue;
    const forward = other.vx * Math.cos(car.angle) + other.vy * Math.sin(car.angle);
    // Allow a moving queue to keep rolling while leaving space behind the lead car.
    const buffer = 8 + car.speed * 0.2;
    const spacing = Math.max(0, gap - car.radius - other.radius - buffer);
    speed = Math.min(speed, Math.max(0, forward) + spacing * 1.65);
  }
  if (!state.player.car) speed = Math.min(speed, crossingSpeed(car, state.player, 19, reach));
  for (const ped of state.people) {
    if (ped.down > 0 || ped.inert) continue;
    speed = Math.min(speed, crossingSpeed(car, ped, 15, reach));
    const ahead = { x: ped.x + (ped.vx ?? 0) * 0.45, y: ped.y + (ped.vy ?? 0) * 0.45 };
    speed = Math.min(speed, crossingSpeed(car, ahead, 15, reach));
  }
  return speed;
}

function crossingSpeed(car, person, width, reach) {
  const gap = projectedObstacle(car, person, width, reach);
  return gap === reach ? car.cruise : clamp((gap - 28) * 2.05, 0, car.cruise);
}

export function steerTo(car, target, speed) {
  const angle = Math.atan2(target.y - car.y, target.x - car.x);
  const error = angleDelta(car.angle, angle);
  const desired = speed * clamp(1 - Math.abs(error) * 0.39, 0.25, 1);
  return {
    throttle: clamp((desired - car.speed) / 34, -1, 1),
    steer: clamp(error * 2.6, -1, 1),
    limit: Math.max(35, desired + 18),
  };
}

function updateTraffic(state, car, dt) {
  if (!car.route) planTraffic(state, car);
  if (!car.route) return;
  let target = car.route.path[0];
  if (distance(car, target) < 23) {
    car.route.path.shift();
    if (!car.route.path.length) {
      car.dir = car.route.next;
      car.route = null;
      return;
    }
    target = car.route.path[0];
  }
  let speed = safeTrafficSpeed(state, car);
  if (car.route.bend && distance(car, target) < 120) speed = Math.min(speed, 68);
  driveCar(state, car, steerTo(car, target, speed), dt);
  if (car.speed < 12) car.stuck += dt;
  else car.stuck = Math.max(0, car.stuck - dt * 2);
  if (car.stuck > 5) recoverTraffic(state, car);
}

function rollParkedCar(state, car, dt) {
  if (car.speed < 0.6 && Math.abs(car.vx) + Math.abs(car.vy) < 0.6) return;
  car.vx *= Math.exp(-3.6 * dt);
  car.vy *= Math.exp(-3.6 * dt);
  moveVehicle(state, car, dt);
}

export function stepVehicles(state, dt) {
  for (const car of state.cars) {
    car.hitDelay = Math.max(0, car.hitDelay - dt);
    if (car === state.player.car || car.role === 'police') continue;
    if (car.role === 'traffic') updateTraffic(state, car, dt);
    else rollParkedCar(state, car, dt);
  }
}

function nudge(state, car, x, y) {
  if (!canOccupy(state.city, car.x + x, car.y + y, car.radius)) return;
  car.x += x;
  car.y += y;
}

function solveCarContact(state, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const separation = Math.hypot(dx, dy);
  const radius = a.radius + b.radius + 3;
  if (separation >= radius) return;
  const nx = separation ? dx / separation : 1;
  const ny = separation ? dy / separation : 0;
  const push = (radius - separation) * 0.51;
  nudge(state, a, -nx * push, -ny * push);
  nudge(state, b, nx * push, ny * push);
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return;
  const impulse = closing * 0.63;
  a.vx -= nx * impulse;
  a.vy -= ny * impulse;
  b.vx += nx * impulse;
  b.vy += ny * impulse;
  refreshSpeed(a);
  refreshSpeed(b);
  damageCar(state, a, (closing - 35) * 0.14);
  damageCar(state, b, (closing - 35) * 0.14);
}

function refreshSpeed(car) {
  car.speed = Math.hypot(car.vx, car.vy);
}

export function collideCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 36 || Math.abs(a.y - b.y) > 36) continue;
      solveCarContact(state, a, b);
    }
  }
}

export function closestEnterable(state) {
  let best = null;
  let gap = 39;
  for (const car of state.cars) {
    if (car.speed > 85 || car.role === 'police' || car.hp <= 0) continue;
    const length = distance(state.player, car);
    if (length >= gap) continue;
    gap = length;
    best = car;
  }
  return best;
}

export function findExit(state, car) {
  for (const angle of [car.angle + Math.PI / 2, car.angle - Math.PI / 2, car.angle + Math.PI]) {
    const x = car.x + Math.cos(angle) * 31;
    const y = car.y + Math.sin(angle) * 31;
    if (x > WORLD.width || !canOccupy(state.city, x, y, 8)) continue;
    if (state.cars.some(other => other !== car && distance({ x, y }, other) < other.radius + 9)) continue;
    return { x, y };
  }
  return null;
}
