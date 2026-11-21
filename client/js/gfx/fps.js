// First-Person Controller: WASD walking, mouse-look (PointerLock or drag),
// head-bob, and collision boundaries around the dreamy courtyard and portal.

import * as THREE from 'three';

export class FPSController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.enabled = true;
    this.isLocked = false;

    // Orientation
    this.yaw = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.0022;

    // Movement state
    this.keys = { forward: false, backward: false, left: false, right: false };
    this.velocity = new THREE.Vector3();
    this.speed = 4.2;
    this.bobTimer = 0;
    this.baseY = 1.7;

    // Courtyard boundaries: [minX, maxX, minZ, maxZ]
    this.bounds = { minX: -6.5, maxX: 6.5, minZ: -0.2, maxZ: 14.5 };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    this._dragActive = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    this._initEvents();
  }

  _initEvents() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    this.domElement.addEventListener('click', () => {
      if (this.enabled && !this.isLocked && document.pointerLockElement !== this.domElement) {
        try {
          this.domElement.requestPointerLock();
        } catch {
          /* ignore fallback to drag */
        }
      }
    });

    // Drag-to-look fallback
    this.domElement.addEventListener('mousedown', (e) => {
      this._dragActive = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      this._dragActive = false;
    });
    window.addEventListener('mousemove', this._onMouseMove);
  }

  _onPointerLockChange() {
    this.isLocked = document.pointerLockElement === this.domElement;
  }

  _onMouseMove(e) {
    if (!this.enabled) return;

    let dx = 0;
    let dy = 0;

    if (this.isLocked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else if (this._dragActive) {
      dx = e.clientX - this._lastMouseX;
      dy = e.clientY - this._lastMouseY;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    } else {
      return;
    }

    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;
    // Limit pitch to prevent flipping
    this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));

    this._updateCameraRotation();
  }

  _updateCameraRotation() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    const k = e.code;
    if (k === 'KeyW' || k === 'ArrowUp') this.keys.forward = true;
    if (k === 'KeyS' || k === 'ArrowDown') this.keys.backward = true;
    if (k === 'KeyA' || k === 'ArrowLeft') this.keys.left = true;
    if (k === 'KeyD' || k === 'ArrowRight') this.keys.right = true;
  }

  _onKeyUp(e) {
    const k = e.code;
    if (k === 'KeyW' || k === 'ArrowUp') this.keys.forward = false;
    if (k === 'KeyS' || k === 'ArrowDown') this.keys.backward = false;
    if (k === 'KeyA' || k === 'ArrowLeft') this.keys.left = false;
    if (k === 'KeyD' || k === 'ArrowRight') this.keys.right = false;
  }

  setPosition(x, y, z, yaw = 0, pitch = 0) {
    this.camera.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.baseY = y;
    this._updateCameraRotation();
  }

  update(dt) {
    if (!this.enabled) return;

    // Movement direction in local space
    const move = new THREE.Vector3();
    if (this.keys.forward) move.z -= 1;
    if (this.keys.backward) move.z += 1;
    if (this.keys.left) move.x -= 1;
    if (this.keys.right) move.x += 1;

    const moving = move.lengthSq() > 0.001;
    if (moving) move.normalize();

    // Rotate movement vector by player's yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const worldDir = new THREE.Vector3()
      .addScaledVector(forward, -move.z)
      .addScaledVector(right, move.x);

    // Smooth velocity
    const targetVel = worldDir.multiplyScalar(this.speed);
    this.velocity.lerp(targetVel, 1 - Math.exp(-dt * 9.0));

    this.camera.position.x += this.velocity.x * dt;
    this.camera.position.z += this.velocity.z * dt;

    // Courtyard bounds clamping
    this.camera.position.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.camera.position.x));
    this.camera.position.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.camera.position.z));

    // Gentle head bob when walking
    if (moving) {
      this.bobTimer += dt * 9.5;
      this.camera.position.y = this.baseY + Math.sin(this.bobTimer) * 0.035;
    } else {
      this.bobTimer = 0;
      this.camera.position.y += (this.baseY - this.camera.position.y) * (1 - Math.exp(-dt * 5));
    }
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
