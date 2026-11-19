import { LANDMARKS, PED } from './config.js';
import { moveCircle } from './city.js';
import { choice, distance, range } from './random.js';

const complexions = ['#593d38', '#aa624b', '#d38c61', '#f1b987', '#8c5143'];

function makePerson(rng, point) {
  return {
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    angle: range(rng, -Math.PI, Math.PI),
    step: range(rng, 0, 9),
    pace: range(rng, 30, 54),
    color: choice(rng, PED.shirts),
    skin: choice(rng, complexions),
    route: null,
    index: 0,
    direction: rng() < 0.5 ? -1 : 1,
    panic: 0,
    danger: null,
    down: 0,
    inert: false,
    injuries: 0,
    idle: 0,
  };
}

export function populatePeople(state) {
  const loops = state.city.sidewalks;
  for (let i = 0; i < PED.count; i++) {
    const route = loops[i % loops.length];
    const start = Math.floor(state.rng() * route.length);
    const end = (start + 1) % route.length;
    const offset = state.rng();
    const point = {
      x: route[start].x + (route[end].x - route[start].x) * offset,
      y: route[start].y + (route[end].y - route[start].y) * offset,
    };
    const person = makePerson(state.rng, point);
    person.route = route;
    person.index = person.direction > 0 ? end : start;
    state.people.push(person);
  }

  for (const landmark of [LANDMARKS.depot, LANDMARKS.garage, LANDMARKS.marina, LANDMARKS.chop]) {
    state.people.push(makePerson(state.rng, { x: landmark.x + 21, y: landmark.y - 12 }));
  }
}

export function alarmPeople(state, source) {
  for (const person of state.people) {
    if (distance(person, source) > PED.hearing) continue;
    frighten(person, source, 2.9);
  }
}

function frighten(person, source, duration) {
  if (person.inert || person.down > 0) return;
  person.danger = { x: source.x, y: source.y };
  person.panic = duration;
  person.idle = 0;
}

export function knockDown(person, angle, severe) {
  if (person.inert || person.down > 0) return false;
  person.down = PED.recovery;
  person.panic = 0;
  person.injuries++;
  person.inert = severe || person.injuries >= 3;
  person.angle = angle;
  return true;
}

function follow(person, city, angle, speed, dt) {
  person.angle = angle;
  const dx = Math.cos(angle) * speed * dt;
  const dy = Math.sin(angle) * speed * dt;
  const result = moveCircle(city, person, dx, dy, PED.radius);
  if (!result.blockedX) person.vx += dx / dt;
  if (!result.blockedY) person.vy += dy / dt;
  if (!result.blockedX || !result.blockedY) person.step += dt * speed * 0.08;
  return (result.blockedX && Math.abs(dx) > 0.15) || (result.blockedY && Math.abs(dy) > 0.15);
}

function fleeStreet(state, person, dt) {
  const dx = person.x - person.danger.x;
  const dy = person.y - person.danger.y;
  const course = Math.atan2(dy, dx);
  const speed = person.pace * 2.25;
  const blocked = follow(person, state.city, course, speed, dt);
  if (!blocked) return;
  const bias = person.direction * Math.PI / 2;
  if (follow(person, state.city, course + bias, speed * 0.75, dt)) {
    follow(person, state.city, course - bias, speed * 0.75, dt);
  }
}

function patrolBlock(state, person, dt) {
  if (!person.route) return;
  if (person.idle > 0) {
    person.idle -= dt;
    return;
  }
  const target = person.route[person.index];
  if (distance(person, target) < 5) {
    const size = person.route.length;
    person.index = (person.index + person.direction + size) % size;
    if (state.rng() < 0.15) person.idle = range(state.rng, 0.4, 1.6);
    return;
  }
  const angle = Math.atan2(target.y - person.y, target.x - person.x);
  if (follow(person, state.city, angle, person.pace, dt)) {
    const fallback = person.route.findIndex(point => distance(person, point) < 26);
    if (fallback >= 0) person.index = fallback;
  }
}

function approachTraffic(state, person) {
  for (const car of state.cars) {
    if (car.speed < PED.warningSpeed) continue;
    if (distance(car, person) > 49) continue;
    const approach = (person.x - car.x) * car.vx + (person.y - car.y) * car.vy;
    if (approach > 0) frighten(person, car, 1.45);
  }
}

function resumeSidewalk(person) {
  if (!person.route) return;
  const closest = person.route.reduce((best, point, index) =>
    distance(person, point) < distance(person, person.route[best]) ? index : best, 0);
  person.index = closest;
}

export function stepPeople(state, dt, reportImpact) {
  for (const person of state.people) {
    person.vx = 0;
    person.vy = 0;
    if (person.inert) continue;
    if (person.down > 0) {
      person.down = Math.max(0, person.down - dt);
      if (person.down === 0) resumeSidewalk(person);
      continue;
    }
    for (const car of state.cars) {
      if (car.speed < 58 || distance(car, person) >= car.radius + PED.radius) continue;
      if (knockDown(person, car.angle, car.speed > 196) && car === state.player.car) reportImpact();
      break;
    }
    if (person.down > 0) continue;
    approachTraffic(state, person);
    const wasFleeing = person.panic > 0;
    person.panic = Math.max(0, person.panic - dt);
    if (person.panic > 0) fleeStreet(state, person, dt);
    else {
      if (wasFleeing) resumeSidewalk(person);
      patrolBlock(state, person, dt);
    }
  }
}
