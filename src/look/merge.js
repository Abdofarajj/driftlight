// Draw-call diet for phones. Safari pays a lot for every separate draw, and the forest is built
// from hundreds of small pieces, so after the world is built:
//  - mergeStatic: still pieces that share a material are baked into one mesh per area (cell).
//  - mergeSiblings: inside moving models (travelers, Roro, sunflowers) the pieces that never move
//    relative to each other (hair curls, eyes, boot + shin) are baked into one mesh in their parent.
//  - Instancer: repeated moving pieces (the hanging lanterns) are drawn as one instanced mesh
//    that copies the transforms of the original pieces every frame.
// The original meshes stay in the scene graph, only hidden: lights, colliders, the camera's
// occluder ray and every animation keep working on them exactly as before.
// Mark anything that moves, scales or toggles visibility with `userData.dynamic = true`.
import { Mesh, InstancedMesh, BufferGeometry, BufferAttribute, ShaderMaterial, Vector3, Matrix3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BAKEABLE = { watercolor: true, glow: true }; // shaders that only read position/normal (+ aMix)
const bakeable = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.children.length && o.visible
  && o.material && !Array.isArray(o.material) && BAKEABLE[o.material.userData.kind] && !o.material.transparent
  && o.geometry.attributes.position && !o.geometry.morphAttributes.position;
const isDynamic = (o) => { for (let q = o; q; q = q.parent) if (q.userData.dynamic) return true; return false; };
const shownChain = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };

// Baked meshes lose their own local space, so a swaying material reads the sway height
// from an attribute (the original local y) instead of position.y.
const swayVariants = new WeakMap();
function bakedMaterial(mat) {
  if (!(mat.uniforms.uSway?.value > 0)) return mat;
  let v = swayVariants.get(mat);
  if (!v) {
    v = new ShaderMaterial({
      uniforms: mat.uniforms, // the same uniform objects: shared time/lights keep driving it
      defines: { ...mat.defines, USE_SWAYH: '' },
      vertexShader: mat.vertexShader, fragmentShader: mat.fragmentShader, side: mat.side,
    });
    v.userData = { ...mat.userData };
    swayVariants.set(mat, v);
  }
  return v;
}

function bake(mesh, matrix, needMix, needSway) {
  const src = mesh.geometry, pos = src.attributes.position, n = pos.count;
  const g = new BufferGeometry();
  g.setAttribute('position', pos.clone());
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
  if (needMix) g.setAttribute('aMix', src.attributes.aMix ? src.attributes.aMix.clone() : new BufferAttribute(new Float32Array(n), 1));
  if (needSway) {
    const h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = pos.getY(i);
    g.setAttribute('aSwayH', new BufferAttribute(h, 1));
  }
  const s = src.drawRange.start, cnt = Math.min(src.drawRange.count, src.index ? src.index.count : n);
  const idx = new Uint32Array(Math.max(0, cnt - Math.max(0, cnt % 3)));
  for (let i = 0; i < idx.length; i++) idx[i] = src.index ? src.index.getX(s + i) : s + i;
  if (matrix.determinant() < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.setIndex(new BufferAttribute(idx, 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  // positions by the full matrix; normals by its plain 3x3 (not the inverse transpose), because
  // that is what the shaders do with a mesh's model matrix: baked pieces then shade exactly the same
  g.attributes.position.applyMatrix4(matrix);
  g.attributes.normal.applyMatrix3(_m3.setFromMatrix4(matrix));
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i++) { _v.fromBufferAttribute(nr, i).normalize(); nr.setXYZ(i, _v.x, _v.y, _v.z); }
  return g;
}
const _m3 = new Matrix3(), _v = new Vector3();

/**
 * Bake every still, opaque watercolour mesh under `roots` into one mesh per material per cell,
 * add the results to `into` (which must sit at the world origin) and hide the originals.
 * Big pieces (wider than a cell) are left alone so they keep their own culling.
 * @returns {{ meshes: number, merged: number }}
 */
export function mergeStatic(roots, into, { cell = 20, maxRadius = 9 } = {}) {
  const groups = new Map();
  const c = new Vector3();
  let meshes = 0;
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!bakeable(o) || !shownChain(o) || isDynamic(o)) return;
      const mat = o.material, geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const sc = o.matrixWorld.getMaxScaleOnAxis();
      if (geo.boundingSphere.radius * sc > maxRadius) return;
      c.copy(geo.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = `${mat.id}:${Math.floor(c.x / cell)}:${Math.floor(c.z / cell)}:${Math.floor(c.y / 30)}`;
      if (!groups.has(key)) groups.set(key, { mat, list: [] });
      groups.get(key).list.push(o);
    });
  }
  let merged = 0;
  for (const { mat, list } of groups.values()) {
    if (list.length < 2 || !bakeInto(into, mat, list, (o) => o.matrixWorld)) continue;
    meshes += list.length; merged++;
  }
  into.updateMatrixWorld(true);
  return { meshes, merged };
}

function bakeInto(parent, mat, list, matrixOf) {
  const needMix = 'USE_MIX' in (mat.defines || {});
  const needSway = mat.uniforms.uSway?.value > 0;
  const geo = mergeGeometries(list.map((o) => bake(o, matrixOf(o), needMix, needSway)));
  if (!geo) return null;
  geo.computeBoundingSphere();
  const m = new Mesh(geo, bakedMaterial(mat));
  m.name = 'merged';
  m.renderOrder = list[0].renderOrder;
  parent.add(m);
  for (const o of list) o.visible = false;
  return m;
}

/**
 * Inside a model that moves as a whole or in parts: bake direct children of the same parent that
 * share a material and never move on their own (mark those that do with userData.dynamic).
 * The merged mesh sits in the same parent, so it follows every animation of the parent.
 */
export function mergeSiblings(root) {
  const parents = [];
  root.traverse((o) => { if (o.children.length > 1) parents.push(o); });
  let saved = 0;
  for (const p of parents) {
    const by = new Map();
    for (const c of p.children) {
      if (!bakeable(c) || c.userData.dynamic) continue;
      if (!by.has(c.material)) by.set(c.material, []);
      by.get(c.material).push(c);
    }
    for (const [mat, list] of by) {
      if (list.length < 2) continue;
      for (const c of list) c.updateMatrix();
      if (bakeInto(p, mat, list, (o) => o.matrix)) saved += list.length - 1;
    }
  }
  return saved;
}

/** Repeated moving meshes (same geometry + material) drawn as one InstancedMesh each. */
export class Instancer {
  constructor(into) { this.into = into; this.sets = []; }

  /** @param {import('three').Mesh[]} meshes */
  add(meshes) {
    const by = new Map();
    for (const m of meshes) {
      if (!m.isMesh || m.isInstancedMesh || Array.isArray(m.material) || m.material.transparent) continue;
      const k = m.geometry.uuid + m.material.uuid;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(m);
    }
    for (const list of by.values()) {
      if (list.length < 2) continue;
      const im = new InstancedMesh(list[0].geometry, list[0].material, list.length);
      im.name = 'instanced';
      im.frustumCulled = false; // spread all over the island; a handful of tiny lanterns is cheap to draw
      im.matrixAutoUpdate = false;
      for (const m of list) m.visible = false;
      this.into.add(im);
      this.sets.push({ im, list });
    }
    this.sync();
  }

  /** Copy the hidden originals' world transforms (call after animating them, before drawing). */
  sync() {
    for (const { im, list } of this.sets) {
      for (let i = 0; i < list.length; i++) { list[i].updateWorldMatrix(true, false); im.setMatrixAt(i, list[i].matrixWorld); }
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
