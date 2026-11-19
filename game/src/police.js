import { LAW, ROAD, WORLD } from './config.js';
import { canOccupy, closest, directions, isOnRoad, nearestLane, traceCity } from './city.js';
import { clamp, distance, range } from './random.js';
import { driveCar, makeCar, setSpeed, steerTo } from './vehicles.js';

export function createLaw() {
  return {
    heat: 0,
    floor: 0,
    unseen: 0,
    busted: 0,
    spawnIn: 0,
    blockIn: 0,
    cops: [],
    visible: false,
  };
}

export function stars(law) {
  return Math.ceil(Math.max(law.heat, law.floor) - 0.00001);
}

export function crime(state, type, minimum = 0) {
  const law = state.law;
  law.heat = clamp(Math.max(minimum, law.heat + LAW[type]), 0, 5);
  law.unseen = 0;
  law.spawnIn = Math.min(law.spawnIn, 0.7);
}

export function lockWanted(state, floor) {
  state.law.floor = floor;
  state.law.heat = Math.max(state.law.heat, floor);
}

export function clearLaw(state) {
  state.cars = state.cars.filter(car => car.role !== 'police');
  state.law = createLaw();
}

function edgeSpawns() {
  return [
    ...ROAD.columns.map(x => nearestLane(x, 19, 1)),
    ...ROAD.columns.map(x => nearestLane(x, WORLD.height - 19, 3)),
    ...ROAD.rows.map(y => nearestLane(19, y, 0)),
    ...ROAD.rows.map(y => nearestLane(WORLD.shore - 22, y, 2)),
  ];
}

export function addPatrol(state, point, block = false) {
  const cop = makeCar(point, 'sedan', '#edefdf', 'police');
  cop.block = block;
  cop.blockLife = block ? 12 : 0;
  cop.path = [];
  cop.replan = 0;
  cop.reverseFor = 0;
  cop.strobe = state.rng();
  state.law.cops.push(cop);
  state.cars.push(cop);
  if (!block) setSpeed(cop, 106);
  return cop;
}

function roomForCar(state, point) {
  return canOccupy(state.city, point.x, point.y, 18) &&
    state.cars.every(car => distance(car, point) > 45);
}

function spawnPatrol(state) {
  const options = edgeSpawns().filter(point => distance(point, state.player) > 430 && roomForCar(state, point));
  options.sort((a, b) => distance(a, state.player) - distance(b, state.player));
  if (options.length) addPatrol(state, options[0]);
}

function removePatrol(state, cop) {
  state.law.cops = state.law.cops.filter(other => other !== cop);
  state.cars = state.cars.filter(other => other !== cop);
}

function tryRoadblock(state) {
  const car = state.player.car;
  if (!car || car.speed < 65 || !isOnRoad(car.x, car.y)) return false;
  const dx = Math.cos(car.angle);
  const dy = Math.sin(car.angle);
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const ahead = { x: car.x + dx * 275, y: car.y + dy * 275 };
  const center = horizontal ? closest(ROAD.rows, car.y) : closest(ROAD.columns, car.x);
  const roadGap = Math.abs(center - (horizontal ? car.y : car.x));
  if (roadGap > ROAD.half) return false;
  const axis = horizontal ? ROAD.columns : ROAD.rows;
  const along = horizontal ? ahead.x : ahead.y;
  if (Math.abs(along - closest(axis, along)) < 62 || along < 55) return false;
  if (ahead.x > WORLD.shore - 70 || ahead.y > WORLD.height - 65) return false;
  const points = [-20, 20].map(offset => horizontal
    ? { x: ahead.x, y: center + offset, angle: Math.PI / 2 }
    : { x: center + offset, y: ahead.y, angle: 0 });
  if (points.some(point => !roomForCar(state, point))) return false;
  for (const point of points) addPatrol(state, point, true);
  return true;
}

function predictedPlayer(state, cop) {
  const player = state.player;
  const car = player.car;
  const look = clamp(distance(player, cop) / 400, 0.14, 0.78);
  return {
    x: clamp(player.x + (car?.vx ?? player.vx) * look, 18, WORLD.shore - 18),
    y: clamp(player.y + (car?.vy ?? player.vy) * look, 18, WORLD.height - 18),
  };
}

function nearestStop(point) {
  return { x: closest(ROAD.columns, point.x), y: closest(ROAD.rows, point.y) };
}

function chooseHeading(cop, stop) {
  const x = stop.x - cop.x;
  const y = stop.y - cop.y;
  const onRow = Math.abs(y) < ROAD.half;
  const onColumn = Math.abs(x) < ROAD.half;
  if (onRow && (!onColumn || Math.abs(Math.cos(cop.angle)) > 0.72)) return x >= 0 ? 0 : 2;
  if (onColumn) return y >= 0 ? 1 : 3;
  return Math.abs(x) > Math.abs(y) ? (x >= 0 ? 0 : 2) : (y >= 0 ? 1 : 3);
}

function planChase(state, cop, prediction) {
  const origin = nearestStop(cop);
  const goal = nearestStop(prediction);
  const heading = chooseHeading(cop, origin);
  const direction = directions[heading];
  const waypoint = nearestLane(origin.x, origin.y, heading);
  const here = { x: waypoint.x + direction.x * 25, y: waypoint.y + direction.y * 25 };
  const path = [];
  if (distance(cop, here) > 75 && traceCity(state.city, cop, here) > 0.98) path.push(here);
  if (goal.x !== origin.x && goal.y !== origin.y) {
    const horizontal = { x: goal.x, y: origin.y };
    const vertical = { x: origin.x, y: goal.y };
    const first = direction.x ? horizontal : vertical;
    if (distance(cop, first) > 65) path.push(first);
  }
  if (distance(cop, goal) > 57) path.push(goal);
  return path;
}

function pursue(state, cop, level, dt) {
  if (cop.block) return;
  const player = state.player;
  const prediction = predictedPlayer(state, cop);
  const close = distance(player, cop);
  const direct = close < 450 && traceCity(state.city, cop, prediction) > 0.98;
  let goal = prediction;
  if (!direct) {
    cop.replan -= dt;
    if (!cop.path.length || cop.replan <= 0) {
      cop.path = planChase(state, cop, prediction);
      cop.replan = 1.2;
    }
    while (cop.path.length && distance(cop, cop.path[0]) < 53) cop.path.shift();
    goal = cop.path[0] ?? prediction;
  }
  const top = 153 + level * 19;
  const desired = close < 92 ? clamp((close - 27) * 3.3, 0, top) : top;
  const order = steerTo(cop, goal, desired);
  if (cop.reverseFor > 0) {
    cop.reverseFor -= dt;
    driveCar(state, cop, { throttle: -0.9, steer: -order.steer }, dt);
    return;
  }
  driveCar(state, cop, order, dt);
  if (cop.speed < 18 && close > 65) cop.stuck += dt;
  else cop.stuck = 0;
  if (cop.stuck > 0.7) {
    cop.reverseFor = 0.52;
    cop.stuck = 0;
    cop.replan = 0;
  }
}

function observePlayer(state, dt) {
  const player = state.player;
  const law = state.law;
  let seen = false;
  let arrest = false;
  for (const cop of law.cops) {
    if (cop.hp <= 0) continue;
    const gap = distance(cop, player);
    if (gap > LAW.sight || traceCity(state.city, cop, player) < 0.97) continue;
    seen = true;
    if (gap < LAW.arrest && (!player.car || player.car.speed < 91)) arrest = true;
  }
  law.visible = seen;
  law.unseen = seen ? 0 : law.unseen + dt;
  if (law.unseen > LAW.delay) law.heat = Math.max(law.floor, law.heat - LAW.decay * dt);
  law.busted = clamp(law.busted + dt * (arrest ? 0.44 : -0.24), 0, 1);
  return law.busted >= 1;
}

function retirePatrols(state, level, dt) {
  for (const cop of state.law.cops) {
    if (cop.block) cop.blockLife = Math.max(0, cop.blockLife - dt);
    const staleBlock = cop.block && (level < 4 || cop.blockLife === 0);
    if (cop.hp > 0 && !staleBlock) continue;
    const gap = distance(cop, state.player);
    // A spent unit remains visible until it is clear of the player.
    if (gap < LAW.sight + 40) continue;
    removePatrol(state, cop);
  }
}

function manageFleet(state, level, dt) {
  const law = state.law;
  const cap = LAW.caps[level];
  law.spawnIn -= dt;
  law.blockIn -= dt;
  if (level >= 4 && law.blockIn <= 0 && !law.cops.some(cop => cop.block)) {
    if (law.cops.length > cap - 2) {
      const far = law.cops.filter(cop => distance(state.player, cop) > 520);
      if (far.length) removePatrol(state, far[0]);
    }
    if (law.cops.length <= cap - 2 && tryRoadblock(state)) law.blockIn = 18;
    else law.blockIn = 1;
  }
  if (law.cops.length < cap && law.spawnIn <= 0) {
    spawnPatrol(state);
    law.spawnIn = range(state.rng, 2.3, 3.5);
  }
  if (law.cops.length > cap) {
    const ordered = law.cops.slice().sort((a, b) => distance(b, state.player) - distance(a, state.player));
    for (const cop of ordered.slice(0, law.cops.length - cap)) removePatrol(state, cop);
  }
}

export function stepPolice(state, dt) {
  const level = stars(state.law);
  if (level === 0) {
    if (state.law.cops.length) clearLaw(state);
    else {
      state.law.busted = 0;
      state.law.visible = false;
    }
    return false;
  }
  retirePatrols(state, level, dt);
  manageFleet(state, level, dt);
  for (const cop of state.law.cops) {
    if (cop.hp > 0) pursue(state, cop, level, dt);
  }
  return observePlayer(state, dt);
}
