import { createAudio } from './audio.js';
import { buildCity, canOccupy, moveCircle, traceCity } from './city.js';
import { JOBS, LAW, SAFEHOUSE, STEP, WALK, WORLD } from './config.js';
import { attachInput } from './input.js';
import { confirmMission, createMission, failMission, startBriefing, stepMission } from './missions.js';
import { alarmPeople, knockDown, populatePeople, stepPeople } from './people.js';
import { clearLaw, createLaw, crime, stepPolice } from './police.js';
import { clamp, distance, mix, mulberry32 } from './random.js';
import { paint, screenButtons } from './render.js';
import { prepareShot, readShot } from './shots.js';
import { closestEnterable, collideCars, damageCar, driveCar, findExit, populateTraffic,
  stepVehicles } from './vehicles.js';

const SAVE_KEY = 'solara-city-save';

function makePlayer(point) {
  return {
    ...point,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    car: null,
    health: WALK.health,
    ammo: WALK.magazine,
    reload: 0,
    cooldown: 0,
    recoil: 0,
    step: 0,
    aiming: false,
    invulnerable: 0,
  };
}

export function makeState(seed, saved = null) {
  const rng = mulberry32(seed);
  const city = buildCity(rng);
  const spawn = saved && canOccupy(city, saved.x, saved.y, WALK.radius) ? saved : SAFEHOUSE;
  const player = makePlayer({ x: spawn.x, y: spawn.y });
  const state = {
    seed,
    rng,
    city,
    player,
    camera: { x: player.x, y: player.y, zoom: 1 },
    people: [],
    cars: [],
    effects: [],
    traces: [],
    mission: createMission(saved?.completed),
    law: createLaw(),
    cash: saved?.cash ?? 0,
    screen: 'play',
    choice: 0,
    time: 0,
    saveIn: 4,
    toast: '',
    toastTime: 0,
    audio: null,
    persist: null,
  };
  populateTraffic(state);
  populatePeople(state);
  return state;
}

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || !Number.isInteger(data.completed)) return null;
    if (data.completed < 0 || data.completed > JOBS.length) return null;
    if (![data.cash, data.x, data.y].every(Number.isFinite) || data.cash < 0) return null;
    return data;
  } catch {
    return null;
  }
}

function storeSave(state) {
  const { player, mission, cash } = state;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      completed: mission.completed,
      cash,
      x: Math.round(player.x),
      y: Math.round(player.y),
    }));
    return true;
  } catch {
    return false;
  }
}

function notify(state, text, time = 2.4) {
  state.toast = text;
  state.toastTime = time;
}

function handleVehicleKey(state, input) {
  if (!input.enter && !input.exit) return;
  const player = state.player;
  const car = player.car;
  if (car) {
    if (car.speed > 124) {
      notify(state, 'Slow down to get out');
      return;
    }
    const point = findExit(state, car);
    if (!point) {
      notify(state, 'No room to open the door');
      return;
    }
    Object.assign(player, point);
    player.car = null;
    player.vx = 0;
    player.vy = 0;
    return;
  }
  if (!input.enter) return;
  const target = closestEnterable(state);
  if (!target) {
    notify(state, 'Move closer to a stopped car');
    return;
  }
  if (!target.stolen) {
    crime(state, 'theft', target === state.gold && state.mission.completed === 1 ? 2 : 0);
    target.stolen = true;
    alarmPeople(state, target);
  }
  target.role = 'parked';
  player.car = target;
  syncDriver(player);
  state.audio?.cue('click');
}

function syncDriver(player) {
  const car = player.car;
  player.x = car.x;
  player.y = car.y;
  player.vx = car.vx;
  player.vy = car.vy;
  player.angle = car.angle;
  player.aiming = false;
}

function walkPlayer(state, input, dt) {
  const player = state.player;
  const magnitude = Math.max(1, Math.hypot(input.x, input.y));
  player.vx = WALK.speed * input.x / magnitude;
  player.vy = WALK.speed * input.y / magnitude;
  if (input.x || input.y) {
    player.angle = Math.atan2(input.y, input.x);
    player.step += dt * 13;
    moveCircle(state.city, player, player.vx * dt, player.vy * dt, WALK.radius);
  }
  player.aiming = Boolean(input.aim);
  if (input.aim) player.angle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
}

function hitWalker(state, car) {
  const player = state.player;
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const gap = Math.hypot(dx, dy);
  const width = car.radius + WALK.radius;
  if (gap >= width) return;
  const x = gap ? dx / gap : Math.cos(car.angle);
  const y = gap ? dy / gap : Math.sin(car.angle);
  const push = width - gap + 0.12;
  moveCircle(state.city, player, x * push, y * push, WALK.radius);
  const closing = car.vx * x + car.vy * y;
  if (closing < 60 || player.invulnerable > 0) return;
  player.health = Math.max(0, player.health - Math.round(closing * 0.17));
  player.invulnerable = 0.75;
  state.effects.push({ x: player.x, y: player.y - 12, amount: 'HIT', life: 0.55 });
}

function tickWeapon(state, dt) {
  const player = state.player;
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.recoil = Math.max(0, player.recoil - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (player.reload <= 0) return;
  player.reload = Math.max(0, player.reload - dt);
  if (player.reload === 0) player.ammo = WALK.magazine;
}

function reload(state) {
  const player = state.player;
  if (player.ammo === WALK.magazine || player.reload > 0) return;
  player.reload = WALK.reload;
  state.audio?.cue('reload');
}

function rayCircle(from, to, target, radius) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const offsetX = target.x - from.x;
  const offsetY = target.y - from.y;
  const length = Math.hypot(dx, dy);
  const projection = (offsetX * dx + offsetY * dy) / length;
  const across = (offsetX * dy - offsetY * dx) / length;
  if (Math.abs(across) > radius) return Infinity;
  const first = projection - Math.sqrt(radius * radius - across * across);
  return first < 0 ? Infinity : first / length;
}

function shotContact(state, from, to) {
  let fraction = traceCity(state.city, from, to);
  let hit = null;
  let person = false;
  for (const car of state.cars) {
    const impact = rayCircle(from, to, car, car.radius);
    if (impact >= fraction) continue;
    fraction = impact;
    hit = car;
  }
  for (const ped of state.people) {
    if (ped.inert || ped.down > 0) continue;
    const impact = rayCircle(from, to, ped, 7);
    if (impact >= fraction) continue;
    fraction = impact;
    hit = ped;
    person = true;
  }
  return { fraction, hit, person };
}

function fire(state) {
  const player = state.player;
  if (player.cooldown > 0 || player.reload > 0) return;
  if (!player.ammo) {
    reload(state);
    return;
  }
  player.ammo--;
  player.cooldown = WALK.cooldown;
  player.recoil = 0.12;
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  const from = { x: player.x + dx * 10, y: player.y + dy * 10 };
  const to = { x: from.x + dx * WALK.range, y: from.y + dy * WALK.range };
  const contact = shotContact(state, from, to);
  if (contact.person) knockDown(contact.hit, player.angle, true);
  else if (contact.hit) damageCar(state, contact.hit, 18);
  state.traces.push({
    from,
    to: { x: mix(from.x, to.x, contact.fraction), y: mix(from.y, to.y, contact.fraction) },
    life: 0.11,
  });
  crime(state, 'shooting');
  alarmPeople(state, player);
  state.audio?.cue('shot');
}

function updatePlayer(state, input, dt) {
  const player = state.player;
  tickWeapon(state, dt);
  handleVehicleKey(state, input);
  if (player.car) {
    driveCar(state, player.car, input, dt);
    syncDriver(player);
    return;
  }
  walkPlayer(state, input, dt);
  if (input.reload) reload(state);
  if (input.fire) fire(state);
}

function tickEffects(state, dt) {
  for (const effect of state.effects) {
    effect.life -= dt;
    effect.y -= dt * 19;
  }
  for (const trace of state.traces) trace.life -= dt;
  state.effects = state.effects.filter(effect => effect.life > 0);
  state.traces = state.traces.filter(trace => trace.life > 0);
  state.toastTime = Math.max(0, state.toastTime - dt);
}

function markBusted(state) {
  const injury = state.player.health <= 0;
  failMission(state, injury ? 'Kio couldn’t finish the run.' : 'The patrol took the cargo.');
  if (state.mission.phase !== 'failed') state.audio?.cue('fail');
  state.screen = 'busted';
  state.fine = Math.min(LAW.fine, state.cash);
  state.cash -= state.fine;
}

function respawn(state) {
  clearLaw(state);
  state.player = makePlayer(SAFEHOUSE);
  focusCamera(state, STEP, true);
  state.screen = 'play';
  state.persist?.();
}

export function focusCamera(state, dt, immediate = false) {
  const { player, camera } = state;
  const look = player.car ? 0.59 : 0.17;
  const x = clamp(player.x + player.vx * look, 0, WORLD.width);
  const y = clamp(player.y + player.vy * look, 0, WORLD.height);
  const zoom = player.car ? 1.31 - Math.min(0.22, player.car.speed / 1200) : 1.43;
  const blend = immediate ? 1 : 1 - Math.exp(-dt * 4.8);
  camera.x = mix(camera.x, x, blend);
  camera.y = mix(camera.y, y, blend);
  camera.zoom = mix(camera.zoom, zoom, blend);
}

export function simulate(state, input, dt = STEP) {
  state.time += dt;
  tickEffects(state, dt);
  if (state.screen === 'title') {
    stepVehicles(state, dt);
    collideCars(state);
    stepPeople(state, dt, () => {});
    return;
  }
  if (state.screen !== 'play') return;
  if (state.mission.phase === 'briefing') return;
  updatePlayer(state, input, dt);
  stepVehicles(state, dt);
  const caught = stepPolice(state, dt);
  collideCars(state);
  if (state.player.car) syncDriver(state.player);
  else for (const car of state.cars) hitWalker(state, car);
  stepPeople(state, dt, () => crime(state, 'impact'));
  if (caught || state.player.health <= 0) {
    markBusted(state);
    state.persist?.();
    return;
  }
  stepMission(state, dt);
  focusCamera(state, dt);
  if (state.screen === 'play') autosave(state, dt);
}

function autosave(state, dt) {
  state.saveIn -= dt;
  if (state.saveIn <= 0) {
    state.saveIn = 4;
    state.persist?.();
  }
}

function getView(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelsWide = Math.max(1, Math.round(width * ratio));
  const pixelsHigh = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
  if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
  return { width, height, ratio };
}

function actionAt(view, state, click) {
  if (!click) return null;
  return screenButtons(view, state).find(button =>
    click.x >= button.x && click.x <= button.x + button.w &&
    click.y >= button.y && click.y <= button.y + button.h,
  )?.action;
}

function menuAction(state, input, view) {
  const clicked = actionAt(view, state, input.click);
  if (state.screen === 'title' && state.hasSave && input.alternate) state.choice = 1 - state.choice;
  if (clicked) return clicked;
  if (input.pause && state.screen === 'pause') return 'resume';
  if (!input.confirm) return null;
  if (state.screen === 'title') return state.hasSave && state.choice === 1 ? 'continue' : 'start';
  if (state.screen === 'pause') return 'resume';
  if (state.screen === 'busted') return 'respawn';
  if (state.screen === 'complete') return 'roam';
  if (state.screen === 'play') return 'job';
  return null;
}

function pointerToWorld(state, view, pointer) {
  if (!pointer) return null;
  return {
    x: state.camera.x + (pointer.x - view.width / 2) / state.camera.zoom,
    y: state.camera.y + (pointer.y - view.height / 2) / state.camera.zoom,
  };
}

function startBrowser() {
  const canvas = document.querySelector('#play');
  const ctx = canvas.getContext('2d');
  const shot = readShot(location.search);
  const audio = createAudio();
  const seed = shot?.seed ?? 7;
  let state = makeState(seed);
  const input = attachInput(canvas, () => {
    if (!shot) audio.activate();
  });
  state.screen = 'title';
  state.hasSave = Boolean(readSave());
  state.audio = audio;
  state.camera = { x: 1835, y: 1145, zoom: 0.81 };
  if (shot) prepareShot(state, shot.name, { simulate, focusCamera });

  function launch(continuing) {
    const saved = continuing ? readSave() : null;
    state = makeState(seed, saved);
    state.audio = audio;
    state.persist = () => storeSave(state);
    focusCamera(state, STEP, true);
    if (!saved) startBriefing(state);
    else audio.cue('click');
    state.persist();
  }

  function applyAction(action) {
    switch (action) {
      case 'start': launch(false); break;
      case 'continue': launch(true); break;
      case 'resume': state.screen = 'play'; break;
      case 'respawn': respawn(state); break;
      case 'roam': state.screen = 'play'; break;
      case 'job': confirmMission(state); break;
    }
  }

  function step(view) {
    const controls = input.sample();
    const action = menuAction(state, controls, view);
    if (action) {
      applyAction(action);
      return;
    }
    if (controls.pause && state.screen === 'play') {
      state.screen = 'pause';
      state.persist?.();
      audio.cue('click');
      return;
    }
    controls.aim = pointerToWorld(state, view, controls.pointer);
    simulate(state, controls);
  }

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const view = getView(canvas);
    if (!shot) {
      accumulator += clamp((now - last) / 1000, 0, 0.1);
      while (accumulator >= STEP) {
        step(view);
        accumulator -= STEP;
      }
      audio.update(state);
    }
    last = now;
    ctx.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
    paint(ctx, view, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') startBrowser();
