import * as THREE from 'three';

const COLORS = {
  ground: 0x4a5240,
  concrete: 0x6b6f74,
  wall: 0x8a8d92,
  crate: 0x9c6b3c,
  door: 0x5a3f26,
  guard: 0x44503d,
  scout: 0x3d4a50,
  heavy: 0x2f332c,
  hostage: 0xd9c27a,
};

export class GameRenderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low' });
    this.renderer.shadowMap.enabled = settings.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb4c9);
    this.scene.fog = settings.quality === 'low'
      ? new THREE.Fog(0x9fb4c9, 45, 90)
      : new THREE.Fog(0x9fb4c9, 70, 140);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 400);
    this.yawRig = new THREE.Object3D();
    this.yawRig.add(this.camera);
    this.scene.add(this.yawRig);
    this.enemyMeshes = new Map();
    this.pickupMeshes = new Map();
    this.objectiveMarkers = new Map();
    this.tracers = [];
    this.recoil = 0;
    this.bob = 0;
  }

  applySettings(settings) {
    this.settings = settings;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    const q = settings.quality;
    const pixel = q === 'low' ? 0.75 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * pixel);
    this.renderer.shadowMap.enabled = q === 'high';
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildWorld(map) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 100),
      new THREE.MeshLambertMaterial({ color: COLORS.ground })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(44.4, 46.4),
      new THREE.MeshLambertMaterial({ color: COLORS.concrete })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, -3);
    this.scene.add(floor);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x3a3f35, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    sun.position.set(30, 50, 20);
    if (this.settings.quality === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -45;
      sun.shadow.camera.right = 45;
      sun.shadow.camera.top = 45;
      sun.shadow.camera.bottom = -45;
    }
    this.scene.add(sun);

    const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.wall });
    for (const b of map.walls) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.maxX - b.minX, b.maxY, b.maxZ - b.minZ),
        wallMat
      );
      mesh.position.set((b.minX + b.maxX) / 2, b.maxY / 2, (b.minZ + b.maxZ) / 2);
      this.scene.add(mesh);
    }
    const crateMat = new THREE.MeshLambertMaterial({ color: COLORS.crate });
    for (const b of map.crates) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.maxX - b.minX, b.maxY, b.maxZ - b.minZ),
        crateMat
      );
      mesh.position.set((b.minX + b.maxX) / 2, b.maxY / 2, (b.minZ + b.maxZ) / 2);
      this.scene.add(mesh);
    }

    for (const d of map.doors) {
      const along = d.axis === 'x' ? d.maxX - d.minX : d.maxZ - d.minZ;
      const thick = d.axis === 'x' ? d.maxZ - d.minZ : d.maxX - d.minX;
      const geo = d.axis === 'x'
        ? new THREE.BoxGeometry(along, d.maxY, thick)
        : new THREE.BoxGeometry(thick, d.maxY, along);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS.door }));
      mesh.position.set(d.x, d.maxY / 2, d.z);
      this.scene.add(mesh);
      this.doorMeshes ??= new Map();
      this.doorMeshes.set(d.id, mesh);
    }

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.06, 24),
      new THREE.MeshBasicMaterial({ color: 0x33ff77, transparent: true, opacity: 0.5 })
    );
    pad.position.set(map.extraction.x, 0.04, map.extraction.z);
    this.scene.add(pad);
    this.extractionPad = pad;
    const smoke = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 6, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    smoke.position.set(map.extraction.x, 3, map.extraction.z);
    this.scene.add(smoke);
    this.extractionSmoke = smoke;

    const spawn = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.05, 20),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.35 })
    );
    spawn.position.set(map.playerSpawn.x, 0.03, map.playerSpawn.z);
    this.scene.add(spawn);
  }

  buildEnemy(e) {
    const group = new THREE.Group();
    const color = e.typeId === 'scout' ? COLORS.scout : e.typeId === 'heavy' ? COLORS.heavy : COLORS.guard;
    const mat = new THREE.MeshLambertMaterial({ color });
    const bodyH = e.typeId === 'heavy' ? 1.05 : 0.9;
    const bodyW = e.typeId === 'heavy' ? 0.62 : 0.5;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, 0.32), mat);
    body.position.y = 0.85;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshLambertMaterial({ color: 0xc9a384 })
    );
    head.position.y = 1.52;
    group.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.07, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x222622 })
    );
    visor.position.set(0, 1.54, -0.15);
    group.add(visor);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.12, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x23262b })
    );
    gun.position.set(0.22, 1.2, -0.4);
    group.add(gun);
    this.scene.add(group);
    this.enemyMeshes.set(e.id, { group, head, body, gun });
  }

  buildHostage() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.9, 0.3),
      new THREE.MeshLambertMaterial({ color: COLORS.hostage })
    );
    body.position.y = 0.85;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshLambertMaterial({ color: 0xd9b08c })
    );
    head.position.y = 1.5;
    group.add(head);
    this.scene.add(group);
    this.hostageMesh = { group, body, head };
  }

  buildPickup(pk) {
    const colors = {
      medkit: 0xff5555, bandage: 0xffdddd, armor: 0x5588ff,
      ammo_pistol: 0xddaa33, ammo_rifle: 0xddaa33, ammo_shotgun: 0xcc7733,
      data_drive: 0x33ffdd,
    };
    const geo = pk.type === 'data_drive'
      ? new THREE.BoxGeometry(0.28, 0.12, 0.22)
      : new THREE.BoxGeometry(0.34, 0.22, 0.34);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: colors[pk.type] || 0xffffff })
    );
    mesh.position.set(pk.pos.x, 0.15, pk.pos.z);
    this.scene.add(mesh);
    let light = null;
    if (pk.type === 'data_drive') {
      light = new THREE.PointLight(0x33ffdd, 0.8, 4);
      light.position.set(pk.pos.x, 0.8, pk.pos.z);
      this.scene.add(light);
    }
    this.pickupMeshes.set(pk.id, { mesh, light });
  }

  buildObjectiveMarkers(map) {
    const defs = [
      { id: 'intel', pos: map.objectives.intel.zone, color: 0x33ccff },
      { id: 'device', pos: map.objectives.device.zone, color: 0xff8833 },
      { id: 'hostage', pos: map.objectives.hostage.zone, color: 0xffdd44 },
    ];
    for (const d of defs) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.8 })
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(d.pos.x, 0.15, d.pos.z);
      this.scene.add(mesh);
      const term = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.1, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x33373d })
      );
      term.position.set(d.pos.x, 0.55, d.pos.z);
      this.scene.add(term);
      this.objectiveMarkers.set(d.id, { mesh, term, done: false });
    }
  }

  buildViewModel() {
    const group = new THREE.Group();
    this.camera.add(group);
    this.viewModel = group;
    this.setViewModel('rifle');
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0 })
    );
    group.add(this.muzzle);
    this.muzzleLight = new THREE.PointLight(0xffcc55, 0, 6);
    group.add(this.muzzleLight);
  }

  setViewModel(id) {
    if (!this.viewModel) return;
    if (this.weaponMesh) {
      this.viewModel.remove(this.weaponMesh);
      this.weaponMesh.geometry.dispose();
    }
    const mat = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
    let mesh;
    if (id === 'pistol') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3), mat);
      mesh.position.set(0.22, -0.2, -0.45);
    } else if (id === 'shotgun') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.85), mat);
      mesh.position.set(0.24, -0.21, -0.6);
    } else {
      mesh = new THREE.Group();
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), mat);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.1), new THREE.MeshLambertMaterial({ color: 0x111418 }));
      mag.position.set(0, -0.16, 0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), mat);
      stock.position.set(0, -0.02, 0.4);
      mesh.add(bodyM, mag, stock);
      mesh.position.set(0.24, -0.22, -0.5);
    }
    this.weaponMesh = mesh;
    this.viewModel.add(mesh);
    this.viewModelId = id;
  }

  setMuzzle(worldPos) {
    if (!this.muzzle) return;
    this.muzzle.material.opacity = 1;
    this.muzzleLight.intensity = 2.2;
    this.muzzleFlashAt = performance.now() / 1000;
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.8 })
    );
    this.scene.add(line);
    this.tracers.push({ line, until: performance.now() / 1000 + 0.06 });
  }

  addImpact(pos) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffaa })
    );
    spark.position.set(pos.x, pos.y, pos.z);
    this.scene.add(spark);
    this.tracers.push({ spark, until: performance.now() / 1000 + 0.12 });
  }

  update(game, dt, aimBlend) {
    const p = game.player;
    this.yawRig.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
    this.yawRig.rotation.y = p.yaw;
    this.recoil *= Math.pow(0.0001, dt);
    // Recoil kicks the view upward (negative rotation.x).
    this.camera.rotation.x = -p.pitch - this.recoil;

    // View model sway / aim position.
    if (this.viewModel) {
      if (this.viewModelId !== p.currentWeapon) this.setViewModel(p.currentWeapon);
      const speed = Math.hypot(p.vel.x, p.vel.z);
      this.bob += dt * speed * 1.8;
      const bobY = Math.sin(this.bob * 2) * 0.008 * Math.min(1, speed);
      const aimX = p.aiming ? 0 : 0.24;
      const aimY = p.aiming ? -0.13 : -0.22;
      const aimZ = p.aiming ? -0.32 : -0.5;
      const vm = this.viewModel;
      vm.position.x += (aimX - vm.position.x) * Math.min(1, dt * 12);
      vm.position.y += (aimY + bobY - vm.position.y) * Math.min(1, dt * 12);
      vm.position.z += (aimZ - vm.position.z) * Math.min(1, dt * 12);
    }
    if (this.muzzle && this.muzzleFlashAt) {
      const age = performance.now() / 1000 - this.muzzleFlashAt;
      const v = Math.max(0, 1 - age * 14);
      this.muzzle.material.opacity = v;
      this.muzzleLight.intensity = v * 2.2;
    }

    // Enemies.
    for (const e of game.enemies) {
      const m = this.enemyMeshes.get(e.id);
      if (!m) continue;
      m.group.visible = !e.dead || performance.now() / 1000 - (e.diedAt || 0) < 4;
      m.group.position.set(e.pos.x, 0, e.pos.z);
      m.group.rotation.y = e.yaw + Math.PI;
      if (e.dead) {
        m.group.rotation.z = Math.PI / 2;
        m.group.position.y = 0.2;
      } else {
        m.group.rotation.z = 0;
        m.group.position.y = e.crouching ? -0.35 : 0;
      }
      // Muzzle flash on enemies.
      const flashAge = game.elapsed - e.flashAt;
      if (flashAge < 0.07) {
        m.gun.scale.z = 1.4;
      } else {
        m.gun.scale.z = 1;
      }
    }

    // Hostage.
    if (this.hostageMesh) {
      const h = game.hostage;
      this.hostageMesh.group.visible = h.alive;
      this.hostageMesh.group.position.set(h.pos.x, 0, h.pos.z);
      const dx = p.pos.x - h.pos.x;
      const dz = p.pos.z - h.pos.z;
      this.hostageMesh.group.rotation.y = Math.atan2(dx, -dz) + Math.PI;
    }

    // Pickups.
    for (const pk of game.pickups) {
      const m = this.pickupMeshes.get(pk.id);
      if (!m) {
        if (!pk.taken) this.buildPickup(pk);
      } else if (pk.taken) {
        this.scene.remove(m.mesh);
        if (m.light) this.scene.remove(m.light);
        this.pickupMeshes.delete(pk.id);
      } else {
        m.mesh.rotation.y += dt * 1.5;
        m.mesh.position.y = 0.15 + Math.sin(game.elapsed * 3 + pk.pos.x) * 0.05;
      }
    }

    // Doors animate to open/closed.
    for (const d of game.map.doors) {
      const mesh = this.doorMeshes.get(d.id);
      if (!mesh) continue;
      const targetY = d.open ? d.maxY + 0.4 : d.maxY / 2;
      mesh.position.y += (targetY - mesh.position.y) * Math.min(1, dt * 8);
      const mat = mesh.material;
      mat.opacity = d.open ? 0.25 : 1;
      mat.transparent = d.open;
    }

    // Objective markers.
    for (const [id, marker] of this.objectiveMarkers) {
      const done = game.objectives[id].done;
      marker.mesh.material.opacity = done ? 0.15 : 0.8;
      marker.term.material.color.setHex(done ? 0x2a4a2a : 0x33373d);
      if (!done) marker.mesh.rotation.z += dt;
    }

    // Extraction pad.
    if (this.extractionPad) {
      this.extractionPad.material.opacity = game.extractionOpen ? 0.7 : 0.25;
      this.extractionPad.material.color.setHex(game.extractionOpen ? 0x33ff77 : 0x557766);
      this.extractionSmoke.visible = game.extractionOpen;
      this.extractionSmoke.rotation.y += dt;
    }

    // Tracers / sparks cleanup.
    const now = performance.now() / 1000;
    this.tracers = this.tracers.filter((t) => {
      if (now > t.until) {
        if (t.line) this.scene.remove(t.line);
        if (t.spark) this.scene.remove(t.spark);
        return false;
      }
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
