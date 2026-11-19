import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudio } from './game/src/audio.js';
import { canOccupy, isLand, moveCircle, nearestLane } from './game/src/city.js';
import { FLEET, JOBS, LAW, PED, STEP } from './game/src/config.js';
import { neutralInput } from './game/src/input.js';
import { focusCamera, makeState, simulate } from './game/src/main.js';
import { activeBeacon, confirmMission, missionPanel, objectiveStatus, stepMission } from './game/src/missions.js';
import { alarmPeople, knockDown, stepPeople } from './game/src/people.js';
import { addPatrol, clearLaw, crime, lockWanted, stars, stepPolice } from './game/src/police.js';
import { paint } from './game/src/render.js';
import { prepareShot, readShot } from './game/src/shots.js';
import { collideCars, makeCar, setSpeed } from './game/src/vehicles.js';

function isolatedState() {
  const state = makeState(7);
  state.cars = [];
  state.people = [];
  return state;
}

function acceptJob(state) {
  assert.equal(confirmMission(state), true);
  while (state.mission.phase === 'briefing') confirmMission(state);
  assert.equal(state.mission.phase, 'pickup');
}

function collect(state, index) {
  Object.assign(state.player, JOBS[index].pickup);
  stepMission(state, STEP);
  assert.equal(state.mission.phase, 'deliver');
}

function canvasSpy() {
  const context = {};
  const methods = ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo',
    'lineTo', 'stroke', 'fill', 'arc', 'ellipse', 'roundRect', 'save', 'restore', 'translate',
    'scale', 'rotate', 'transform', 'setTransform', 'quadraticCurveTo', 'rect', 'clip', 'setLineDash'];
  for (const method of methods) {
    context[method] = (...args) => {
      for (const value of args.flat()) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${method}: finite argument`);
      }
    };
  }
  context.fillText = (text, x, y) => {
    assert.ok(text != null);
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
  };
  context.measureText = text => ({ width: text.length * 8 });
  context.createLinearGradient = () => ({ addColorStop() {} });
  return context;
}

test('capture queries validate names and normalize seeds', () => {
  assert.equal(readShot('?shot=other'), null);
  assert.deepEqual(readShot('?shot=chase&seed=bad'), { name: 'chase', seed: 7 });
  assert.deepEqual(readShot('?shot=drive&seed=-1'), { name: 'drive', seed: 4294967295 });
});

test('all capture scenes are deterministic and paint with finite canvas arguments', () => {
  for (const seed of [0, 1, 7, 21, 42]) {
    for (const name of ['start', 'drive', 'chase', 'end']) {
      const state = makeState(seed);
      const repeat = makeState(seed);
      prepareShot(state, name, { simulate, focusCamera });
      prepareShot(repeat, name, { simulate, focusCamera });
      assert.equal(JSON.stringify(state), JSON.stringify(repeat), `${name}, seed ${seed}`);
      assert.equal(state.captureReady, true);
      if (name === 'start') assert.ok(state.cars.some(car => car.speed > 0));
      if (name === 'chase') {
        assert.equal(stars(state.law), 3);
        assert.ok(state.law.busted > 0 && state.law.busted < 1);
      }
      for (const [width, height] of [[1280, 720], [800, 600], [390, 844]]) {
        paint(canvasSpy(), { width, height, ratio: 1 }, state);
      }
    }
  }
});

test('pickup starts the full timer and timeout at the destination fails', () => {
  const state = isolatedState();
  acceptJob(state);
  collect(state, 0);
  assert.equal(state.mission.time, JOBS[0].time);
  assert.equal(state.mission.attempt.elapsed, 0);
  Object.assign(state.player, JOBS[0].drop);
  state.mission.time = STEP / 2;
  stepMission(state, STEP);
  assert.equal(state.mission.phase, 'failed');
  assert.equal(state.cash, 0);
  assert.match(missionPanel(state).text, /window/);
  confirmMission(state);
  assert.equal(state.mission.phase, 'pickup');
  assert.equal(state.mission.attempts, 2);
});

test('three jobs enforce cargo, heat, retry, reward and completion rules', () => {
  const state = isolatedState();
  let total = 0;
  for (let index = 0; index < JOBS.length; index++) {
    acceptJob(state);
    assert.equal(JOBS[index].briefing.length, 4);
    assert.ok(activeBeacon(state));
    if (index === 1) {
      state.gold.hp = 0;
      stepMission(state, STEP);
      assert.equal(state.mission.phase, 'failed');
      const wreck = state.gold;
      confirmMission(state);
      assert.notEqual(state.gold, wreck);
      assert.equal(state.gold.hp, FLEET.sport.shell);
      assert.equal(state.cars.includes(wreck), false);
      Object.assign(state.player, state.gold);
      stepMission(state, STEP);
      assert.equal(state.mission.phase, 'pickup', 'standing beside the coupe is insufficient');
      state.player.car = state.gold;
      stepMission(state, STEP);
      assert.ok(state.law.heat >= 2);
      state.player.car = null;
      Object.assign(state.player, JOBS[index].drop);
      stepMission(state, STEP);
      assert.equal(state.mission.phase, 'deliver', 'the coupe must be delivered');
      assert.match(objectiveStatus(state).hint, /Return/);
      Object.assign(state.gold, JOBS[index].drop);
      state.player.car = state.gold;
    } else {
      collect(state, index);
    }
    if (index === 2) assert.equal(state.law.floor, 3);
    Object.assign(state.player, JOBS[index].drop);
    stepMission(state, STEP);
    total += JOBS[index].reward;
    assert.equal(state.cash, total);
    assert.equal(state.mission.completed, index + 1);
    assert.equal(state.law.floor, 0);
    state.player.car = null;
    stepMission(state, STEP);
    assert.equal(state.cash, total, 'reward is paid once');
  }
  assert.equal(state.screen, 'complete');
  assert.equal(state.mission.phase, 'free');
});

test('injury and arrest take precedence over the final handoff', () => {
  for (const injury of [true, false]) {
    const state = isolatedState();
    state.mission.completed = 2;
    acceptJob(state);
    collect(state, 2);
    Object.assign(state.player, JOBS[2].drop);
    state.cash = 500;
    if (injury) state.player.health = 0;
    else {
      state.law.busted = 0.999;
      addPatrol(state, { x: state.player.x - 40, y: state.player.y, angle: 0 });
    }
    simulate(state, neutralInput());
    assert.equal(state.screen, 'busted');
    assert.equal(state.mission.completed, 2);
    assert.equal(state.mission.phase, 'failed');
    assert.equal(state.cash, 500 - LAW.fine);
    assert.equal(state.law.floor, 0);
  }
});

test('car contact keeps scalar speed consistent with the collision impulse', () => {
  const state = isolatedState();
  const a = makeCar({ x: 300, y: 540 }, 'sedan', '#fff');
  const b = makeCar({ x: 322, y: 540 }, 'sedan', '#aaa');
  state.cars = [a, b];
  setSpeed(a, 120);
  collideCars(state);
  assert.equal(a.speed, Math.hypot(a.vx, a.vy));
  assert.equal(b.speed, Math.hypot(b.vx, b.vy));
  assert.ok(a.speed < 120 && b.speed > 0);
});

test('pier traversal, building collision and invalid coordinates are guarded', () => {
  const state = isolatedState();
  const walker = { x: 2140, y: 1262 };
  for (let step = 0; step < 120; step++) moveCircle(state.city, walker, 1, 0, 8);
  assert.equal(walker.x, 2260);
  assert.equal(isLand(2200, 1200, 8), false);
  assert.equal(isLand(2145, 1225, 8), false);
  assert.equal(isLand(NaN, 500, 8), false);
  assert.equal(canOccupy(state.city, Infinity, 500, 8), false);
  assert.equal(canOccupy(state.city, 350, 280, 0), false);
  const wall = { x: 320, y: 300 };
  assert.equal(moveCircle(state.city, wall, 20, 0, 8).blockedX, true);
});

test('pedestrians recover from a knockdown and retain finite motion', () => {
  const state = makeState(7);
  state.cars = [];
  const person = state.people[0];
  knockDown(person, 0, false);
  stepPeople(state, PED.recovery + STEP, () => {});
  assert.equal(person.down, 0);
  alarmPeople(state, person);
  for (let step = 0; step < 240; step++) stepPeople(state, STEP, () => {});
  assert.equal(person.panic, 0);
  assert.ok([person.x, person.y, person.vx, person.vy].every(Number.isFinite));
});

test('wanted heat holds its floor, wrecked patrols cannot arrest, and zero heat clears the meter', () => {
  const state = isolatedState();
  Object.assign(state.player, { x: 350, y: 575 });
  crime(state, 'theft');
  assert.equal(stars(state.law), 1);
  lockWanted(state, 3);
  state.law.spawnIn = 100;
  for (let step = 0; step < 600; step++) stepPolice(state, STEP);
  assert.equal(state.law.heat, 3);
  const cop = addPatrol(state, { x: 310, y: 575, angle: 0 });
  cop.hp = 0;
  state.law.busted = 0.5;
  stepPolice(state, STEP);
  assert.ok(state.law.busted < 0.5);
  clearLaw(state);
  state.law.busted = 0.5;
  stepPolice(state, STEP);
  assert.equal(state.law.busted, 0);
});

test('patrol caps and safe roadblock placement survive a sustained pursuit', () => {
  const state = isolatedState();
  const point = nearestLane(850, 890, 0, 1);
  const car = makeCar(point, 'sport', '#fff');
  state.cars.push(car);
  state.player.car = car;
  Object.assign(state.player, { x: car.x, y: car.y });
  setSpeed(car, 100);
  lockWanted(state, 4);
  stepPolice(state, STEP);
  const blocks = state.law.cops.filter(cop => cop.block);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every(cop => canOccupy(state.city, cop.x, cop.y, cop.radius)));
  for (let step = 0; step < 600; step++) {
    stepPolice(state, STEP);
    assert.ok(state.law.cops.length <= LAW.caps[4]);
  }
  assert.ok(state.law.cops.length > 0);
  assert.ok(state.law.cops.every(cop => Number.isFinite(cop.x) && Number.isFinite(cop.y)));
});

test('audio calls before the first gesture are harmless', () => {
  const audio = createAudio();
  audio.cue('shot');
  audio.cue('success');
  audio.update(makeState(7));
});
