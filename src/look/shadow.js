// Soft sun shadows, baked once. The world is still (anything that moves is marked userData.dynamic), so
// after it is built we render its depth from the sun once into a texture covering every island. Every
// watercolour surface then looks up that one texture (a few soft taps) to know whether a canopy, a wall or a
// rock stands between it and the sun, and slips into its cool lavender shade band there. No per-frame cost
// beyond the lookups, so it's fine on phones. Moving things (the travelers, swinging lanterns, rising steps)
// don't cast; the travelers keep their soft blob shadows.
import { OrthographicCamera, WebGLRenderTarget, DepthTexture, UnsignedIntType, LinearFilter, LessEqualCompare, Matrix4, Vector3, Sphere, MeshDepthMaterial, DoubleSide } from 'three';
import { shared } from './material.js';

const SIZE = 2048;

const isDynamic = (o) => { for (let q = o; q; q = q.parent) if (q.userData.dynamic || q.userData.noShadow) return true; return false; };
const shownChain = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
const casts = (o) => o.isMesh && !o.isInstancedMesh && o.material && !Array.isArray(o.material)
  && o.material.userData.kind === 'watercolor' && !o.material.transparent && shownChain(o) && !isDynamic(o);

/**
 * Bake the sun's shadow of everything still under `roots` and switch shadows on in every watercolour material.
 * @returns {{ casters: number, texel: number }} (texel: metres per shadow-map pixel)
 */
export function bakeSunShadow(renderer, scene, roots) {
  const casters = [];
  for (const r of roots) { r.updateMatrixWorld(true); r.traverse((o) => { if (casts(o)) casters.push(o); }); }
  if (!casters.length) return { casters: 0, texel: 0 };

  // a camera looking down along the sunlight, fitted around every caster
  const sun = shared.uSunDir.value;
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  cam.position.copy(sun).multiplyScalar(500);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const s = new Sphere(), v = new Vector3();
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const o of casters) {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    v.copy(s.center).applyMatrix4(cam.matrixWorldInverse);
    lo.min(v.clone().subScalar(s.radius)); hi.max(v.clone().addScalar(s.radius));
  }
  cam.left = lo.x - 1; cam.right = hi.x + 1; cam.bottom = lo.y - 1; cam.top = hi.y + 1;
  cam.near = -hi.z - 2; cam.far = -lo.z + 2;
  cam.updateProjectionMatrix();

  // render only the casters' depth
  const rt = new WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  rt.depthTexture = new DepthTexture(SIZE, SIZE, UnsignedIntType);
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = LinearFilter;
  rt.depthTexture.compareFunction = LessEqualCompare; // hardware compare + bilinear: smooth shadow edges in one fetch
  const hidden = [], set = new Set(casters);
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !set.has(o)) { o.visible = false; hidden.push(o); } });
  const depthMat = new MeshDepthMaterial({ side: DoubleSide });
  const prev = { target: renderer.getRenderTarget(), override: scene.overrideMaterial, bg: scene.background, auto: renderer.autoClear };
  scene.overrideMaterial = depthMat; scene.background = null;
  renderer.setRenderTarget(rt); renderer.autoClear = true;
  renderer.clear(true, true, true);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev.target); renderer.autoClear = prev.auto;
  scene.overrideMaterial = prev.override; scene.background = prev.bg;
  for (const o of hidden) o.visible = true;
  depthMat.dispose();

  // world -> shadow-map uv + depth (0..1)
  const bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  shared.uShadowMat.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  shared.uShadowMap.value = rt.depthTexture;
  const texel = (cam.right - cam.left) / SIZE;
  shared.uShadowTexel.value = 1 / SIZE;
  shared.uShadowOffset.value = texel * 1.5; // push the lookup off the surface a little (no speckled self-shadow)
  shared.uShadowBias.value = 0.22 / (cam.far - cam.near); // 22 cm, in depth units
  shared.uShadowK.value = 1;
  return { casters: casters.length, texel, rt };
}
