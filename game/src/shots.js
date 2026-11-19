import { JOBS, ROAD, STEP } from './config.js';
import { closest, directions, laneExit, nearestLane } from './city.js';
import { neutralInput } from './input.js';
import { confirmMission, createMission, startBriefing, stepMission } from './missions.js';
import { addPatrol, clearLaw } from './police.js';
import { angleDelta, clamp, distance } from './random.js';
import { makeCar, setSpeed } from './vehicles.js';

const scenes = new Set(['start', 'drive', 'chase', 'end']);

export function readShot(query) {
  const parameters = new URLSearchParams(query);
  const name = parameters.get('shot');
  if (!scenes.has(name)) return null;
  const parsed = Number(parameters.get('seed') ?? 7);
  return { name, seed: Number.isFinite(parsed) ? parsed >>> 0 : 7 };
}

function positionPlayer(state, point) {
  state.player.x = point.x;
  state.player.y = point.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.car = null;
}

function clearStagingLane(state, point, radius) {
  state.cars = state.cars.filter(car => car.marked || distance(car, point) > radius);
}

function takeSceneCar(state, point, type, color) {
  clearStagingLane(state, point, 62);
  const car = makeCar(point, type, color, 'parked');
  car.stolen = true;
  car.dir = point.dir;
  car.lane = point.lane;
  state.cars.push(car);
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  return car;
}

function pilotCar(car, target, speed) {
  const control = neutralInput();
  const aim = Math.atan2(target.y - car.y, target.x - car.x);
  const error = angleDelta(car.angle, aim);
  const desired = speed * clamp(1 - Math.abs(error) * 0.4, 0.3, 1);
  control.throttle = clamp((desired - car.speed) / 32, -1, 1);
  control.steer = clamp(error * 2.5, -1, 1);
  control.limit = speed + 15;
  return control;
}

function runSteps(state, count, controller, api) {
  for (let i = 0; i < count; i++) {
    const controls = controller(state, i);
    api.simulate(state, controls, STEP);
  }
}

function sceneTitle(state, api) {
  state.screen = 'title';
  state.mission = createMission();
  state.camera = { x: 1818, y: 1165, zoom: 0.82 };
  runSteps(state, 240, () => neutralInput(), api);
  state.hasSave = false;
}

function stageCargo(state, completed, cash) {
  state.screen = 'play';
  state.mission = createMission(completed);
  state.cash = cash;
  startBriefing(state);
  while (state.mission.phase === 'briefing') confirmMission(state);
  positionPlayer(state, JOBS[completed].pickup);
  stepMission(state, STEP);
}

function nextLaneTarget(car) {
  const stop = laneExit(car.x, car.y, car.dir, car.lane);
  const direction = directions[car.dir];
  if (stop) {
    return {
      x: stop.point.x + direction.x * 58,
      y: stop.point.y + direction.y * 58,
    };
  }
  const axisEnd = [2050, 1720, 55, 50][car.dir];
  return nearestLane(direction.x ? axisEnd : car.x, direction.y ? axisEnd : car.y, car.dir, car.lane);
}

function lanePilot(state, speed) {
  const car = state.player.car;
  if (!car.captureTarget || distance(car, car.captureTarget) < 23) {
    car.captureTarget = nextLaneTarget(car);
  }
  return pilotCar(car, car.captureTarget, speed);
}

function drivePilot(state) {
  const car = state.player.car;
  const crossing = closest(ROAD.columns, car.x);
  const gap = crossing - car.x;
  // Ease up on the approach, then build speed once through the junction.
  const speed = gap > 0 && gap < 95 ? 123 : 151;
  return lanePilot(state, speed);
}

function sceneDrive(state, api) {
  stageCargo(state, 0, 240);
  const point = nearestLane(350, ROAD.rows[1], 0, 1);
  const car = takeSceneCar(state, point, 'sport', '#d66e52');
  setSpeed(car, 110);
  api.focusCamera(state, STEP, true);
  runSteps(state, 480, drivePilot, api);
  state.capture = 'drive';
}

function stageChaseCops(state, point) {
  const first = {
    x: point.x - 112,
    y: point.y - 10,
    angle: 0,
  };
  const second = {
    x: point.x - 195,
    y: point.y + 20,
    angle: 0,
  };
  clearStagingLane(state, first, 70);
  clearStagingLane(state, second, 65);
  const a = addPatrol(state, first);
  const b = addPatrol(state, second);
  setSpeed(a, 142);
  setSpeed(b, 142);
  state.law.spawnIn = 100;
}

function chasePilot(state, index) {
  if (index < 394) return lanePilot(state, 142);
  // Brake in view of the patrol and pull away before the arrest completes.
  const breakingAway = state.law.busted >= 0.72;
  return lanePilot(state, breakingAway ? 115 : 19);
}

function sceneChase(state, api) {
  stageCargo(state, 2, 1120);
  const point = nearestLane(330, ROAD.rows[3], 0, 1);
  const car = takeSceneCar(state, point, 'sedan', '#cb7357');
  setSpeed(car, 142);
  stageChaseCops(state, point);
  api.focusCamera(state, STEP, true);
  runSteps(state, 480, chasePilot, api);
  state.capture = 'chase';
}

function walkToward(state, target) {
  const control = neutralInput();
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const gap = Math.hypot(dx, dy);
  if (gap <= 4) return control;
  control.x = dx / gap;
  control.y = dy / gap;
  return control;
}

function walkGangway(state) {
  const ramp = { x: 2121, y: 1262 };
  if (state.player.x < ramp.x - 4) return walkToward(state, ramp);
  return walkToward(state, JOBS[2].drop);
}

function sceneEnd(state, api) {
  stageCargo(state, 2, 1120);
  positionPlayer(state, { x: 2047, y: 1247 });
  state.law.spawnIn = 100;
  runSteps(state, 120, walkGangway, api);
  // Completion is produced by reaching the real delivery radius.
  api.focusCamera(state, STEP, true);
  state.capture = 'end';
}

function validateCapture(state, name) {
  const { player, mission, law } = state;
  const finite = [player.x, player.y, state.camera.x, state.camera.y].every(Number.isFinite);
  if (!finite) throw new Error(`Capture ${name}: simulation produced an invalid position`);
  if (name === 'start' && state.screen !== 'title') {
    throw new Error('Capture start: title simulation left the title screen');
  }
  if (name === 'drive' || name === 'chase') {
    if (state.screen !== 'play' || !player.car || mission.phase !== 'deliver') {
      throw new Error(`Capture ${name}: driver did not survive the staged run`);
    }
  }
  if (name === 'chase' && !(law.busted > 0 && law.busted < 1 && law.cops.length >= 2)) {
    throw new Error('Capture chase: pursuit did not produce a partial arrest meter');
  }
  if (name === 'end' && (state.screen !== 'complete' || mission.completed !== JOBS.length)) {
    throw new Error('Capture end: the real ferry handoff did not finish the story');
  }
}

export function prepareShot(state, name, api) {
  clearLaw(state);
  state.persist = null;
  state.audio = null;
  switch (name) {
    case 'start':
      sceneTitle(state, api);
      break;
    case 'drive':
      sceneDrive(state, api);
      break;
    case 'chase':
      sceneChase(state, api);
      break;
    case 'end':
      sceneEnd(state, api);
      break;
    default:
      throw new Error(`Unknown capture scene: ${name}`);
  }
  validateCapture(state, name);
  state.captureReady = true;
}
