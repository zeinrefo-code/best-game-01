// Keyboard and mouse input. The game reads a snapshot each fixed step, so a
// key held between frames still steers the same way every replay.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  m: ACTION_MUTE,
  M: ACTION_MUTE,
  r: ACTION_RESTART,
  R: ACTION_RESTART,
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function onKeyDown(event) {
    const key = event.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      keys.add(key);
      const action = KEY_ACTIONS[key];
      if (action) pressed.add(action);
      if (key === '1' || key === '2' || key === '3') pressed.add(`pick${key}`);
    }
  }
  function onKeyUp(event) {
    keys.delete(event.key);
  }
  function onMouseMove(event) {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
  }
  function onMouseDown(event) {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.down = true;
    pressed.add(ACTION_CONFIRM);
  }
  function onMouseUp() {
    mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    keys,
    mouse,
    // Held movement axis, -1..1 on each axis.
    moveAxis() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('A') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('D') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('W') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('S') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    firing() {
      return mouse.down;
    },
    // Was this action pressed since the last snapshot? Consumes it.
    take(action) {
      if (pressed.has(action)) {
        pressed.delete(action);
        return true;
      }
      return false;
    },
    has(action) {
      return pressed.has(action);
    },
    clearPressed() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}

// A scripted input for the screenshot scenes and the soak test: the same
// shape as the live input, driven by an autopilot instead of a keyboard.
export function createScriptedInput() {
  const state = {
    mx: 0, my: 0, fire: false, aimX: 0, aimY: 0,
    confirm: false, pick: 0,
  };
  return {
    state,
    moveAxis() {
      return { x: state.mx, y: state.my };
    },
    firing() {
      return state.fire;
    },
    take(action) {
      if (action === ACTION_CONFIRM && state.confirm) {
        state.confirm = false;
        return true;
      }
      if (action === 'pick1' && state.pick === 1) { state.pick = 0; return true; }
      if (action === 'pick2' && state.pick === 2) { state.pick = 0; return true; }
      if (action === 'pick3' && state.pick === 3) { state.pick = 0; return true; }
      return false;
    },
    has() { return false; },
    clearPressed() { state.confirm = false; state.pick = 0; },
    get mouse() {
      return { x: state.aimX, y: state.aimY, down: state.fire };
    },
  };
}
