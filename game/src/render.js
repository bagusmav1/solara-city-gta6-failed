import { FLEET, LANDMARKS, PIER, ROAD, WALK, WORLD } from './config.js';
import { activeBeacon, missionPanel, objectiveStatus } from './missions.js';
import { stars } from './police.js';
import { clamp, distance } from './random.js';

const C = {
  ink: '#163d42',
  light: '#fff0cd',
  aqua: '#72e0ce',
  orange: '#ee8755',
  red: '#f06c5b',
  muted: '#adc5bb',
};

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function circle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function label(ctx, text, x, y, size, color = C.light, weight = 600, align = 'left') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function panel(ctx, x, y, w, h, alpha = 0.90) {
  rect(ctx, x, y, w, h, `rgba(15, 43, 47, ${alpha})`);
  rect(ctx, x, y, 3, h, C.aqua);
}

function rounded(ctx, x, y, w, h, radius, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function wrap(ctx, text, x, y, width, size = 16, color = C.light, spacing = 24) {
  ctx.font = `500 ${size}px system-ui, sans-serif`;
  let current = '';
  let row = y;
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > width && current) {
      label(ctx, current, x, row, size, color, 500);
      row += spacing;
      current = word;
    } else current = candidate;
  }
  label(ctx, current, x, row, size, color, 500);
  return row;
}

// Ground layers are painted in a strict order so the pier stays above the water.
function drawWater(ctx, state) {
  rect(ctx, -2500, -2500, 8000, 7000, '#349eaa');
  const gradient = ctx.createLinearGradient(WORLD.shore, 0, WORLD.width, 0);
  gradient.addColorStop(0, '#68c5b8');
  gradient.addColorStop(1, '#247f92');
  rect(ctx, WORLD.shore, 0, WORLD.width - WORLD.shore + 700, WORLD.height, gradient);
  for (let y = 0; y < WORLD.height; y += 39) {
    for (let x = 2160; x < WORLD.width + 400; x += 83) {
      const offset = Math.sin(state.time * 0.7 + y * 0.05 + x) * 8;
      line(ctx, [[x + offset, y], [x + 26 + offset, y - 2]], '#97d9c555', 1.7);
    }
  }
}

function drawGround(ctx, state) {
  drawWater(ctx, state);
  rect(ctx, 0, 0, WORLD.shore, WORLD.height, '#d9c799');
  rect(ctx, WORLD.shore - 20, 0, 50, WORLD.height, '#efd7a4');
  line(ctx, [[2147, 0], [2147, 1226]], '#fff0c9aa', 3);
  line(ctx, [[2147, 1302], [2147, 1800]], '#fff0c9aa', 3);
  for (const block of state.city.blocks) {
    rect(ctx, block.x, block.y, block.w, block.h, '#e5d7b7');
    ctx.strokeStyle = '#b5b397';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(block.x + 2, block.y + 2, block.w - 4, block.h - 4);
  }
  drawRoads(ctx);
  for (const park of state.city.parks) drawPark(ctx, park, state.time);
  drawPier(ctx);
}

function drawRoads(ctx) {
  for (const x of ROAD.columns) rect(ctx, x - 48, 0, 96, WORLD.height, '#63706c');
  for (const y of ROAD.rows) rect(ctx, 0, y - 48, WORLD.shore, 96, '#63706c');
  ctx.setLineDash([13, 17]);
  for (const x of ROAD.columns) {
    line(ctx, [[x - 24, 0], [x - 24, WORLD.height]], '#cad0ac88');
    line(ctx, [[x + 24, 0], [x + 24, WORLD.height]], '#cad0ac88');
  }
  for (const y of ROAD.rows) {
    line(ctx, [[0, y - 24], [WORLD.shore, y - 24]], '#cad0ac88');
    line(ctx, [[0, y + 24], [WORLD.shore, y + 24]], '#cad0ac88');
  }
  ctx.setLineDash([]);
  for (const x of ROAD.columns) {
    line(ctx, [[x - 2, 0], [x - 2, WORLD.height]], '#efd199', 1.4);
    line(ctx, [[x + 2, 0], [x + 2, WORLD.height]], '#efd199', 1.4);
  }
  for (const y of ROAD.rows) {
    line(ctx, [[0, y - 2], [WORLD.shore, y - 2]], '#efd199', 1.4);
    line(ctx, [[0, y + 2], [WORLD.shore, y + 2]], '#efd199', 1.4);
  }
  for (const x of ROAD.columns) {
    for (const y of ROAD.rows) {
      rect(ctx, x - 47, y - 47, 94, 94, '#63706c');
      drawCrosswalk(ctx, x, y);
    }
  }
}

function drawCrosswalk(ctx, x, y) {
  for (let offset = -37; offset < 40; offset += 11) {
    rect(ctx, x + offset, y - 47, 6, 13, '#e6ddba');
    rect(ctx, x + offset, y + 34, 6, 13, '#e6ddba');
    rect(ctx, x - 47, y + offset, 13, 6, '#e6ddba');
    rect(ctx, x + 34, y + offset, 13, 6, '#e6ddba');
  }
}

function drawPark(ctx, park, time) {
  const { x, y, w, h } = park;
  rect(ctx, x, y, w, h, park.paved ? '#d0b995' : '#9bb780');
  rect(ctx, x + w * 0.46, y, w * 0.08, h, '#e7d7b3');
  rect(ctx, x, y + h * 0.46, w, h * 0.08, '#e7d7b3');
  if (park.paved) {
    circle(ctx, x + w / 2 + 4, y + h / 2 + 5, 29, '#293d3630');
    circle(ctx, x + w / 2, y + h / 2, 29, '#ede1bc');
    circle(ctx, x + w / 2, y + h / 2, 23, '#68b3ab');
    circle(ctx, x + w / 2, y + h / 2, 9 + Math.sin(time * 2) * 2, '#bce8d1');
    label(ctx, 'KITE PLAZA', x + w / 2, y + h - 15, 10, '#647766', 800, 'center');
  }
}

function drawPier(ctx) {
  rect(ctx, PIER.x + 4, PIER.y + 7, PIER.w, PIER.h, '#155c6b66');
  rect(ctx, PIER.x, PIER.y, PIER.w, PIER.h, '#b89060');
  for (let x = PIER.x; x < PIER.x + PIER.w; x += 9) {
    line(ctx, [[x, PIER.y + 2], [x, PIER.y + PIER.h - 2]], '#7f6946', 1);
  }
  line(ctx, [[PIER.x, PIER.y + 2], [2320, PIER.y + 2]], '#ecd09b', 3);
  line(ctx, [[PIER.x, PIER.y + 64], [2320, PIER.y + 64]], '#ecd09b', 3);
  for (let x = 2160; x < 2330; x += 45) {
    rect(ctx, x, PIER.y - 4, 6, 9, '#765b40');
    rect(ctx, x, PIER.y + 61, 6, 9, '#765b40');
  }
  ctx.save();
  ctx.translate(2285, 1322);
  ctx.rotate(-0.2);
  rounded(ctx, -38, -16, 76, 32, 15, '#f4e5ba');
  rounded(ctx, -18, -11, 31, 22, 5, '#425f65');
  rect(ctx, -37, -7, 8, 14, '#334e50');
  ctx.restore();
}

function visible(view, state, object, padding = 140) {
  const halfWidth = view.width / (2 * state.camera.zoom) + padding;
  const halfHeight = view.height / (2 * state.camera.zoom) + padding;
  return Math.abs(object.x - state.camera.x) < halfWidth &&
    Math.abs(object.y - state.camera.y) < halfHeight;
}

function drawBuilding(ctx, building) {
  const { x, y, w, h, depth } = building;
  rect(ctx, x + 9, y + 12, w, h, '#223b3833');
  rect(ctx, x, y + depth, w, h - depth, '#9c8169');
  rect(ctx, x, y, w, h - depth, building.color);
  ctx.strokeStyle = building.trim;
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - depth - 6);
  for (let wx = x + 11; wx < x + w - 8; wx += 19) {
    rect(ctx, wx, y + h - depth + 3, 9, 6, '#476d70');
    rect(ctx, wx, y + 10, 8, 5, '#637f7a88');
  }
  if (building.style === 'solar') {
    for (let i = 0; i < Math.floor(w / 36); i++) {
      rect(ctx, x + 12 + i * 28, y + h * 0.33, 21, 15, '#527d83');
      line(ctx, [[x + 13 + i * 28, y + h * 0.33 + 7],
        [x + 32 + i * 28, y + h * 0.33 + 7]], '#a4c2b1', 1);
    }
  } else {
    rect(ctx, x + 13, y + 24, 23, 15, '#b2a48d');
    rect(ctx, x + 16, y + 26, 17, 10, '#7c8078');
    circle(ctx, x + 24, y + 31, 4, '#bcbba2');
  }
  if (building.name) {
    const size = building.name.length > 14 ? 10 : 12;
    const center = x + w / 2;
    rect(ctx, x + 5, y + h * 0.60 - 13, w - 10, 24, '#24464be8');
    label(ctx, building.name.toUpperCase(), center, y + h * 0.60 + 3, size, '#fff0ce', 800, 'center');
  }
}

function palm(ctx, prop) {
  const scale = prop.scale ?? 1;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.scale(scale, scale);
  ctx.save();
  ctx.transform(1, 0.3, 0.45, 0.45, 17, 19);
  for (let i = 0; i < 7; i++) {
    ctx.rotate(Math.PI * 2 / 7);
    ctx.beginPath();
    ctx.ellipse(11, 0, 18, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#284b3433';
    ctx.fill();
  }
  ctx.restore();
  line(ctx, [[1, 7], [0, -13], [3, -23]], '#9e7851', 4);
  ctx.translate(3, -23);
  ctx.rotate(prop.angle ?? 0);
  for (let i = 0; i < 7; i++) {
    ctx.rotate(Math.PI * 2 / 7);
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.quadraticCurveTo(12, -13, 29, 2);
    ctx.quadraticCurveTo(12, 5, 0, 0);
    ctx.fillStyle = i % 2 ? '#4c8d69' : '#39785b';
    ctx.fill();
    line(ctx, [[0, 0], [23, 1]], '#87a46c', 1);
  }
  circle(ctx, 0, 0, 3, '#bec37d');
  ctx.restore();
}

function drawProp(ctx, prop) {
  if (prop.type === 'palm') return palm(ctx, prop);
  const { x, y } = prop;
  if (prop.type === 'bench') {
    rect(ctx, x - 10, y, 23, 7, '#8d7151');
    line(ctx, [[x - 8, y - 3], [x + 10, y - 3]], '#b59460', 3);
  }
  if (prop.type === 'crate') {
    rect(ctx, x + 2, y + 3, 14, 14, '#214d4633');
    rect(ctx, x, y, 14, 14, '#b18a58');
    ctx.strokeStyle = '#dfba7f';
    ctx.strokeRect(x + 2, y + 2, 10, 10);
    line(ctx, [[x + 2, y + 2], [x + 12, y + 12]], '#dfba7f');
  }
  if (prop.type === 'lamp') {
    circle(ctx, x + 5, y + 6, 4, '#28483d33');
    line(ctx, [[x, y], [x, y - 19], [x + 5, y - 23]], '#4b6862', 2);
    circle(ctx, x + 5, y - 23, 3, '#ffe4a0');
  }
}

function drawCar(ctx, car, time) {
  const spec = FLEET[car.type];
  const w = spec.width;
  const h = spec.height;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  rounded(ctx, -w / 2 + 3, -h / 2 + 4, w, h, 4, '#233d3b55');
  rect(ctx, -w / 2 + 5, -h / 2 - 2, 7, 4, '#263735');
  rect(ctx, -w / 2 + 5, h / 2 - 2, 7, 4, '#263735');
  rect(ctx, w / 2 - 13, -h / 2 - 2, 7, 4, '#263735');
  rect(ctx, w / 2 - 13, h / 2 - 2, 7, 4, '#263735');
  rounded(ctx, -w / 2, -h / 2, w, h, 4, car.color);
  rounded(ctx, -8, -h / 2 + 2, 17, h - 4, 3, '#385b63');
  rect(ctx, -5, -h / 2 + 3, 10, h - 6, car.color);
  line(ctx, [[9, -h / 2 + 3], [11, h / 2 - 3]], '#a9d4cd', 2);
  rect(ctx, w / 2 - 3, -h / 2 + 2, 3, 4, '#fff1b5');
  rect(ctx, w / 2 - 3, h / 2 - 6, 3, 4, '#fff1b5');
  rect(ctx, -w / 2, -h / 2 + 2, 2, 3, '#a73f3b');
  rect(ctx, -w / 2, h / 2 - 5, 2, 3, '#a73f3b');
  if (car.role === 'police') drawLightbar(ctx, time + car.strobe);
  if (car.type === 'taxi') rect(ctx, -2, -4, 7, 8, '#eadb9a');
  if (car.hp < spec.shell * 0.45) drawSmoke(ctx, time, w);
  ctx.restore();
}

function drawLightbar(ctx, time) {
  rect(ctx, -2, -9, 5, 18, '#203c48');
  const phase = Math.floor(time * 8) % 2;
  rect(ctx, -2, -8, 5, 7, phase ? '#fd5f58' : '#90414a');
  rect(ctx, -2, 1, 5, 7, phase ? '#407b9d' : '#79bfff');
  circle(ctx, 0, phase ? -5 : 5, 13, phase ? '#ff5b4b24' : '#6db5ff24');
}

function drawSmoke(ctx, time, width) {
  for (let i = 0; i < 3; i++) {
    const cycle = (time * 1.8 + i * 0.33) % 1;
    circle(ctx, width / 2 - 3 - cycle * 15, -cycle * 18, 3 + cycle * 5, '#52615c66');
  }
}

function drawPerson(ctx, person, player = false) {
  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(person.angle);
  const fallen = person.down > 0 || person.inert;
  const legs = fallen ? 0 : Math.sin(person.step) * 2;
  if (fallen) {
    rounded(ctx, -10, -3, 16, 7, 3, person.color);
    circle(ctx, 8, 0, 3, person.skin);
    line(ctx, [[-7, -2], [-14, -4]], '#465252', 3);
    line(ctx, [[-7, 2], [-13, 6]], '#465252', 3);
  } else {
    circle(ctx, 2, 3, 7, '#193d3533');
    line(ctx, [[-3, -3], [-6 + legs, -3]], '#334e53', 3);
    line(ctx, [[-3, 3], [-6 - legs, 3]], '#334e53', 3);
    rounded(ctx, -5, -6, 10, 12, 4, player ? '#e58757' : person.color);
    circle(ctx, 3, 0, 3.8, player ? '#d99569' : person.skin);
    if (player) {
      line(ctx, [[0, -5], [5, -4]], '#f4d399', 2);
      if (person.aiming || person.recoil > 0) {
        line(ctx, [[1, 4], [11, 3]], '#e5b182', 3);
        line(ctx, [[10, 3], [17, 3]], '#283f45', 3);
        if (person.recoil > 0) circle(ctx, 20, 3, 3, '#ffe08c');
      }
    }
  }
  ctx.restore();
}

function drawBeacon(ctx, state) {
  const beacon = activeBeacon(state);
  if (!beacon) return;
  const pulse = 1 + Math.sin(state.time * 4) * 0.13;
  const beam = ctx.createLinearGradient(0, beacon.y - 125, 0, beacon.y);
  beam.addColorStop(0, '#ffe29900');
  beam.addColorStop(1, '#ffe29966');
  rect(ctx, beacon.x - 17, beacon.y - 125, 34, 125, beam);
  ctx.beginPath();
  ctx.ellipse(beacon.x, beacon.y, 23 * pulse, 13 * pulse, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffe5a1';
  ctx.lineWidth = 3;
  ctx.stroke();
  const float = Math.sin(state.time * 3) * 4;
  ctx.beginPath();
  ctx.moveTo(beacon.x, beacon.y - 35 + float);
  ctx.lineTo(beacon.x - 9, beacon.y - 49 + float);
  ctx.lineTo(beacon.x + 9, beacon.y - 49 + float);
  ctx.closePath();
  ctx.fillStyle = '#ffe49b';
  ctx.fill();
}

function drawWorld(ctx, view, state) {
  ctx.save();
  ctx.translate(view.width / 2, view.height / 2);
  ctx.scale(state.camera.zoom, state.camera.zoom);
  ctx.translate(-state.camera.x, -state.camera.y);
  drawGround(ctx, state);
  for (const building of state.city.buildings) {
    if (visible(view, state, building, 300)) drawBuilding(ctx, building);
  }
  for (const person of state.people) {
    if (visible(view, state, person)) drawPerson(ctx, person);
  }
  for (const car of state.cars) {
    if (visible(view, state, car)) drawCar(ctx, car, state.time);
  }
  if (!state.player.car) drawPerson(ctx, state.player, true);
  for (const prop of state.city.props) {
    if (visible(view, state, prop)) drawProp(ctx, prop);
  }
  drawBeacon(ctx, state);
  for (const trace of state.traces) {
    line(ctx, [[trace.from.x, trace.from.y], [trace.to.x, trace.to.y]], '#ffe5aa', 1.6);
  }
  for (const effect of state.effects) {
    label(ctx, String(effect.amount), effect.x, effect.y, 12, '#ffe3a0', 800, 'center');
  }
  ctx.restore();
}

// HUD coordinates stay in CSS pixels regardless of device pixel ratio.
function drawVitals(ctx, view, state) {
  panel(ctx, 24, 24, 225, 88);
  label(ctx, 'KIO  /  PORTSIDE', 40, 47, 11, C.muted, 800);
  label(ctx, `$${state.cash.toLocaleString('en-US')}`, 40, 76, 24, C.light, 800);
  rect(ctx, 40, 91, 190, 5, '#48615b');
  rect(ctx, 40, 91, 190 * state.player.health / WALK.health, 5, C.aqua);
  const level = stars(state.law);
  const right = view.width - 26;
  label(ctx, Array.from({ length: 5 }, (_, i) => i < level ? '★' : '☆').join(' '),
    right, 52, 25, level ? '#ffe1a0' : '#e5d6b088', 800, 'right');
  if (level) {
    const status = state.law.visible ? 'PATROL HAS SIGHT' : 'BREAK LINE OF SIGHT';
    label(ctx, status, right, 74, 10, C.light, 700, 'right');
  }
}

function drawObjective(ctx, view, state) {
  const status = objectiveStatus(state);
  if (!status) return;
  const width = Math.min(430, view.width - 48);
  panel(ctx, 24, 128, width, status.hint ? 126 : 106);
  label(ctx, status.title.toUpperCase(), 40, 150, 11, C.aqua, 800);
  wrap(ctx, status.text, 40, 175, width - 28, 14, C.light, 19);
  const time = status.time == null ? 'PICKUP' : `${Math.ceil(status.time)}s`;
  label(ctx, `${status.distance} m  ${status.heading}     ${time}`, 40, 215, 12, '#ead4a2', 800);
  if (status.hint) label(ctx, status.hint, 40, 238, 11, C.red, 700);
}

function drawVehicleHud(ctx, view, state) {
  const player = state.player;
  const y = view.height - 40;
  const x = view.width - 28;
  if (player.car) {
    const car = player.car;
    label(ctx, `${Math.round(car.speed * 0.27)}`, x - 51, y - 32, 53, C.light, 800, 'right');
    label(ctx, 'KM/H', x, y - 33, 11, C.aqua, 800, 'right');
    label(ctx, `${car.type.toUpperCase()}  /  E EXIT`, x, y - 9, 11, C.light, 700, 'right');
    rect(ctx, x - 145, y + 4, 145, 4, '#163d42aa');
    rect(ctx, x - 145, y + 4, 145 * car.hp / FLEET[car.type].shell, 4, C.orange);
  } else {
    const text = player.reload > 0 ? 'RELOADING' : `${player.ammo} / ${WALK.magazine}`;
    label(ctx, text, x, y - 24, 28, C.light, 800, 'right');
    label(ctx, 'CLICK / J FIRE   R RELOAD   E ENTER', x, y, 10, C.light, 700, 'right');
  }
}

function drawBustedMeter(ctx, view, state) {
  const fill = state.law.busted;
  if (fill <= 0) return;
  const w = 250;
  const x = (view.width - w) / 2;
  const y = view.height - 82;
  panel(ctx, x - 12, y - 26, w + 24, 54);
  label(ctx, 'ARREST IMMINENT · KEEP MOVING', view.width / 2, y - 7, 10, C.red, 800, 'center');
  rect(ctx, x, y + 4, w, 7, '#3b5352');
  rect(ctx, x, y + 4, w * fill, 7, C.red);
}

function drawMap(ctx, view, state) {
  const w = 207;
  const h = 154;
  const x = 24;
  const y = view.height - h - 43;
  panel(ctx, x - 4, y - 24, w + 8, h + 50);
  label(ctx, 'PORTSIDE  /  SOLARA', x + 9, y - 8, 10, C.aqua, 800);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(w / WORLD.width, h / WORLD.height);
  rect(ctx, 0, 0, WORLD.width, WORLD.height, '#40858a');
  rect(ctx, 0, 0, WORLD.shore, WORLD.height, '#b9b392');
  for (const row of ROAD.rows) rect(ctx, 0, row - 35, WORLD.shore, 70, '#527472');
  for (const column of ROAD.columns) rect(ctx, column - 35, 0, 70, WORLD.height, '#527472');
  for (const block of state.city.buildings) rect(ctx, block.x, block.y, block.w, block.h, '#d9c8a3');
  rect(ctx, PIER.x, PIER.y, PIER.w, PIER.h, '#dac393');
  for (const car of state.cars) {
    if (car.role !== 'police') circle(ctx, car.x, car.y, 12, '#dfdcbd');
  }
  for (const cop of state.law.cops) circle(ctx, cop.x, cop.y, 25, '#ff7569');
  const beacon = activeBeacon(state);
  if (beacon) {
    circle(ctx, beacon.x, beacon.y, 30 + Math.sin(state.time * 4) * 8, '#ffe39988');
    circle(ctx, beacon.x, beacon.y, 17, '#fff0b2');
  }
  ctx.translate(state.player.x, state.player.y);
  ctx.rotate(state.player.angle);
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(-25, -24);
  ctx.lineTo(-14, 0);
  ctx.lineTo(-25, 24);
  ctx.closePath();
  ctx.fillStyle = '#173e45';
  ctx.strokeStyle = '#9affde';
  ctx.lineWidth = 8;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(ctx, 'N ↑', x + w - 8, y + h - 8, 10, C.ink, 800, 'right');
}

function drawMissionCard(ctx, view, state) {
  const card = missionPanel(state);
  if (!card) return;
  const w = Math.min(565, view.width - 50);
  const x = (view.width - w) / 2;
  const h = card.kind === 'briefing' ? 210 : 180;
  const y = view.height - h - 40;
  panel(ctx, x, y, w, h, 0.96);
  label(ctx, card.eyebrow, x + 24, y + 31, 10, C.aqua, 800);
  label(ctx, card.title, x + 24, y + 66, 27, C.light, 800);
  wrap(ctx, card.text, x + 24, y + 98, w - 50, 16, C.light, 24);
  label(ctx, card.action, x + 24, y + h - 22, 12, '#e5b984', 700);
  if (card.progress) rect(ctx, x, y + h - 3, w * card.progress, 3, C.orange);
}

export function screenButtons(view, state) {
  const w = Math.min(330, view.width - 80);
  const x = state.screen === 'title' ? Math.max(40, view.width * 0.075) : (view.width - w) / 2;
  if (state.screen === 'title') {
    const y = Math.min(view.height - 144, view.height * 0.68);
    const buttons = [{ x, y, w, h: 45, action: 'start', text: 'START A NEW RUN' }];
    if (state.hasSave) buttons.push({ x, y: y + 55, w, h: 42, action: 'continue', text: 'CONTINUE' });
    return buttons;
  }
  const y = view.height / 2 + 94;
  if (state.screen === 'pause') return [{ x, y, w, h: 45, action: 'resume', text: 'BACK TO THE CITY' }];
  if (state.screen === 'busted') return [{ x, y, w, h: 45, action: 'respawn', text: 'RETURN TO LOWLIGHT' }];
  if (state.screen === 'complete') return [{ x, y, w, h: 45, action: 'roam', text: 'KEEP EXPLORING' }];
  return [];
}

function drawButtons(ctx, view, state) {
  const buttons = screenButtons(view, state);
  for (const [index, button] of buttons.entries()) {
    const selected = index === state.choice || buttons.length === 1;
    rect(ctx, button.x, button.y, button.w, button.h, selected ? C.light : '#143d42dd');
    label(ctx, button.text, button.x + 19, button.y + 29, 12, selected ? C.ink : C.light, 800);
    label(ctx, '↵', button.x + button.w - 20, button.y + 29, 16,
      selected ? C.ink : C.light, 800, 'right');
  }
}

function drawTitle(ctx, view, state) {
  const shade = ctx.createLinearGradient(0, 0, view.width, 0);
  shade.addColorStop(0, '#102f36f5');
  shade.addColorStop(0.52, '#15373ee6');
  shade.addColorStop(1, '#15373e05');
  rect(ctx, 0, 0, view.width, view.height, shade);
  const x = Math.max(40, view.width * 0.075);
  const top = Math.max(60, view.height * 0.16);
  const font = Math.min(90, view.width * 0.085);
  label(ctx, 'AN ORIGINAL OPEN-WORLD STORY', x + 3, top, 11, C.aqua, 800);
  label(ctx, 'SOLARA', x, top + font * 1.1, font, C.light, 900);
  label(ctx, 'CITY', x, top + font * 2.03, font, C.light, 900);
  rect(ctx, x + 3, top + font * 2.18, 53, 4, C.orange);
  label(ctx, 'P O R T S I D E   R U N', x + 3, top + font * 2.61, 19, C.orange, 800);
  wrap(ctx, 'One district. Three handoffs. A city that keeps moving.',
    x + 3, top + font * 3.04, Math.min(400, view.width - x - 35), 17, '#d6dfcc', 26);
  drawButtons(ctx, view, state);
  label(ctx, 'WASD MOVE / DRIVE   E ENTER / EXIT   CLICK FIRE   R RELOAD',
    x + 3, view.height - 45, Math.min(11, view.width / 65), '#d4deca', 700);
  label(ctx, 'P PAUSE   ·   ENTER CONFIRM   ·   KIO’S STORY BEGINS HERE',
    x + 3, view.height - 25, Math.min(10, view.width / 70), '#a2c3b9', 600);
  label(ctx, 'SOLARA COAST  /  17:42', view.width - 28, 33, 10, C.light, 800, 'right');
}

function drawOverlay(ctx, view, state) {
  rect(ctx, 0, 0, view.width, view.height, '#102e36d9');
  const middle = view.width / 2;
  const y = view.height / 2;
  let eyebrow = 'THE CITY WILL WAIT';
  let title = 'TAKE A BREATHER';
  let text = 'Your run is paused.';
  let color = C.light;
  if (state.screen === 'busted') {
    eyebrow = 'PORTSIDE PATROL';
    title = 'BUSTED';
    text = `$${state.fine ?? 0} fine. Mara can arrange another attempt.`;
    color = C.red;
  }
  if (state.screen === 'complete') {
    eyebrow = 'MARA  /  LAST TRANSMISSION';
    title = 'CLEAR HORIZON';
    text = '“You made it, Kio. The tide owes us one.”';
    color = C.aqua;
  }
  label(ctx, eyebrow, middle, y - 106, 12, C.orange, 800, 'center');
  label(ctx, title, middle, y - 40, Math.min(61, view.width / 12), color, 900, 'center');
  label(ctx, text, middle, y + 6, Math.min(17, view.width / 40), C.light, 500, 'center');
  if (state.screen === 'complete') {
    label(ctx, `THREE RUNS COMPLETE  ·  $${state.cash.toLocaleString('en-US')}`,
      middle, y + 44, 12, '#dbd8b4', 800, 'center');
  }
  drawButtons(ctx, view, state);
}

function drawToast(ctx, view, state) {
  if (state.toastTime <= 0) return;
  const x = view.width / 2;
  label(ctx, state.toast, x, 95, 14, C.light, 700, 'center');
}

export function paint(ctx, view, state) {
  ctx.clearRect(0, 0, view.width, view.height);
  drawWorld(ctx, view, state);
  if (state.screen === 'title') {
    drawTitle(ctx, view, state);
    return;
  }
  const dusk = ctx.createLinearGradient(0, 0, view.width, view.height);
  dusk.addColorStop(0, '#ffbc5310');
  dusk.addColorStop(1, '#125d6b10');
  rect(ctx, 0, 0, view.width, view.height, dusk);
  drawVitals(ctx, view, state);
  drawObjective(ctx, view, state);
  drawMap(ctx, view, state);
  drawVehicleHud(ctx, view, state);
  drawBustedMeter(ctx, view, state);
  drawToast(ctx, view, state);
  if (state.screen === 'play') drawMissionCard(ctx, view, state);
  else drawOverlay(ctx, view, state);
}
