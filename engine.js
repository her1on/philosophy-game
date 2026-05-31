// =============================================================
// PHILOSOPHY GAME — ENGINE v1.0
// =============================================================
//
// КАК ДОБАВИТЬ СВОЙ ЭТАП (для участников команды):
//   1. Скопируй файл  stages/TEMPLATE.js
//   2. Переименуй его (например stages/stage_ancient.js)
//   3. Заполни данные по образцу — только текст, никакого Three.js
//   4. Добавь в index.html одну строку:
//        <script src="stages/stage_ancient.js"></script>
//   5. Готово — твой этап появится в главном меню автоматически
//
// Движок написан одним файлом, остальные его не трогают.
// =============================================================

const PhiloGame = (() => {
  'use strict';

  // ── Реестр этапов ──────────────────────────────────────────
  const _stages = [];

  function registerStage(config) {
    _stages.push(config);
    console.log(`[PhiloGame] Этап зарегистрирован: "${config.name}"`);
  }

  // ── Three.js ───────────────────────────────────────────────
  let scene, camera, renderer, raycaster, mouse, clock;
  let camPosTarget, camLookTarget, camLookCurrent;
  let _interactive = [];
  let _anims = [];

  // ── Навигация ──────────────────────────────────────────────
  // Стек локаций: ['main', 'modern', 'modern/anti']
  let _locStack = [];
  let _busy = false;   // предотвращает двойные переходы

  // ── Диалог ────────────────────────────────────────────────
  let _dlgQueue = [];
  let _dlgDone  = null;

  // ==========================================================
  // START
  // ==========================================================
  function start() {
    window.addEventListener('load', () => {
      if (typeof THREE === 'undefined') {
        _fatal('Three.js не загружен.<br>Откройте через: <b>http://localhost:8765/</b>');
        return;
      }
      try { _init(); }
      catch (e) { _fatal(e.toString()); }
    });
  }

  function _init() {
    camPosTarget   = new THREE.Vector3(0, 6, 22);
    camLookTarget  = new THREE.Vector3(0, 1, 0);
    camLookCurrent = new THREE.Vector3(0, 0, 0);

    clock    = new THREE.Clock();
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
    camera.position.set(0, 6, 22);

    raycaster = new THREE.Raycaster();
    mouse     = new THREE.Vector2();

    _buildStarfield();
    _goto('main');

    addEventListener('resize', _onResize);
    addEventListener('click',  _onClick);
    addEventListener('mousemove', _onMouseMove);

    setTimeout(() => {
      const el = document.getElementById('loading');
      el.style.opacity = '0';
      setTimeout(() => el.style.display = 'none', 600);
    }, 800);

    _loop();
  }

  // ==========================================================
  // НАВИГАЦИЯ
  // ==========================================================

  // Перейти в локацию (добавить в стек или нет)
  function _goto(key, push = true) {
    if (_busy) return;
    _busy = true;
    _closePanel();

    if (push) _locStack.push(key);

    setTimeout(() => {
      _buildLocation(key);
      _busy = false;
    }, 260);
  }

  function _buildLocation(key) {
    if (key === 'main') {
      _buildMainHub();
    } else if (key.includes('/')) {
      const [stageId, subId] = key.split('/');
      _buildSubLoc(stageId, subId);
    } else {
      _buildStageHub(key);
    }
  }

  function goBack() {
    if (_busy || _locStack.length <= 1) return;
    _locStack.pop();
    const prev = _locStack[_locStack.length - 1];
    _goto(prev, false);   // false — не дублировать в стеке
  }

  // ==========================================================
  // СЦЕНА: ГЛАВНЫЙ ХАБ
  // ==========================================================
  function _buildMainHub() {
    _clearScene();
    scene.background = new THREE.Color(0x00000a);
    scene.fog = new THREE.FogExp2(0x00000a, 0.015);
    _hud('ФИЛОСОФСКИЙ ДЕТЕКТИВ', false);
    camPosTarget.set(0, 7, 24);
    camLookTarget.set(0, 1, 0);

    _add(new THREE.AmbientLight(0x202040, 1.8));
    const dl = new THREE.DirectionalLight(0x8070ff, 1.5);
    dl.position.set(10, 20, 10);
    _add(dl);

    // Пол
    const floor = _mesh(
      new THREE.CylinderGeometry(35, 38, 0.5, 80),
      _mat(0x080818, 0, 0.9)
    );
    floor.position.y = -0.25;
    _add(floor);

    // Концентрические кольца на полу
    [6, 12, 20].forEach(r => {
      const ring = _mesh(
        new THREE.TorusGeometry(r, 0.04, 8, 120),
        new THREE.MeshBasicMaterial({ color: 0x1a1a40, transparent: true, opacity: 0.5 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.0;
      _add(ring);
    });

    // Острова этапов
    if (_stages.length === 0) {
      _addSprite('НЕТ ЗАРЕГИСТРИРОВАННЫХ ЭТАПОВ', [0, 4, 0], 0xff6060, 7, 1);
    } else {
      _stages.forEach((stage, i) => {
        const angle = (_stages.length === 1)
          ? -Math.PI / 2
          : (i / _stages.length) * Math.PI * 2 - Math.PI / 2;
        const r = _stages.length === 1 ? 0 : 8;
        _buildIsland(stage, Math.cos(angle) * r, 0, Math.sin(angle) * r, i);
      });
    }

    // Центральный маяк
    const beacon = _mesh(new THREE.SphereGeometry(0.6, 32, 32), _matE(0x8080ff, 0x6060ff, 2));
    beacon.position.set(0, 1.5, 0);
    _add(beacon);
    _anims.push({ m: beacon, t: 'pulse', s: 0.8 });
    _add(_ptl(0x6060ff, 4, 18, 0, 1.5, 0));
  }

  function _buildIsland(stage, x, y, z, idx) {
    const col  = stage.color || 0x5050a0;
    const g    = new THREE.Group();

    // Платформа
    const plat = _mesh(new THREE.CylinderGeometry(3.8, 4.2, 0.4, 8), _mat(col, col, 0.8));
    plat.material.emissiveIntensity = 0.12;
    g.add(plat);

    // Столбик
    const pil = _mesh(new THREE.CylinderGeometry(0.12, 0.22, 5.5, 8), _matE(col, col, 0.5));
    pil.position.y = 3.0;
    g.add(pil);

    // Гем на верхушке
    const gem = _mesh(new THREE.OctahedronGeometry(0.75), _matE(col, col, 2.2));
    gem.position.y = 6.1;
    g.add(gem);
    _anims.push({ m: gem, t: 'sf', s: 0.55, off: idx * 1.3 });
    const light = new THREE.PointLight(col, 4, 14);
    light.position.y = 6.1;
    g.add(light);

    // Название
    const nameSprite = _spriteObj(stage.name, col, 7, 1.0);
    nameSprite.position.y = 8.0;
    g.add(nameSprite);

    // Эра
    if (stage.era) {
      const eraSprite = _spriteObj(stage.era, 0x8080aa, 5, 0.72);
      eraSprite.position.y = 6.9;
      g.add(eraSprite);
    }

    // Декоративные мини-колонны вокруг платформы
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const mc = _mesh(new THREE.CylinderGeometry(0.12, 0.15, 2, 6), _mat(col, 0, 0.85));
      mc.position.set(Math.cos(a) * 3.2, 1, Math.sin(a) * 3.2);
      g.add(mc);
    }

    g.position.set(x, y, z);
    g.userData.removable    = true;
    g.userData.interactive  = true;
    g.userData.type         = 'island';
    g.userData.stageId      = stage.id;
    g.userData.label        = stage.name;
    g.userData.baseY        = y;

    _anims.push({ m: g, t: 'float', s: 0.28, off: idx * 2.1, baseY: y });
    _interactive.push(g);
    scene.add(g);
  }

  // ==========================================================
  // СЦЕНА: ХАБ ЭТАПА (порталы к суб-локациям)
  // ==========================================================
  function _buildStageHub(stageId) {
    const stage = _stages.find(s => s.id === stageId);
    if (!stage) return;

    _clearScene();
    scene.background = new THREE.Color(stage.fog || 0x00000a);
    scene.fog = new THREE.FogExp2(stage.fog || 0x00000a, 0.022);
    _hud(stage.name.toUpperCase(), true);
    camPosTarget.set(0, 5, 17);
    camLookTarget.set(0, 1, 0);

    _add(new THREE.AmbientLight(stage.color, 1.0));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(8, 15, 10);
    _add(dl);

    const floor = _mesh(new THREE.CylinderGeometry(22, 24, 0.5, 80), _mat(stage.fog || 0x000010, 0, 0.9));
    floor.position.y = -0.25;
    _add(floor);

    // Центральный маяк этапа
    const bc = _mesh(new THREE.SphereGeometry(0.9, 32, 32), _matE(stage.color, stage.color, 2));
    bc.position.set(0, 2.2, 0);
    _add(bc);
    _anims.push({ m: bc, t: 'pulse', s: 1.2 });
    _add(_ptl(stage.color, 5, 22, 0, 2.2, 0));

    // Название этапа над маяком
    _addSprite(stage.name, [0, 5.5, 0], stage.color, 8, 1.0);

    // Кольцо колонн
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      _add(_column(Math.cos(a) * 13, Math.sin(a) * 13, stage.color));
    }

    // Порталы к суб-локациям
    const subs = stage.sublocs || [];
    subs.forEach((sub, i) => {
      const angle  = subs.length === 1 ? -Math.PI / 2 : (i / subs.length) * Math.PI * 2 - Math.PI / 2;
      const radius = subs.length === 1 ? 0 : 5.5;
      _buildPortal(sub, Math.cos(angle) * radius, 1.8, Math.sin(angle) * radius, i, stageId);
    });

    _buildParticles(stage.color, 180);
  }

  function _buildPortal(sub, x, y, z, idx, stageId) {
    const col = sub.color || 0x6060ff;
    const g   = new THREE.Group();

    const ring = _mesh(new THREE.TorusGeometry(2.2, 0.13, 16, 80), _matE(col, col, 1.5));
    g.add(ring);
    _anims.push({ m: ring, t: 'pe', s: 1.3, off: idx * 2 });

    const fill = _mesh(
      new THREE.CircleGeometry(2.05, 80),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    g.add(fill);

    const inner = _mesh(new THREE.TorusGeometry(1.3, 0.07, 8, 60), _matE(col, col, 1));
    g.add(inner);
    _anims.push({ m: inner, t: 'rot_self', s: 0.8 });

    const pl = new THREE.PointLight(col, 3.5, 10);
    g.add(pl);

    const nameSp = _spriteObj(sub.name, col, 6.5, 0.88);
    nameSp.position.y = 3.5;
    g.add(nameSp);

    if (sub.subtitle) {
      const subSp = _spriteObj(sub.subtitle, 0x7090aa, 5.5, 0.7);
      subSp.position.y = 2.55;
      g.add(subSp);
    }

    g.position.set(x, y, z);
    g.userData.removable   = true;
    g.userData.interactive = true;
    g.userData.type        = 'portal';
    g.userData.stageId     = stageId;
    g.userData.subId       = sub.id;
    g.userData.label       = sub.name;
    g.userData.baseY       = y;

    _anims.push({ m: g, t: 'float', s: 0.4, off: idx * 1.6, baseY: y });
    _interactive.push(g);
    scene.add(g);
  }

  // ==========================================================
  // СЦЕНА: СУБ-ЛОКАЦИЯ (святилища направлений)
  // ==========================================================
  function _buildSubLoc(stageId, subId) {
    const stage = _stages.find(s => s.id === stageId);
    if (!stage) return;
    const sub = (stage.sublocs || []).find(s => s.id === subId);
    if (!sub) return;

    _clearScene();
    const fogCol = sub.fog || stage.fog || 0x000010;
    scene.background = new THREE.Color(fogCol);
    scene.fog = new THREE.FogExp2(fogCol, 0.025);
    _hud(sub.name.toUpperCase(), true);

    const n    = (sub.directions || []).length;
    const dist = n <= 3 ? 16 : 20;
    camPosTarget.set(0, 6, dist);
    camLookTarget.set(0, 0, 0);

    _add(new THREE.AmbientLight(sub.color, 1.3));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(8, 15, 10);
    _add(dl);

    const floor = _mesh(new THREE.CylinderGeometry(24, 27, 0.5, 80), _mat(fogCol, 0, 0.9));
    floor.position.y = -0.25;
    _add(floor);

    const bc = _mesh(new THREE.SphereGeometry(0.9, 32, 32), _matE(sub.color, sub.color, 2));
    bc.position.set(0, 2.2, 0);
    _add(bc);
    _anims.push({ m: bc, t: 'pulse', s: 1.2 });
    _add(_ptl(sub.color, 5, 25, 0, 2.2, 0));

    (sub.directions || []).forEach((dir, i) => {
      const angle  = (i / n) * Math.PI * 2 - Math.PI / 2;
      const radius = n <= 3 ? 6.5 : 8.5;
      _buildShrine(dir, Math.cos(angle) * radius, 0, Math.sin(angle) * radius, i);
    });

    _buildParticles(sub.color, n * 60);
  }

  const _GEO_SHAPES = [
    () => new THREE.OctahedronGeometry(0.72),
    () => new THREE.TetrahedronGeometry(0.78),
    () => new THREE.DodecahedronGeometry(0.65),
    () => new THREE.IcosahedronGeometry(0.68),
    () => new THREE.TorusKnotGeometry(0.4, 0.15, 80, 8),
    () => new THREE.ConeGeometry(0.55, 1.1, 8),
  ];

  function _buildShrine(dir, x, y, z, idx) {
    const col = dir.color || 0x8080ff;
    const g   = new THREE.Group();

    const base = _mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.35, 8), _mat(0x1c1c38, 0, 0.8));
    base.position.y = 0.17;
    g.add(base);

    const pil = _mesh(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 8), _matE(col, col, 0.4));
    pil.position.y = 1.75;
    g.add(pil);

    const top = _mesh(_GEO_SHAPES[idx % 6](), _matE(col, col, 2.2));
    top.position.y = 3.5;
    g.add(top);
    _anims.push({ m: top, t: 'sf', s: 0.5 + idx * 0.08, off: idx * 0.9 });

    const light = new THREE.PointLight(col, 2.5, 7);
    light.position.y = 3.5;
    g.add(light);

    const label = _spriteObj(dir.name, col, 4, 0.78);
    label.position.y = 5.4;
    g.add(label);

    g.position.set(x, y, z);
    g.userData.removable   = true;
    g.userData.interactive = true;
    g.userData.type        = 'shrine';
    g.userData.dir         = dir;
    g.userData.label       = dir.name;

    _interactive.push(g);
    scene.add(g);
  }

  // ==========================================================
  // ВСПОМОГАТЕЛЬНЫЕ ОБЪЕКТЫ
  // ==========================================================
  function _column(x, z, color) {
    const g   = new THREE.Group();
    const pil = _mesh(new THREE.CylinderGeometry(0.28, 0.38, 5.5, 8), _mat(color || 0x202040, 0, 0.9));
    pil.position.y = 2.75;
    g.add(pil);
    const cap = _mesh(new THREE.CylinderGeometry(0.44, 0.28, 0.4, 8), _mat(color || 0x202040, 0, 0.9));
    cap.position.y = 5.7;
    g.add(cap);
    g.position.set(x, 0, z);
    return g;
  }

  function _buildStarfield() {
    const n   = 3000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 500;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.65 })));
  }

  function _buildParticles(color, n) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 12;
      pos[i*3]   = Math.cos(a) * r;
      pos[i*3+1] = (Math.random() - 0.5) * 6;
      pos[i*3+2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 0.5 }));
    pts.userData.removable = true;
    _anims.push({ m: pts, t: 'rot', s: 0.07 });
    scene.add(pts);
  }

  // ==========================================================
  // ДИАЛОГ
  // ==========================================================
  function _showDialogue(lines, onDone) {
    _dlgQueue = [...lines];
    _dlgDone  = onDone || null;
    _nextLine();
    document.getElementById('dialog-overlay').classList.add('active');
  }

  function _nextLine() {
    if (_dlgQueue.length === 0) {
      document.getElementById('dialog-overlay').classList.remove('active');
      if (_dlgDone) { _dlgDone(); _dlgDone = null; }
      return;
    }
    const line = _dlgQueue.shift();
    document.getElementById('dlg-icon').textContent    = line.icon || (line.speaker ? line.speaker[0] : '?');
    document.getElementById('dlg-speaker').textContent = line.speaker || '';
    document.getElementById('dlg-text').textContent    = line.text;
  }

  // ==========================================================
  // ВЗАИМОДЕЙСТВИЕ
  // ==========================================================
  function _hit(e) {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(_interactive, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.interactive) obj = obj.parent;
    return obj || null;
  }

  function _onClick(e) {
    // Клик по диалогу — следующая строка
    const dlg = document.getElementById('dialog-overlay');
    if (dlg.classList.contains('active')) { _nextLine(); return; }

    if (_busy) return;
    const obj = _hit(e);
    if (!obj) return;

    const type = obj.userData.type;

    if (type === 'island') {
      const stage = _stages.find(s => s.id === obj.userData.stageId);
      if (stage && stage.intro && stage.intro.length) {
        _showDialogue(stage.intro, () => _goto(obj.userData.stageId));
      } else {
        _goto(obj.userData.stageId);
      }
    }

    else if (type === 'portal') {
      const key = `${obj.userData.stageId}/${obj.userData.subId}`;
      _goto(key);
    }

    else if (type === 'shrine') {
      const dir = obj.userData.dir;
      if (dir.dialogue && dir.dialogue.length) {
        _showDialogue(dir.dialogue, () => _openPanel(dir));
      } else {
        _openPanel(dir);
      }
    }
  }

  function _onMouseMove(e) {
    const obj = _hit(e);
    const tt  = document.getElementById('tooltip');
    if (obj) {
      document.body.style.cursor = 'pointer';
      tt.style.cssText = `display:block;left:${e.clientX+14}px;top:${e.clientY-8}px`;
      tt.textContent = obj.userData.label || '';
    } else {
      document.body.style.cursor = 'default';
      tt.style.display = 'none';
    }
  }

  // ==========================================================
  // UI
  // ==========================================================
  function _openPanel(dir) {
    document.getElementById('p-title').textContent = dir.name || '';
    document.getElementById('p-phil').textContent  = dir.philosophers || '';
    document.getElementById('p-desc').textContent  = dir.desc || '';
    document.getElementById('p-quote').textContent = dir.quote || '';
    document.getElementById('p-tags').innerHTML    =
      (dir.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    document.getElementById('info-panel').classList.add('open');
  }

  function _closePanel() {
    document.getElementById('info-panel').classList.remove('open');
  }

  function _hud(title, showBack) {
    document.getElementById('loc-title').textContent    = title;
    document.getElementById('back-btn').style.display   = showBack ? 'block' : 'none';
  }

  // ==========================================================
  // АНИМАЦИЯ
  // ==========================================================
  function _loop() {
    requestAnimationFrame(_loop);
    const t = clock.getElapsedTime();

    _anims.forEach(a => {
      if (!a.m) return;
      const s = a.s || 1, off = a.off || 0;
      switch (a.t) {
        case 'sf':
          a.m.rotation.y += 0.011 * s;
          if (a._bp === undefined) a._bp = a.m.position.y;
          a.m.position.y = a._bp + Math.sin(t * s + off) * 0.14;
          break;
        case 'float':
          a.m.position.y = a.baseY + Math.sin(t * s + off) * 0.22;
          break;
        case 'pulse':
          a.m.material.emissiveIntensity = 1.5 + Math.sin(t * s) * 0.9;
          break;
        case 'pe':
          a.m.material.emissiveIntensity = 1 + Math.sin(t * s + off) * 0.65;
          break;
        case 'rot':
          a.m.rotation.y += 0.001 * s;
          break;
        case 'rot_self':
          a.m.rotation.z += 0.016 * s;
          break;
      }
    });

    camera.position.lerp(camPosTarget, 0.026);
    camLookCurrent.lerp(camLookTarget, 0.032);
    camera.lookAt(camLookCurrent);

    renderer.render(scene, camera);
  }

  // ==========================================================
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ==========================================================
  function _clearScene() {
    const rem = [];
    scene.children.forEach(o => { if (o.userData.removable) rem.push(o); });
    rem.forEach(o => scene.remove(o));
    _interactive = [];
    _anims = [];
  }

  function _add(obj) { obj.userData.removable = true; scene.add(obj); return obj; }

  function _mesh(geo, mat) { return new THREE.Mesh(geo, mat); }

  function _mat(col, em, rough) {
    return new THREE.MeshStandardMaterial({
      color: col,
      emissive: em || 0,
      emissiveIntensity: em ? 0.35 : 0,
      roughness: rough || 0.7
    });
  }

  function _matE(col, em, ei) {
    return new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: ei || 1, roughness: 0.3 });
  }

  function _ptl(col, intensity, dist, x, y, z) {
    const l = new THREE.PointLight(col, intensity, dist);
    l.position.set(x, y, z);
    return l;
  }

  function _spriteObj(text, color, w, h) {
    const c   = document.createElement('canvas');
    c.width   = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font  = 'bold 18px Georgia, serif';
    ctx.fillStyle = '#' + (color || 0xffffff).toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    const lines = text.split('\n');
    const lh    = 26;
    const sy    = 64 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, 256, sy + i * lh));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    sp.scale.set(w || 4, h || 0.8, 1);
    return sp;
  }

  function _addSprite(text, pos, color, w, h) {
    const sp = _spriteObj(text, color, w, h);
    sp.position.set(...pos);
    sp.userData.removable = true;
    scene.add(sp);
  }

  function _onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }

  function _fatal(msg) {
    const el = document.getElementById('loading');
    if (el) el.innerHTML = `
      <div style="color:#ff6060;font-size:1em;letter-spacing:2px;margin-bottom:12px">ОШИБКА</div>
      <div style="color:#ff9090;font-size:.78em;max-width:480px;text-align:center;line-height:1.8">${msg}</div>`;
  }

  // ==========================================================
  // ПУБЛИЧНЫЙ API
  // ==========================================================
  return {
    registerStage,
    start,
    goBack:      () => goBack(),
    closePanel:  () => _closePanel(),
    nextDialogue:() => _nextLine(),
  };
})();
