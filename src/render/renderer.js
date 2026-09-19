import * as THREE from 'three';
import { eyePosition } from '../core/player.js';

// Builds and updates the Three.js scene from the core game state.
export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low' });
    this.renderer.setPixelRatio(settings.quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb2c4);
    this.scene.fog = settings.quality === 'low'
      ? new THREE.Fog(0x9fb2c4, 40, 90)
      : new THREE.Fog(0x9fb2c4, 60, 160);

    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 400);

    this._setupLights();
    this._setupGround();

    this.enemyMeshes = new Map();
    this.hostageMesh = null;
    this.pickupMeshes = new Map();
    this.tracers = [];
    this.sparks = [];
    this.muzzle = null;
    this.muzzleTimer = 0;
    this.viewModel = null;

    this._recoilOffset = 0;
    this._bobTime = 0;
    this._bobOffset = 0;
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xdfe9f2, 0x3c4a36, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
    sun.position.set(30, 50, 20);
    if (this.settings.quality !== 'low') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.settings.quality === 'high' ? 2048 : 1024, this.settings.quality === 'high' ? 2048 : 1024);
      sun.shadow.camera.left = -45;
      sun.shadow.camera.right = 45;
      sun.shadow.camera.top = 45;
      sun.shadow.camera.bottom = -45;
    }
    this.scene.add(sun);
  }

  _setupGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0x5a6b4e })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // concrete yard apron
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshLambertMaterial({ color: 0x7d8278 })
    );
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = 0.02;
    yard.receiveShadow = true;
    this.scene.add(yard);
  }

  buildFromGame(game) {
    // clear old dynamic groups
    for (const k of ['worldGroup']) {
      if (this[k]) { this.scene.remove(this[k]); }
    }
    const group = new THREE.Group();
    this.worldGroup = group;

    const matFor = (tag) => {
      switch (tag) {
        case 'fence': return new THREE.MeshLambertMaterial({ color: 0x6d7766 });
        case 'crate': return new THREE.MeshLambertMaterial({ color: 0x8a6b3f });
        case 'container': return new THREE.MeshLambertMaterial({ color: 0x4f6f52 });
        case 'barrier': return new THREE.MeshLambertMaterial({ color: 0x8a8270 });
        case 'rack': return new THREE.MeshLambertMaterial({ color: 0x33404a });
        case 'desk': return new THREE.MeshLambertMaterial({ color: 0x5d5140 });
        case 'platform': return new THREE.MeshLambertMaterial({ color: 0x6e7368 });
        default: return new THREE.MeshLambertMaterial({ color: 0x9aa08f });
      }
    };

    for (const b of game.map.boxes) {
      const sx = b.max[0] - b.min[0];
      const sy = b.max[1] - b.min[1];
      const sz = b.max[2] - b.min[2];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), matFor(b.tag));
      mesh.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.boxId = b.id;
      mesh.userData.tag = b.tag;
      group.add(mesh);
    }

    // doors (track separately so they animate open)
    this.doorMeshes = new Map();
    for (const d of game.map.doors) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x70482c }));
      m.position.set(d.axis === 'x' ? d.at : d.fixed, 1.2, d.axis === 'x' ? d.fixed : d.at);
      m.castShadow = true;
      group.add(m);
      this.doorMeshes.set(d.id, m);
    }

    // enemies
    for (const e of game.enemies) {
      const g = this._makeHumanoid(e.def.color, e.def.radius, e.def.armor);
      g.position.set(e.pos[0], e.pos[1], e.pos[2]);
      group.add(g);
      this.enemyMeshes.set(e.id, g);
    }

    // hostage (distinct orange suit)
    this.hostageMesh = this._makeHumanoid(0xd07a2e, 0.35, false);
    group.add(this.hostageMesh);

    // pickups
    for (const pk of game.pickups) {
      const color = pk.itemId === 'medkit' ? 0xffffff :
        pk.itemId === 'dataDrive' ? 0x66e0ff : 0xd8b44a;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      m.position.set(pk.x, 0.4, pk.z);
      group.add(m);
      this.pickupMeshes.set(pk.id, m);
    }

    // objective markers: console + extraction zone
    const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2c4a52, emissive: 0x123038 }));
    consoleMesh.position.set(game.map.zones.console.x, 0.55, game.map.zones.console.z);
    group.add(consoleMesh);
    this.consoleMesh = consoleMesh;

    const extGeo = new THREE.RingGeometry(2.4, 3, 40);
    const extMat = new THREE.MeshBasicMaterial({ color: 0x66e07f, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.extractionRing = new THREE.Mesh(extGeo, extMat);
    this.extractionRing.rotation.x = -Math.PI / 2;
    this.extractionRing.position.set(game.map.zones.extraction.x, 0.05, game.map.zones.extraction.z);
    group.add(this.extractionRing);

    this.scene.add(group);

    this._buildViewModel();
  }

  _makeHumanoid(color, radius = 0.4, armor = false) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: armor ? 0x2f3527 : color });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.7, 0.72, radius * 1.1), bodyMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.5, 0.75, radius * 1),
      new THREE.MeshLambertMaterial({ color: 0x2b2f28 }));
    legs.position.y = 0.42;
    legs.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.05, 0.32, radius * 1.05),
      new THREE.MeshLambertMaterial({ color: 0xc9a186 }));
    head.position.y = 1.72;
    head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.2, 0.14, radius * 1.2),
      new THREE.MeshLambertMaterial({ color: 0x3a4632 }));
    helmet.position.y = 1.92;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x222620 }));
    gun.position.set(0.25, 1.25, 0.35);
    g.add(torso, legs, head, helmet, gun);
    g.userData.head = head;
    return g;
  }

  _buildViewModel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x20241f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), mat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.42);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), mat);
    grip.position.set(0, -0.14, 0.1);
    g.add(body, barrel, grip);
    this.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.9 }));
    this.muzzle.position.set(0, 0.03, -0.66);
    this.muzzle.visible = false;
    g.add(this.muzzle);
    this.scene.add(g);
    this.viewModel = g;
  }

  setWeaponView(weaponId, ads) {
    if (!this.viewModel) return;
    const scale = weaponId === 'pistol' ? 0.85 : weaponId === 'shotgun' ? 1.25 : 1.05;
    this.viewModel.scale.setScalar(scale);
    this._targetAds = ads ? 1 : 0;
  }

  flashMuzzle() {
    if (!this.muzzle) return;
    this.muzzle.visible = true;
    this.muzzleTimer = 0.05;
  }

  addTracer(from, dir, weaponId, enemyShot = false) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(from[0] + dir[0] * 60, from[1] + dir[1] * 60, from[2] + dir[2] * 60),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: enemyShot ? 0xff8a5a : 0xffe39a, transparent: true, opacity: 0.7,
    }));
    this.worldGroup.add(line);
    this.tracers.push({ mesh: line, life: 0.08 });
  }

  addSpark(point, color = 0xffc46a) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
      new THREE.MeshBasicMaterial({ color }));
    m.position.set(...point);
    this.worldGroup.add(m);
    this.sparks.push({ mesh: m, life: 0.25 });
  }

  update(game, dt) {
    const p = game.player;
    const eye = eyePosition(p);
    this.camera.position.set(eye[0], eye[1] - this._bobOffset, eye[2]);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;

    // fov change for sprint / ads
    const targetFov = p.ads ? this.settings.fov * 0.8 :
      p.sprinting ? this.settings.fov * 1.08 : this.settings.fov;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    // view bob
    const moving = Math.hypot(p.vel[0], p.vel[2]);
    this._bobTime += dt * moving * 1.6;
    const targetBob = p.onGround && moving > 0.5 ? (p.crouching ? 0.018 : 0.04) : 0;
    this._bobOffset = Math.sin(this._bobTime) * targetBob;

    // view model position: lower-right, moves toward center when ADS
    if (this.viewModel) {
      const ads = p.ads ? 1 : 0;
      this.viewModel.position.copy(this.camera.position);
      this.viewModel.quaternion.copy(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.viewModel.position.addScaledVector(right, 0.28 - ads * 0.14);
      this.viewModel.position.addScaledVector(up, -0.22 + ads * 0.16 - this._bobOffset * 0.4);
      this.viewModel.position.addScaledVector(fwd, 0.45);
      this._recoilOffset *= Math.exp(-dt * 12);
      this.viewModel.position.addScaledVector(fwd, -this._recoilOffset);
      this.viewModel.visible = p.alive;
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.visible = false;
    }

    // enemies
    for (const e of game.enemies) {
      const m = this.enemyMeshes.get(e.id);
      if (!m) continue;
      m.visible = e.alive;
      if (e.alive) {
        m.position.set(e.pos[0], e.pos[1], e.pos[2]);
        m.rotation.y = e.yaw;
      } else {
        m.position.set(e.pos[0], 0.12, e.pos[2]);
        m.rotation.x = Math.PI / 2;
      }
    }

    if (this.hostageMesh) {
      this.hostageMesh.visible = game.hostage.alive;
      this.hostageMesh.position.set(game.hostage.pos[0], game.hostage.pos[1], game.hostage.pos[2]);
      this.hostageMesh.rotation.y = game.hostage.yaw;
    }

    // pickup spin/hover and hide taken ones
    for (const pk of game.pickups) {
      const m = this.pickupMeshes.get(pk.id);
      if (!m) continue;
      m.visible = !pk.taken;
      if (!pk.taken) {
        m.rotation.y += dt * 2;
        m.position.y = 0.4 + Math.sin(game.time * 3 + pk.x) * 0.08;
      }
    }

    // doors slide open
    for (const d of game.map.doors) {
      const m = this.doorMeshes.get(d.id);
      if (!m) continue;
      const targetY = d.open ? -2.5 : 1.2;
      m.position.y += (targetY - m.position.y) * Math.min(1, dt * 8);
    }

    if (this.extractionRing) {
      const active = game.extractionActive;
      this.extractionRing.material.color.setHex(active ? 0x66ff8a : 0x6a9ab0);
      this.extractionRing.material.opacity = active ? 0.45 + Math.sin(game.time * 4) * 0.2 : 0.3;
    }

    // tracers / sparks fade
    for (const t of this.tracers) {
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.08) * 0.7;
    }
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) { this.worldGroup.remove(t.mesh); return false; }
      return true;
    });
    for (const s of this.sparks) {
      s.life -= dt;
      s.mesh.scale.setScalar(Math.max(0.1, s.life * 3));
    }
    this.sparks = this.sparks.filter((s) => {
      if (s.life <= 0) { this.worldGroup.remove(s.mesh); return false; }
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  }

  recoilKick(amount) {
    this._recoilOffset += amount;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  applyQuality(quality) {
    this.settings.quality = quality;
    this.renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
  }
}
