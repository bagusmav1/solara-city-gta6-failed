import { LANDMARKS, PIER, ROAD, WORLD } from './config.js';
import { choice, clamp, range } from './random.js';

const roofs = ['#d39275', '#ddbd83', '#9eb9a0', '#d68f93', '#a8a7bf', '#e0c5a6'];
const parkSlots = new Set(['1,0', '3,1', '0,3', '2,3', '4,2']);

export const intersections = ROAD.rows.flatMap((y, row) =>
  ROAD.columns.map((x, column) => ({ x, y, row, column })),
);

export const directions = [
  { x: 1, y: 0, angle: 0 },
  { x: 0, y: 1, angle: Math.PI / 2 },
  { x: -1, y: 0, angle: Math.PI },
  { x: 0, y: -1, angle: -Math.PI / 2 },
];

export function closest(values, value) {
  return values.reduce((best, other) =>
    Math.abs(other - value) < Math.abs(best - value) ? other : best,
  );
}

export function isOnRoad(x, y) {
  if (x > WORLD.shore || x < 0 || y < 0 || y > WORLD.height) return false;
  const horizontal = Math.abs(y - closest(ROAD.rows, y)) < ROAD.half;
  const vertical = Math.abs(x - closest(ROAD.columns, x)) < ROAD.half;
  return horizontal || vertical;
}

export function nearestLane(x, y, dir = 0, lane = 0) {
  const vector = directions[dir];
  const offset = ROAD.lanes[lane];
  return {
    x: vector.x ? x : closest(ROAD.columns, x) - vector.y * offset,
    y: vector.y ? y : closest(ROAD.rows, y) + vector.x * offset,
    dir,
    lane,
    angle: vector.angle,
  };
}

export function randomRoadPoint(rng) {
  const dir = choice(rng, [0, 1, 2, 3]);
  const lane = choice(rng, [0, 1]);
  const x = range(rng, 60, WORLD.shore - 65);
  const y = range(rng, 60, WORLD.height - 65);
  return nearestLane(x, y, dir, lane);
}

export function contains(rect, x, y, padding = 0) {
  return x >= rect.x - padding && x <= rect.x + rect.w + padding &&
    y >= rect.y - padding && y <= rect.y + rect.h + padding;
}

function overlaps(a, b, gap) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function buildCity(rng) {
  const city = {
    intersections,
    sidewalks: [],
    buildings: [],
    solids: [],
    parks: [],
    blocks: [],
    props: [],
    pier: PIER,
  };

  for (const [id, landmark] of Object.entries(LANDMARKS)) {
    if (id !== 'plaza') addBuilding(city, rng, { ...landmark, id });
  }

  makeBlocks(city, rng);
  plantRoadEdges(city);
  furnishShore(city);
  return city;
}

function makeBlocks(city, rng) {
  const xEdges = [-ROAD.half, ...ROAD.columns, WORLD.shore + ROAD.half - 45];
  const yEdges = [-ROAD.half, ...ROAD.rows, WORLD.height + ROAD.half];
  for (let row = 0; row < yEdges.length - 1; row++) {
    for (let column = 0; column < xEdges.length - 1; column++) {
      const block = {
        x: xEdges[column] + ROAD.half,
        y: yEdges[row] + ROAD.half,
        w: xEdges[column + 1] - xEdges[column] - ROAD.half * 2,
        h: yEdges[row + 1] - yEdges[row] - ROAD.half * 2,
      };
      city.blocks.push(block);
      city.sidewalks.push(walkLoop(block));
      populateBlock(city, rng, block, column, row);
    }
  }
}

function walkLoop(block) {
  const left = block.x + 8;
  const right = block.x + block.w - 8;
  const top = block.y + 8;
  const bottom = block.y + block.h - 8;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  return [
    { x: left, y: top }, { x: midX, y: top },
    { x: right, y: top }, { x: right, y: midY },
    { x: right, y: bottom }, { x: midX, y: bottom },
    { x: left, y: bottom }, { x: left, y: midY },
  ];
}

function populateBlock(city, rng, block, column, row) {
  const inset = ROAD.walk + 8;
  const interior = {
    x: block.x + inset,
    y: block.y + inset,
    w: block.w - inset * 2,
    h: block.h - inset * 2,
  };
  const plaza = LANDMARKS.plaza;
  if (overlaps(interior, plaza, 0)) {
    addPark(city, rng, interior, plaza.name, true);
    return;
  }
  if (parkSlots.has(`${column},${row}`) && !city.buildings.some(b => overlaps(interior, b, 0))) {
    addPark(city, rng, interior, null, false);
    return;
  }

  const columns = interior.w > 190 ? 2 : 1;
  const rows = interior.h > 175 ? 2 : 1;
  const cellWidth = interior.w / columns;
  const cellHeight = interior.h / rows;
  for (let ix = 0; ix < columns; ix++) {
    for (let iy = 0; iy < rows; iy++) {
      const building = {
        x: interior.x + ix * cellWidth + range(rng, 3, 10),
        y: interior.y + iy * cellHeight + range(rng, 3, 9),
        w: cellWidth - range(rng, 22, 36),
        h: cellHeight - range(rng, 20, 32),
        color: choice(rng, roofs),
      };
      if (city.buildings.some(other => overlaps(other, building, 23))) continue;
      addBuilding(city, rng, building);
    }
  }
}

function addBuilding(city, rng, building) {
  const roof = {
    ...building,
    trim: choice(rng, ['#fff1ce', '#fae1b4', '#fbe9d3']),
    style: choice(rng, ['vent', 'solar', 'awning']),
    depth: range(rng, 8, 15),
  };
  city.buildings.push(roof);
  city.solids.push(roof);
}

function addPark(city, rng, area, name, paved) {
  const park = { ...area, name, paved };
  city.parks.push(park);
  const { x, y, w, h } = park;
  for (const offsetX of [0.14, 0.84]) {
    for (const offsetY of [0.15, 0.83]) {
      city.props.push({
        type: 'palm',
        x: x + w * offsetX,
        y: y + h * offsetY,
        angle: range(rng, 0, Math.PI * 2),
        scale: range(rng, 0.8, 1.3),
      });
    }
  }
  city.props.push({ type: 'bench', x: x + w * 0.31, y: y + h * 0.39 });
  city.props.push({ type: 'bench', x: x + w * 0.69, y: y + h * 0.60 });
}

function plantRoadEdges(city) {
  for (const stop of intersections) {
    city.props.push({ type: 'lamp', x: stop.x - 54, y: stop.y - 56 });
    city.props.push({ type: 'lamp', x: stop.x + 55, y: stop.y + 55 });
    if ((stop.column + stop.row) % 2 === 0) {
      city.props.push({ type: 'palm', x: stop.x + 56, y: stop.y - 57, angle: stop.x, scale: 0.67 });
    }
  }
}

function furnishShore(city) {
  for (let y = 110; y < WORLD.height; y += 113) {
    if (Math.abs(y - PIER.y) < 85) continue;
    if (Math.abs(y - closest(ROAD.rows, y)) < 55) continue;
    city.props.push({ type: 'palm', x: 2092, y, angle: y, scale: 0.88 });
  }
  for (const [x, y] of [[2106, 1250], [2166, 1243], [2238, 1283], [2040, 1309]]) {
    city.props.push({ type: 'crate', x, y });
  }
}

export function isLand(x, y, radius = 0) {
  if (![x, y, radius].every(Number.isFinite) || radius < 0) return false;
  if (y < radius || y > WORLD.height - radius || x < radius) return false;
  if (x <= WORLD.endOfSand - radius) return true;
  // Only the exposed part of the circle needs to fit on the deck while crossing the seam.
  const shoreGap = Math.max(0, WORLD.endOfSand - x);
  const exposedHalfWidth = Math.sqrt(Math.max(0, radius * radius - shoreGap * shoreGap));
  return x + radius <= PIER.x + PIER.w &&
    y - exposedHalfWidth >= PIER.y && y + exposedHalfWidth <= PIER.y + PIER.h;
}

export function solidCircle(city, x, y, radius) {
  return city.solids.find(rect => {
    if (contains(rect, x, y)) return true;
    const dx = x - clamp(x, rect.x, rect.x + rect.w);
    const dy = y - clamp(y, rect.y, rect.y + rect.h);
    return dx * dx + dy * dy < radius * radius;
  });
}

export function canOccupy(city, x, y, radius) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return isLand(x, y, radius) && !solidCircle(city, x, y, radius);
}

export function moveCircle(city, entity, dx, dy, radius) {
  const blockedX = !canOccupy(city, entity.x + dx, entity.y, radius);
  if (!blockedX) entity.x += dx;
  const blockedY = !canOccupy(city, entity.x, entity.y + dy, radius);
  if (!blockedY) entity.y += dy;
  return { blockedX, blockedY };
}

export function laneExit(x, y, dir, lane) {
  const heading = directions[dir];
  const nextX = ROAD.columns.find(value => value > x + 3);
  const prevX = ROAD.columns.findLast(value => value < x - 3);
  const nextY = ROAD.rows.find(value => value > y + 3);
  const prevY = ROAD.rows.findLast(value => value < y - 3);
  const stop = {
    x: heading.x > 0 ? nextX : heading.x < 0 ? prevX : closest(ROAD.columns, x),
    y: heading.y > 0 ? nextY : heading.y < 0 ? prevY : closest(ROAD.rows, y),
  };
  if (stop.x === undefined || stop.y === undefined) return null;
  return {
    ...stop,
    point: nearestLane(stop.x, stop.y, dir, lane),
  };
}

export function segmentRect(from, to, rect) {
  let first = 0;
  let last = 1;
  for (const [origin, delta, low, high] of [
    [from.x, to.x - from.x, rect.x, rect.x + rect.w],
    [from.y, to.y - from.y, rect.y, rect.y + rect.h],
  ]) {
    if (delta === 0) {
      if (origin < low || origin > high) return Infinity;
      continue;
    }
    const a = (low - origin) / delta;
    const b = (high - origin) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return Infinity;
  }
  return first;
}

export function traceCity(city, from, to) {
  let fraction = 1;
  for (const building of city.solids) {
    fraction = Math.min(fraction, segmentRect(from, to, building));
  }
  return fraction;
}
