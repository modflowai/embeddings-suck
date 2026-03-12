/**
 * 3D embedding space visualization using Three.js
 * Shows 1,616 document vectors projected to 3D via PCA.
 */

let scene, camera, renderer, controls;
let docPoints = null;
let pointsData = null;
let highlightGroup = null;
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

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  // No fog — we want all points visible

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
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;
  controls.maxDistance = 120;
  controls.minDistance = 10;

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
    size: 1.0,
    map: circleTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    alphaTest: 0.3,
    sizeAttenuation: true,
    depthWrite: false,
  });

  docPoints = new THREE.Points(geo, mat);
  scene.add(docPoints);

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

export function highlightSearch(ftsResults, semanticResults, query) {
  if (!scene || !pointsData) return;
  const THREE = window.__THREE__;

  // Clear highlights
  while (highlightGroup.children.length) {
    const c = highlightGroup.children[0];
    c.geometry?.dispose();
    c.material?.dispose();
    highlightGroup.remove(c);
  }

  // Dim all doc points (but keep visible)
  const colors = docPoints.geometry.attributes.color;
  const origColors = docPoints.geometry.userData.originalColors;
  for (let i = 0; i < pointsData.docs.length; i++) {
    // Darken original color by 40%
    colors.setXYZ(i, origColors[i * 3] * 0.4, origColors[i * 3 + 1] * 0.4, origColors[i * 3 + 2] * 0.4);
  }

  const fpIndex = {};
  pointsData.docs.forEach((d, i) => { fpIndex[d.f] = i; });

  const ftsSet = new Set(ftsResults.map(r => r.filepath));
  const semSet = new Set((semanticResults || []).map(r => r.filepath));

  // Color FTS hits green
  const ftsColor = new THREE.Color(0x22c55e);
  for (const fp of ftsSet) {
    const idx = fpIndex[fp];
    if (idx !== undefined) colors.setXYZ(idx, ftsColor.r, ftsColor.g, ftsColor.b);
  }

  // Color semantic hits blue (overwrites green if overlap — that's fine)
  const semColor = new THREE.Color(0x3b82f6);
  for (const fp of semSet) {
    const idx = fpIndex[fp];
    if (idx !== undefined) colors.setXYZ(idx, semColor.r, semColor.g, semColor.b);
  }

  colors.needsUpdate = true;
  docPoints.material.opacity = 0.5;

  // Query point
  const qp = pointsData.queries[query];
  if (qp) {
    const qPos = new THREE.Vector3(qp.x * SCALE, qp.y * SCALE, qp.z * SCALE);

    // Query marker — small bright sphere
    const qGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const qMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const qMesh = new THREE.Mesh(qGeo, qMat);
    qMesh.position.copy(qPos);
    highlightGroup.add(qMesh);

    // FTS top-3 — green spheres + lines
    for (let i = 0; i < Math.min(3, ftsResults.length); i++) {
      const idx = fpIndex[ftsResults[i].filepath];
      if (idx === undefined) continue;
      const d = pointsData.docs[idx];
      const fPos = new THREE.Vector3(d.x * SCALE, d.y * SCALE, d.z * SCALE);

      const fGeo = new THREE.SphereGeometry(0.45 - i * 0.08, 12, 12);
      const fMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.9 - i * 0.15 });
      const fMesh = new THREE.Mesh(fGeo, fMat);
      fMesh.position.copy(fPos);
      highlightGroup.add(fMesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([qPos, fPos]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.4 - i * 0.1 });
      highlightGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    // Semantic top-3 — blue spheres + lines
    if (semanticResults) {
      for (let i = 0; i < Math.min(3, semanticResults.length); i++) {
        const idx = fpIndex[semanticResults[i].filepath];
        if (idx === undefined) continue;
        const d = pointsData.docs[idx];
        const dPos = new THREE.Vector3(d.x * SCALE, d.y * SCALE, d.z * SCALE);

        const sGeo = new THREE.SphereGeometry(0.45 - i * 0.08, 12, 12);
        const sMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9 - i * 0.15 });
        const sMesh = new THREE.Mesh(sGeo, sMat);
        sMesh.position.copy(dPos);
        highlightGroup.add(sMesh);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([qPos, dPos]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 - i * 0.1 });
        highlightGroup.add(new THREE.Line(lineGeo, lineMat));
      }
    }

    // Keep camera centered on origin, just update target toward query
    controls.target.set(0, 0, 0);
  }
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
  docPoints.material.opacity = 0.7;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
