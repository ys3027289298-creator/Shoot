// Keyboard + mouse input with Pointer Lock. Produces the game.input state.
export class InputController {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.locked = false;
    this.mouseDown = false;
    this.rightDown = false;
    this.onMouseMove = null;
    this.onLockChange = null;
    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.onMouseMove) {
        this.onMouseMove(e.movementX * this.settings.sensitivity * 0.0022,
          e.movementY * this.settings.sensitivity * 0.0022);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.rightDown = false;
        this.keys.clear();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    this.canvas.requestPointerLock();
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pressed(code) {
    return this.keys.has(code);
  }

  // consume a one-shot key press (edge detection)
  consumePressed(code) {
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  applyTo(game) {
    const i = game.input;
    i.forward = (this.pressed('KeyW') ? 1 : 0) - (this.pressed('KeyS') ? 1 : 0);
    i.strafe = (this.pressed('KeyD') ? 1 : 0) - (this.pressed('KeyA') ? 1 : 0);
    i.crouch = this.pressed('ControlLeft') || this.pressed('KeyC');
    i.sprint = this.pressed('ShiftLeft') || this.pressed('ShiftRight');
    i.jump = this.pressed('Space');
    i.ads = this.rightDown;
    i.fireHeld = this.mouseDown;
    i.interactHeld = this.pressed('KeyE');
  }
}
