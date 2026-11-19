// World dimensions and rules shared by the simulation and presentation.
export const STEP = 1 / 60;
export const TAU = Math.PI * 2;

export const WORLD = {
  width: 2400,
  height: 1800,
  shore: 2120,
  endOfSand: 2150,
  margin: 12,
};

export const ROAD = {
  columns: [220, 620, 1020, 1420, 1820],
  rows: [190, 540, 890, 1240, 1590],
  half: 48,
  walk: 17,
  lanes: [12, 35],
  crossing: 18,
};

export const PIER = {
  x: 2092,
  y: 1230,
  w: 228,
  h: 66,
};

export const LANDMARKS = {
  depot: { name: 'Portside Depot', x: 325, y: 263, w: 174, h: 100, color: '#e4a866' },
  garage: { name: 'Sunline Garage', x: 1550, y: 633, w: 172, h: 91, color: '#e28d76' },
  marina: { name: 'Bluewake Marina', x: 1920, y: 949, w: 143, h: 98, color: '#7db9ab' },
  chop: { name: 'Spare Tide', x: 324, y: 1341, w: 171, h: 104, color: '#c78c87' },
  plaza: { name: 'Kite Plaza', x: 1120, y: 960, w: 188, h: 200, color: '#e5bd7d' },
  safe: { name: 'Lowlight Rooms', x: 339, y: 641, w: 138, h: 98, color: '#b6a4ca' },
  ferry: { name: 'Ferry Pier', x: 2010, y: 1319, w: 78, h: 48, color: '#d6aa72' },
};

export const SAFEHOUSE = { x: 404, y: 611 };
export const GOLD_CAR = { x: 1990, y: 931, angle: Math.PI };

export const WALK = {
  speed: 164,
  radius: 8,
  health: 100,
  magazine: 9,
  reload: 0.95,
  cooldown: 0.23,
  range: 310,
};

export const FLEET = {
  sedan: { width: 37, height: 18, accel: 227, top: 287, grip: 6.5, steer: 2.65, shell: 100 },
  sport: { width: 37, height: 17, accel: 290, top: 356, grip: 5.9, steer: 2.95, shell: 89 },
  van: { width: 44, height: 21, accel: 180, top: 230, grip: 5.1, steer: 2.15, shell: 135 },
  taxi: { width: 39, height: 19, accel: 215, top: 270, grip: 6.1, steer: 2.50, shell: 105 },
};

export const TRAFFIC = {
  moving: 36,
  parked: 24,
  palette: ['#cf6049', '#eed09b', '#4d8f99', '#679480', '#a47f9e', '#e5e3cf', '#627580'],
  turnChance: 0.31,
  brake: 330,
  reverse: 87,
};

export const PED = {
  count: 45,
  radius: 6,
  hearing: 230,
  recovery: 6.5,
  warningSpeed: 105,
  shirts: ['#e17864', '#557a9c', '#e2b34a', '#815e85', '#489888', '#e8dbad'],
};

export const LAW = {
  theft: 1,
  impact: 2,
  shooting: 1,
  caps: [0, 1, 2, 3, 4, 5],
  sight: 410,
  arrest: 70,
  decay: 0.22,
  delay: 4,
  fine: 180,
};

export const JOBS = [
  {
    name: 'First Run',
    pickup: { x: 404, y: 385, label: 'Collect the parcel at Portside Depot' },
    drop: { x: 1635, y: 608, label: 'Deliver the parcel to Sunline Garage' },
    time: 48,
    reward: 380,
    briefing: [
      'Kio, there’s a tin parcel under the depot awning. Yellow tape.',
      'Take it to Sunline. Their lift goes up when the whistle blows.',
      'Grab a car if you need one. Keep the parcel out of the water.',
      'The clock starts when you lift it. Pick your route before you touch that tape.',
    ],
  },
  {
    name: 'Borrowed Wheels',
    pickup: { ...GOLD_CAR, label: 'Enter the gold coupe at Bluewake Marina' },
    drop: { x: 414, y: 1314, label: 'Bring the gold coupe to Spare Tide' },
    time: 55,
    reward: 740,
    briefing: [
      'Bluewake has a gold coupe parked by the street. That’s our ride.',
      'The marina has an alarm on it, so expect company when you get in.',
      'Bring the coupe to Spare Tide. I’ll have the side gate open.',
      'If you have to leave the coupe, circle back. That gate only opens for gold.',
    ],
  },
  {
    name: 'Last Ferry',
    pickup: { x: 1212, y: 1060, label: 'Pick up the cash case in Kite Plaza' },
    drop: { x: 2266, y: 1262, label: 'Reach Mara’s boat at the end of Ferry Pier' },
    time: 53,
    reward: 1250,
    briefing: [
      'I left the cash case by the fountain in Kite Plaza.',
      'The harbor crew will spot you the moment you lift it.',
      'I’m at the far end of Ferry Pier. Leave the car on shore if you have to.',
      'When you see the pier lamps, head straight for the gangway. I’ll leave the engine running.',
    ],
  },
];
