import { FLEET, JOBS } from './config.js';
import { distance } from './random.js';
import { lockWanted } from './police.js';
import { resetGoldCar } from './vehicles.js';

export function createMission(completed = 0) {
  return {
    completed,
    phase: completed >= JOBS.length ? 'free' : 'ready',
    line: 0,
    time: null,
    reason: '',
    deliveryNotice: 0,
    lastReward: 0,
    attempt: null,
    attempts: 0,
  };
}

export function currentJob(state) {
  return JOBS[state.mission.completed] ?? null;
}

export function startBriefing(state) {
  const mission = state.mission;
  if (!currentJob(state)) return;
  const rules = jobRules[mission.completed];
  mission.attempts = mission.phase === 'failed' ? mission.attempts + 1 : 1;
  mission.attempt = rules.prepare(state, currentJob(state));
  mission.attempt.elapsed = 0;
  mission.phase = 'briefing';
  mission.line = 0;
  mission.time = null;
  mission.reason = '';
  mission.deliveryNotice = 0;
  state.audio?.cue('click');
}

function advanceBriefing(state) {
  const mission = state.mission;
  const job = currentJob(state);
  mission.line++;
  state.audio?.cue('click');
  if (mission.line < job.briefing.length) return;
  beginPickup(mission);
}

function beginPickup(mission) {
  mission.phase = 'pickup';
  mission.time = null;
}

export function confirmMission(state) {
  const mission = state.mission;
  switch (mission.phase) {
    case 'ready':
    case 'done':
      startBriefing(state);
      return true;
    case 'failed':
      retryMission(state);
      return true;
    case 'briefing':
      advanceBriefing(state);
      return true;
    default:
      return false;
  }
}

function retryMission(state) {
  startBriefing(state);
  const mission = state.mission;
  // Mara's instructions have already been read for this job.
  mission.line = currentJob(state).briefing.length;
  beginPickup(mission);
}

function waitingAt(point, radius) {
  return { point, radius, collected: false };
}

const jobRules = [
  {
    prepare: (_state, job) => waitingAt(job.pickup, 27),
    hint: (_state, attempt) => attempt.collected ? 'Parcel aboard' : 'Look for the depot awning',
  },
  {
    prepare(state) {
      resetGoldCar(state);
      return { coupe: state.gold, collected: false };
    },
    collect(state) {
      state.law.heat = Math.max(state.law.heat, 2);
      state.law.unseen = 0;
    },
    hint(state, attempt) {
      if (!attempt.collected) return 'Use E beside the gold coupe';
      if (state.player.car !== attempt.coupe) return 'Return to the gold coupe';
      const condition = Math.ceil(100 * attempt.coupe.hp / FLEET.sport.shell);
      return `Coupe condition ${condition}%`;
    },
  },
  {
    prepare: (_state, job) => ({ ...waitingAt(job.pickup, 27), holdsHeat: false }),
    collect(state, attempt) {
      lockWanted(state, 3);
      attempt.holdsHeat = true;
    },
    hint: (_state, attempt) => attempt.holdsHeat ? 'Wanted level held until the pier' : 'Check the plaza fountain',
  },
];

export function activeBeacon(state) {
  const mission = state.mission;
  const job = currentJob(state);
  if (!job) return null;
  if (mission.phase === 'pickup') {
    const coupe = mission.attempt?.coupe;
    if (coupe) return { ...job.pickup, x: coupe.x, y: coupe.y };
    return job.pickup;
  }
  if (mission.phase === 'deliver') return job.drop;
  return null;
}

export function failMission(state, reason) {
  const mission = state.mission;
  if (!['pickup', 'deliver'].includes(mission.phase)) return;
  mission.phase = 'failed';
  mission.reason = reason;
  mission.time = null;
  releaseMissionHeat(state);
  state.audio?.cue('fail');
}

function releaseMissionHeat(state) {
  if (state.mission.attempt?.holdsHeat) state.mission.attempt.holdsHeat = false;
  lockWanted(state, 0);
}

function takeCargo(state, job) {
  const mission = state.mission;
  mission.phase = 'deliver';
  mission.time = job.time;
  mission.attempt.collected = true;
  jobRules[mission.completed].collect?.(state, mission.attempt);
  state.audio?.cue('pickup');
}

function finishDelivery(state, job) {
  const mission = state.mission;
  mission.completed++;
  mission.time = null;
  mission.lastReward = job.reward;
  mission.deliveryNotice = 3;
  state.cash += job.reward;
  releaseMissionHeat(state);
  mission.attempt = null;
  const finishedStory = mission.completed === JOBS.length;
  mission.phase = finishedStory ? 'free' : 'done';
  if (finishedStory) state.screen = 'complete';
  state.audio?.cue('success');
  state.persist?.();
}

function hasPickup(state) {
  const attempt = state.mission.attempt;
  if (attempt.coupe) return state.player.car === attempt.coupe;
  return distance(state.player, attempt.point) <= attempt.radius;
}

function canDeliver(state, job) {
  if (distance(state.player, job.drop) > 35) return false;
  if (state.mission.completed !== 1) return true;
  return state.player.car === state.gold;
}

function updatePickup(state, job) {
  if (hasPickup(state)) takeCargo(state, job);
}

function updateDelivery(state, job, dt) {
  const mission = state.mission;
  if (mission.attempt) mission.attempt.elapsed += dt;
  mission.time = Math.max(0, mission.time - dt);
  if (mission.time <= 0) {
    failMission(state, 'You missed Mara’s handoff window.');
    return;
  }
  if (canDeliver(state, job)) finishDelivery(state, job);
}

export function stepMission(state, dt) {
  const mission = state.mission;
  mission.deliveryNotice = Math.max(0, mission.deliveryNotice - dt);
  const job = currentJob(state);
  if (!job) return;
  const active = mission.phase === 'pickup' || mission.phase === 'deliver';
  if (!active) return;
  if (mission.attempt?.coupe?.hp === 0) {
    failMission(state, 'The gold coupe is wrecked.');
    return;
  }
  if (mission.phase === 'pickup') updatePickup(state, job);
  else updateDelivery(state, job, dt);
}

// The HUD and briefing card use the same mission state as the simulation.
function briefingPanel(state, job) {
  const finalLine = state.mission.line + 1 === job.briefing.length;
  return {
    kind: 'briefing',
    eyebrow: 'MARA  /  PRIVATE LINE',
    title: job.name,
    text: job.briefing[state.mission.line],
    action: finalLine ? 'Enter · Take job' : 'Enter · Next',
    progress: (state.mission.line + 1) / job.briefing.length,
  };
}

function failedPanel(state, job) {
  return {
    kind: 'failed',
    eyebrow: `RUN ENDED  /  ATTEMPT ${state.mission.attempts}`,
    title: job.name,
    text: state.mission.reason,
    action: 'Enter · Retry',
  };
}

function readyPanel(job, phase) {
  const opening = phase === 'ready';
  return {
    kind: 'ready',
    eyebrow: opening ? 'INCOMING CALL' : 'NEW JOB AVAILABLE',
    title: job.name,
    text: opening ? 'Mara has a delivery for you.' : 'Call Mara when you’re ready for the next run.',
    action: 'Enter · Answer Mara',
  };
}

export function missionPanel(state) {
  const phase = state.mission.phase;
  const job = currentJob(state);
  if (!job) return null;
  if (phase === 'briefing') return briefingPanel(state, job);
  if (phase === 'failed') return failedPanel(state, job);
  if (phase === 'ready' || phase === 'done') return readyPanel(job, phase);
  return null;
}

function directionHint(player, target) {
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  const labels = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const index = Math.round(angle / (Math.PI / 4));
  return labels[(index + labels.length) % labels.length];
}

function cargoHint(state) {
  const { attempt, completed } = state.mission;
  return attempt ? jobRules[completed].hint(state, attempt) : '';
}

export function objectiveStatus(state) {
  const job = currentJob(state);
  const target = activeBeacon(state);
  if (!target) return null;
  const distanceTo = Math.ceil(distance(state.player, target));
  return {
    title: job.name,
    text: target.label,
    distance: distanceTo,
    heading: directionHint(state.player, target),
    time: state.mission.time,
    fullTime: job.time,
    hint: cargoHint(state),
    phase: state.mission.phase,
  };
}
