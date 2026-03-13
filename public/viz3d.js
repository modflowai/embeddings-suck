/**
 * 3D embedding space visualization using Three.js
 * Shows 1,616 document vectors projected to 3D via PCA.
 */

let scene, camera, renderer, controls;
let docPoints = null;
let pointsData = null;
let highlightGroup = null;
let gridGroup = null;
let tooltipDiv = null;
let raycaster, mouse;

const SCALE = 60; // expand -0.6..0.3 range to visible 3D space
const REPO_COLORS = {
  mfusg: 0x8b5cf6,   // purple
  mf6: 0x06b6d4,     // cyan
  flopy: 0xf97316,   // orange
  pyemu: 0xec4899,    // pink
  pest: 0xeab308,    // yellow
  pestpp: 0xa3e635,  // lime
  gwutils: 0x14b8a6, // teal
  pest_hp: 0xf43f5e, // rose
  plproc: 0x6366f1,  // indigo
  modflowai: 0x60a5fa, // blue
};

function repoColor(repo) {
  return REPO_COLORS[repo] || 0x555555;
}

export async function init3D(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  window.__THREE__ = THREE;

  const resp = await fetch("/points-3d.json");
  pointsData = await resp.json();

  // Scene — always dark "deep space" regardless of page theme
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1117');

  const w = container.clientWidth;
  const h = container.clientHeight;
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
  camera.position.set(0, 0, 55);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;
  controls.maxDistance = 120;
  controls.minDistance = 10;

  // Prevent browser auto-scroll on middle click
  renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.5;
  mouse = new THREE.Vector2();

  tooltipDiv = document.createElement("div");
  tooltipDiv.className = "viz-tooltip";
  container.appendChild(tooltipDiv);

  // Create circular point sprite texture
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  const circleTexture = new THREE.CanvasTexture(canvas);

  // Doc points — colored by repo
  const count = pointsData.docs.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const d = pointsData.docs[i];
    positions[i * 3] = d.x * SCALE;
    positions[i * 3 + 1] = d.y * SCALE;
    positions[i * 3 + 2] = d.z * SCALE;
    const c = new THREE.Color(repoColor(d.r));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Store original colors for reset
  geo.userData.originalColors = new Float32Array(colors);

  const mat = new THREE.PointsMaterial({
    size: 0.8,
    map: circleTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    alphaTest: 0.2,
    sizeAttenuation: true,
    depthWrite: false,
  });

  docPoints = new THREE.Points(geo, mat);
  scene.add(docPoints);

  // Center camera on point cloud centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) {
    cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
  }
  const centroid = new THREE.Vector3(cx / count, cy / count, cz / count);
  controls.target.copy(centroid);
  camera.position.set(centroid.x, centroid.y, centroid.z + 55);

  // --- 3D Grid + Axes ---
  gridGroup = new THREE.Group();
  const gridSize = 50;
  const gridDiv = 10;

  buildGrid(THREE, gridGroup, gridSize, gridDiv);
  gridGroup.userData.gridSize = gridSize;
  gridGroup.userData.gridDiv = gridDiv;

  function makeAxis(from, to, color) {
    const axGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from), new THREE.Vector3(...to),
    ]);
    const axMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18 });
    return new THREE.Line(axGeo, axMat);
  }
  const axLen = gridSize;
  gridGroup.add(makeAxis([-axLen, 0, 0], [axLen, 0, 0], 0xdc2626)); // X red
  gridGroup.add(makeAxis([0, -axLen, 0], [0, axLen, 0], 0x16a34a)); // Y green
  gridGroup.add(makeAxis([0, 0, -axLen], [0, 0, axLen], 0x2563eb)); // Z blue
  scene.add(gridGroup);

  // Lighting for 3D spheres
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const keyLight = new THREE.PointLight(0xffffff, 1.2, 200);
  keyLight.position.set(20, 30, 40);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x6688cc, 0.4, 200);
  fillLight.position.set(-30, -10, -20);
  scene.add(fillLight);

  highlightGroup = new THREE.Group();
  scene.add(highlightGroup);

  // Mouse events
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  renderer.domElement.addEventListener("mouseleave", () => {
    tooltipDiv.style.display = "none";
  });

  // Resize
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  animate();
}

function onMouseMove(e) {
  if (!docPoints) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(docPoints);

  if (intersects.length > 0) {
    const doc = pointsData.docs[intersects[0].index];
    tooltipDiv.textContent = `${doc.f} (${doc.r})`;
    tooltipDiv.style.display = "block";
    tooltipDiv.style.left = (e.clientX - renderer.domElement.getBoundingClientRect().left + 14) + "px";
    tooltipDiv.style.top = (e.clientY - renderer.domElement.getBoundingClientRect().top - 10) + "px";
  } else {
    tooltipDiv.style.display = "none";
  }
}

export function highlightSearch(ftsResults, semanticResults, query, winner) {
  if (!scene || !pointsData) return;
  const THREE = window.__THREE__;

  // Clear highlights
  while (highlightGroup.children.length) {
    const c = highlightGroup.children[0];
    c.geometry?.dispose();
    c.material?.dispose();
    highlightGroup.remove(c);
  }

  // Dim all doc points to muted gray — results will pop against this
  const colors = docPoints.geometry.attributes.color;
  const origColors = docPoints.geometry.userData.originalColors;
  for (let i = 0; i < pointsData.docs.length; i++) {
    // Muted slate gray for background dots
    colors.setXYZ(i, 0.25, 0.28, 0.32);
  }

  const fpIndex = {};
  pointsData.docs.forEach((d, i) => { fpIndex[d.f] = i; });

  const ftsSet = new Set(ftsResults.map(r => r.filepath));
  const semSet = new Set((semanticResults || []).map(r => r.filepath));

  // Only color the winning side's corpus dots — loser stays gray
  if (winner !== "sem") {
    const ftsColor = new THREE.Color(0x22c55e);
    for (const fp of ftsSet) {
      const idx = fpIndex[fp];
      if (idx !== undefined) colors.setXYZ(idx, ftsColor.r, ftsColor.g, ftsColor.b);
    }
  }
  if (winner !== "fts") {
    const semColor = new THREE.Color(0x3b82f6);
    for (const fp of semSet) {
      const idx = fpIndex[fp];
      if (idx !== undefined) colors.setXYZ(idx, semColor.r, semColor.g, semColor.b);
    }
  }

  colors.needsUpdate = true;
  docPoints.material.opacity = 0.25;  // Corpus fades back, results in highlightGroup pop

  // Query point
  const qp = pointsData.queries[query];
  if (qp) {
    const qPos = new THREE.Vector3(qp.x * SCALE, qp.y * SCALE, qp.z * SCALE);

    // Query marker — wireframe sphere + inner glow + label
    const qGeo = new THREE.SphereGeometry(1.0, 20, 20);
    const qWire = new THREE.Mesh(qGeo, new THREE.MeshBasicMaterial({ color: 0xff5a5f, wireframe: true, transparent: true, opacity: 0.7 }));
    qWire.position.copy(qPos);
    highlightGroup.add(qWire);
    const qFill = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 20), new THREE.MeshBasicMaterial({ color: 0xff5a5f, transparent: true, opacity: 0.15 }));
    qFill.position.copy(qPos);
    highlightGroup.add(qFill);

    // Glow ring around query
    const glowGeo = new THREE.SphereGeometry(2.0, 20, 20);
    const glowMesh = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff5a5f, wireframe: true, transparent: true, opacity: 0.06 }));
    glowMesh.position.copy(qPos);
    highlightGroup.add(glowMesh);

    highlightGroup.add(makeLabel(`"${query}"`, qPos, 0xff6b81, 1.6));

    // FTS results — #1 prominent, rest subtle
    const ftsIsLoser = winner === "sem";
    for (let i = 0; i < Math.min(3, ftsResults.length); i++) {
      const idx = fpIndex[ftsResults[i].filepath];
      if (idx === undefined) continue;
      const d = pointsData.docs[idx];
      const fPos = new THREE.Vector3(d.x * SCALE, d.y * SCALE, d.z * SCALE);
      const filename = ftsResults[i].filepath.split("/").pop();

      if (i === 0) {
        // #1 — wireframe sphere + fill + label + line
        const fColor = ftsIsLoser ? 0x4a7a5e : 0x34d399;
        const fWire = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshBasicMaterial({ color: fColor, wireframe: true, transparent: true, opacity: ftsIsLoser ? 0.25 : 0.6 }));
        fWire.position.copy(fPos);
        highlightGroup.add(fWire);
        const fFill = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), new THREE.MeshBasicMaterial({ color: fColor, transparent: true, opacity: ftsIsLoser ? 0.08 : 0.12 }));
        fFill.position.copy(fPos);
        highlightGroup.add(fFill);

        const labelText = ftsIsLoser ? "\u2717 " + filename : "\u2713 " + filename;
        const labelColor = ftsIsLoser ? 0x6b8a72 : 0x34d399;
        highlightGroup.add(makeLabel(labelText, fPos, labelColor, 1.0));

        const lineGeo = new THREE.BufferGeometry().setFromPoints([qPos, fPos]);
        const lineMat = new THREE.LineBasicMaterial({ color: ftsIsLoser ? 0x4a7a5e : 0x34d399, transparent: true, opacity: ftsIsLoser ? 0.12 : 0.4 });
        highlightGroup.add(new THREE.Line(lineGeo, lineMat));
      } else {
        // #2, #3 — tiny wireframe dot, no label, no line
        const fc = ftsIsLoser ? 0x4a7a5e : 0x34d399;
        const fMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), new THREE.MeshBasicMaterial({ color: fc, wireframe: true, transparent: true, opacity: 0.25 }));
        fMesh.position.copy(fPos);
        highlightGroup.add(fMesh);
      }
    }

    // Semantic results — #1 prominent, rest subtle
    const semIsLoser = winner === "fts";
    if (semanticResults) {
      for (let i = 0; i < Math.min(3, semanticResults.length); i++) {
        const idx = fpIndex[semanticResults[i].filepath];
        if (idx === undefined) continue;
        const d = pointsData.docs[idx];
        const dPos = new THREE.Vector3(d.x * SCALE, d.y * SCALE, d.z * SCALE);
        const filename = semanticResults[i].filepath.split("/").pop();

        if (i === 0) {
          // #1 — wireframe sphere + fill + label + line
          const sColor = semIsLoser ? 0x4a6a8a : 0x60a5fa;
          const sWire = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshBasicMaterial({ color: sColor, wireframe: true, transparent: true, opacity: semIsLoser ? 0.25 : 0.6 }));
          sWire.position.copy(dPos);
          highlightGroup.add(sWire);
          const sFill = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), new THREE.MeshBasicMaterial({ color: sColor, transparent: true, opacity: semIsLoser ? 0.08 : 0.12 }));
          sFill.position.copy(dPos);
          highlightGroup.add(sFill);
          const labelText = semIsLoser ? "\u2717 " + filename : "\u2713 " + filename;
          const labelColor = semIsLoser ? 0x7a8a9a : 0x60a5fa;
          highlightGroup.add(makeLabel(labelText, dPos, labelColor, 1.0));

          const lineGeo = new THREE.BufferGeometry().setFromPoints([qPos, dPos]);
          const lineMat = new THREE.LineBasicMaterial({ color: semIsLoser ? 0x4a6a8a : 0x60a5fa, transparent: true, opacity: semIsLoser ? 0.12 : 0.4 });
          highlightGroup.add(new THREE.Line(lineGeo, lineMat));
        } else {
          // #2, #3 — tiny wireframe dot, no label, no line
          const sc = semIsLoser ? 0x4a6a8a : 0x60a5fa;
          const sMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), new THREE.MeshBasicMaterial({ color: sc, wireframe: true, transparent: true, opacity: 0.25 }));
          sMesh.position.copy(dPos);
          highlightGroup.add(sMesh);
        }
      }
    }

    // Keep camera centered on origin, just update target toward query
    controls.target.set(0, 0, 0);
  }
}

function buildGrid(THREE, group, gridSize, gridDiv) {
  // Remove old grid helper if any
  for (let i = group.children.length - 1; i >= 0; i--) {
    if (group.children[i].isGridHelper) {
      group.children[i].geometry?.dispose();
      if (Array.isArray(group.children[i].material)) {
        group.children[i].material.forEach(m => m.dispose());
      } else {
        group.children[i].material?.dispose();
      }
      group.remove(group.children[i]);
    }
  }

  // Grid always dark-themed (chart is always dark)
  const gridHelper = new THREE.GridHelper(gridSize * 2, gridDiv * 2, 0x1e293b, 0x161d2e);
  gridHelper.position.y = -gridSize / 2;
  const mats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
  mats.forEach(m => {
    m.transparent = true;
    m.opacity = 0.12;
  });
  group.add(gridHelper);
}

export function updateThemeBg() {
  // Scene stays dark regardless of page theme — no-op for background.
  // Grid also stays dark-themed, so no rebuild needed.
}

export function resetViz() {
  if (!scene || !pointsData) return;

  while (highlightGroup.children.length) {
    const c = highlightGroup.children[0];
    c.geometry?.dispose();
    c.material?.dispose();
    highlightGroup.remove(c);
  }

  // Restore original colors
  const colors = docPoints.geometry.attributes.color;
  const originals = docPoints.geometry.userData.originalColors;
  for (let i = 0; i < originals.length; i++) {
    colors.array[i] = originals[i];
  }
  colors.needsUpdate = true;
  docPoints.material.opacity = 0.45;
}

function makeLabel(text, position, color, yOffset = 1.0) {
  const THREE = window.__THREE__;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const fontSize = 15;
  const font = `600 ${fontSize}px 'Geist', -apple-system, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width + 16;
  const textHeight = fontSize + 8;

  canvas.width = Math.min(textWidth, 800);
  canvas.height = textHeight;

  // Text with shadow for readability on dark scene
  const c = new THREE.Color(color);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dark outline for readability on dark background
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = `rgb(${c.r*255|0}, ${c.g*255|0}, ${c.b*255|0})`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const aspect = canvas.width / canvas.height;
  const spriteScale = 1.5;

  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(spriteScale * aspect, spriteScale, 1);
  sprite.position.set(position.x, position.y + yOffset + 1.5, position.z);

  return sprite;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
