// The simulation consumes edges once per step and holds axes between steps.
const gameKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyE', 'KeyF', 'KeyJ', 'KeyR', 'KeyP', 'Escape', 'Enter',
]);

export function neutralInput() {
  return {
    x: 0,
    y: 0,
    throttle: 0,
    steer: 0,
    brake: false,
    enter: false,
    exit: false,
    fire: false,
    reload: false,
    pause: false,
    confirm: false,
    pointer: null,
    click: null,
    alternate: false,
  };
}

export function attachInput(canvas, onGesture) {
  const held = new Set();
  const edges = new Set();
  let pointer = null;
  let click = null;
  let trigger = false;

  function keyDown(event) {
    if (!gameKeys.has(event.code)) return;
    event.preventDefault();
    onGesture();
    if (!held.has(event.code)) edges.add(event.code);
    held.add(event.code);
  }

  function keyUp(event) {
    held.delete(event.code);
  }

  function locate(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function pointerDown(event) {
    if (event.button !== 0) return;
    locate(event);
    click = pointer;
    trigger = true;
    onGesture();
    canvas.focus({ preventScroll: true });
  }

  function reset() {
    held.clear();
    edges.clear();
    click = null;
    trigger = false;
  }

  function active(first, second) {
    return Number(held.has(first) || held.has(second));
  }

  function sample() {
    const x = active('KeyD', 'ArrowRight') - active('KeyA', 'ArrowLeft');
    const y = active('KeyS', 'ArrowDown') - active('KeyW', 'ArrowUp');
    const frame = {
      x,
      y,
      throttle: -y,
      steer: x,
      brake: held.has('Space'),
      enter: edges.has('KeyE'),
      exit: edges.has('KeyF'),
      fire: trigger || edges.has('KeyJ') || held.has('KeyJ'),
      reload: edges.has('KeyR'),
      pause: edges.has('Escape') || edges.has('KeyP'),
      confirm: edges.has('Enter'),
      pointer,
      click,
      alternate: edges.has('ArrowDown') || edges.has('ArrowUp'),
    };
    edges.clear();
    click = null;
    trigger = false;
    return frame;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', reset);
  canvas.addEventListener('pointermove', locate);
  canvas.addEventListener('pointerdown', pointerDown);
  return { sample, reset };
}
