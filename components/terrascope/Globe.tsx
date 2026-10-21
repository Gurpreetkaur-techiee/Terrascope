"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Location, Satellite } from "@/lib/terrascope-data";
import { solarState, fmtLat, fmtLon } from "@/lib/astro";

const RAD = Math.PI / 180;
const ll = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(
    Math.cos(lat * RAD) * Math.sin(lon * RAD) * r,
    Math.sin(lat * RAD) * r,
    Math.cos(lat * RAD) * Math.cos(lon * RAD) * r,
  );

const VERT = `
varying vec2 vUv; varying vec3 vObj; varying vec3 vN; varying vec3 vP;
void main(){ vUv=uv; vObj=position; vN=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`;

// Textures are sampled in linear space (sRGB-tagged), lit, then re-encoded for display.
const EARTH_FRAG = `
uniform vec3 uSun; uniform vec3 uSunV;
uniform sampler2D uDay; uniform sampler2D uNight;
uniform float uHasDay; uniform float uHasNight;
varying vec2 vUv; varying vec3 vObj; varying vec3 vN; varying vec3 vP;
void main(){
  vec3 n=normalize(vObj); vec3 nV=normalize(vN); vec3 V=normalize(-vP);
  // SphereGeometry has u=0.25 at lon 0 (+z in our frame); equirectangular maps have lon 0 at u=0.5.
  vec2 uv=vec2(vUv.x+.25, vUv.y);
  vec3 day  = uHasDay>.5   ? texture2D(uDay,uv).rgb   : vec3(.004,.02,.07);
  vec3 night= uHasNight>.5 ? texture2D(uNight,uv).rgb : vec3(0.);

  float ndl=dot(n,uSun);                       // >0 sunlit, <0 dark side
  float dayMix=smoothstep(-.10,.16,ndl);       // soft terminator (about 12 degrees wide)
  vec3 dayCol=day*(.03+1.15*max(ndl,0.));
  vec3 darkCol=night*2.2 + day*vec3(.012,.025,.06); // city lights + faint blue earthshine
  vec3 col=mix(darkCol,dayCol,dayMix);          // city lights fade out as the sun rises

  float water=smoothstep(.02,.12,day.b-max(day.r,day.g));
  vec3 H=normalize(normalize(uSunV)+V);
  col+=pow(max(dot(nV,H),0.),140.)*water*dayMix*vec3(.65,.8,1.)*.4;

  float tw=smoothstep(-.18,0.,ndl)*(1.-smoothstep(0.,.22,ndl));
  col+=vec3(.9,.4,.2)*tw*.012;                 // faint warm twilight band

  float fr=pow(1.-max(dot(nV,V),0.),3.);
  col+=fr*vec3(.08,.26,.8)*(.12+.88*smoothstep(-.2,.5,ndl))*.8;
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = `
uniform vec3 uSun; varying vec3 vObj; varying vec3 vN;
void main(){
  float i=pow(max(.70-dot(normalize(vN),vec3(0.,0.,1.)),0.),3.5);
  float side=.2+.8*smoothstep(-.35,.45,dot(normalize(vObj),uSun));
  gl_FragColor=vec4(vec3(.08,.26,.9)*i*side*.5,1.);
  #include <colorspace_fragment>
}`;

type Props = {
  locations: Location[];
  satellites: Satellite[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Load /earth/day.jpg and /earth/night.jpg (equirectangular). Defaults to true. */
  useTextures?: boolean;
};

export default function Globe({ locations, satellites, selectedId, onSelect, useTextures = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const live = useRef({ selectedId, onSelect });
  const api = useRef<{ focus: (id: string) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const sel = locations.find((l) => l.id === selectedId) ?? locations[0];

  useEffect(() => {
    live.current = { selectedId, onSelect };
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      window.setTimeout(() => setFailed(true), 0);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.prepend(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.className = "absolute inset-0 h-full w-full touch-pan-y";
    canvas.style.cursor = "grab";
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.z = 3.7;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Stars
    const sp = new Float32Array(2400 * 3);
    for (let i = 0; i < 2400; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp.set([r * Math.cos(a) * 40, u * 40, r * Math.sin(a) * 40], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    const group = new THREE.Group();
    scene.add(group);

    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    const uni = {
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uSunV: { value: new THREE.Vector3(1, 0, 0) },
      uDay: { value: blank as THREE.Texture },
      uNight: { value: blank as THREE.Texture },
      uHasDay: { value: 0 },
      uHasNight: { value: 0 },
    };
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: EARTH_FRAG, uniforms: uni }),
    );
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 64, 64),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ATMO_FRAG, uniforms: { uSun: uni.uSun }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    group.add(earth, atmo);

    // Textures: sRGB, mipmapped, anisotropic, repeat-wrapped in U so the longitude seam is clean.
    let disposed = false;
    const loaded: THREE.Texture[] = [];
    if (useTextures) {
      const loader = new THREE.TextureLoader();
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const load = (url: string, tex: "uDay" | "uNight", flag: "uHasDay" | "uHasNight", hint: string) =>
        loader.load(
          url,
          (t) => {
            if (disposed) return t.dispose();
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.generateMipmaps = true;
            t.anisotropy = maxAniso;
            t.needsUpdate = true;
            uni[tex].value = t;
            uni[flag].value = 1;
            loaded.push(t);
            const img = t.image as { width?: number; height?: number };
            console.info(`[TerraScope Globe] Loaded ${url} (${img.width}×${img.height})`);
          },
          undefined,
          () =>
            console.error(
              `[TerraScope Globe] Failed to load ${url}. Put the ${hint} at public/earth/${url.split("/").pop()} ` +
                `(served as ${url}) and restart the dev server. The globe falls back to a plain dark-blue sphere until it loads.`,
            ),
        );
      load("/earth/day.jpg", "uDay", "uHasDay", "5400×2700 equirectangular daytime JPG");
      load("/earth/night.jpg", "uNight", "uHasNight", "3600×1800 equirectangular night-lights JPG");
    }

    // Satellite orbits (illustrative geometry, radii exaggerated)
    const sats = satellites.map((s, i) => {
      const rad = 1.16 + i * 0.07;
      const orbit = new THREE.Group();
      orbit.rotation.set(s.incDeg * RAD, s.raanDeg * RAD, 0, "YXZ");
      const pts = Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * rad, 0, Math.sin((k / 128) * Math.PI * 2) * rad));
      orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.45 })));
      const col = new THREE.Color(s.color);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), new THREE.MeshBasicMaterial({ color: col }));
      body.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
      orbit.add(body);
      group.add(orbit);
      return { s, rad, body };
    });

    // Location pins
    const pins = locations.map((l) => {
      const pos = ll(l.lat, l.lon, 1.004);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7defff }));
      dot.position.copy(pos);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 40), new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(pos);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
      group.add(dot, ring);
      return { l, pos, dot, ring };
    });

    const cur = { lat: sel.lat, lon: sel.lon };
    const tgt = { lat: sel.lat, lon: sel.lon };
    const focus = (id: string) => {
      const l = locations.find((x) => x.id === id);
      if (l) { tgt.lat = l.lat; tgt.lon = l.lon; }
    };
    api.current = { focus };

    const setSun = () => {
      const s = solarState();
      uni.uSun.value.copy(ll(s.declDeg, s.subLon));
    };
    setSun();
    const sunTimer = window.setInterval(setSun, 60000);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 0.9 ? 4.6 : 3.7;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Interaction. Pins are picked in screen space (nearest visible pin within 22px), which is
    // far more reliable than ray-casting tiny meshes. Far-side pins are ignored.
    const wp = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const pickPin = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      let best: { id: string; d: number } | null = null;
      for (const p of pins) {
        wp.copy(p.pos);
        group.localToWorld(wp);
        toCam.copy(camera.position).sub(wp);
        if (wp.dot(toCam) <= 0) continue;
        wp.project(camera);
        const d = Math.hypot(r.left + (wp.x * 0.5 + 0.5) * r.width - cx, r.top + (-wp.y * 0.5 + 0.5) * r.height - cy);
        if (d < 22 && (!best || d < best.d)) best = { id: p.l.id, d };
      }
      return best?.id ?? null;
    };

    let down: { x: number; y: number } | null = null, moved = false, lx = 0, ly = 0;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      lx = e.clientX; ly = e.clientY; moved = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) {
        canvas.style.cursor = pickPin(e.clientX, e.clientY) ? "pointer" : "grab";
        return;
      }
      if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { moved = true; canvas.style.cursor = "grabbing"; }
      if (!moved) return;
      tgt.lon = ((((tgt.lon - (e.clientX - lx) * 0.3) + 180) % 360) + 360) % 360 - 180;
      tgt.lat = Math.max(-80, Math.min(80, tgt.lat + (e.clientY - ly) * 0.3));
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (down && !moved) {
        const id = pickPin(e.clientX, e.clientY);
        if (id) live.current.onSelect(id);
      }
      down = null;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onCancel = () => { down = null; canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);

    const t0 = Date.now();
    const v = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const k = reduce ? 1 : 0.08;
      cur.lon += (((tgt.lon - cur.lon + 540) % 360) - 180) * k;
      cur.lat += (tgt.lat - cur.lat) * k;
      group.rotation.set(cur.lat * RAD, -cur.lon * RAD, 0, "XYZ");
      stars.rotation.set(cur.lat * RAD * 0.12, -cur.lon * RAD * 0.12, 0);
      group.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      uni.uSunV.value.copy(uni.uSun.value).applyQuaternion(group.quaternion).transformDirection(camera.matrixWorldInverse);
      const now = Date.now();
      const time = (now - t0) / 1000;

      const simMin = ((now - t0) * 120) / 60000;
      sats.forEach(({ s, rad, body }) => {
        const a = (simMin / s.periodMin) * Math.PI * 2 + s.phaseDeg * RAD;
        body.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      });

      const sid = live.current.selectedId;
      const pulse = (time % 2) / 2;
      pins.forEach((p) => {
        const on = p.l.id === sid;
        (p.dot.material as THREE.MeshBasicMaterial).color.set(on ? 0xffffff : 0x7defff);
        p.dot.scale.setScalar(on ? 1.5 : 1);
        p.ring.visible = on;
        if (on) {
          p.ring.scale.setScalar(1 + pulse * 1.6);
          (p.ring.material as THREE.MeshBasicMaterial).opacity = 1 - pulse;
        }
      });

      const rt = reticle.current;
      const sp0 = pins.find((p) => p.l.id === sid);
      if (rt && sp0) {
        v.copy(sp0.pos);
        group.localToWorld(v);
        const visible = v.z > 0.3;
        v.project(camera);
        rt.style.opacity = visible ? "1" : "0";
        rt.style.transform = `translate(${(v.x * 0.5 + 0.5) * el.clientWidth}px, ${(-v.y * 0.5 + 0.5) * el.clientHeight}px)`;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(sunTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      disposed = true;
      loaded.forEach((t) => t.dispose());
      blank.dispose();
      renderer.dispose();
      canvas.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, satellites, useTextures]);

  useEffect(() => {
    api.current?.focus(selectedId);
  }, [selectedId]);

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden" role="img" aria-label={`3D Earth centered on ${sel.name}`}>
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#6f8cb3]">
          WebGL is unavailable in this browser, so the 3D Earth can’t be shown. The rest of the dashboard still works.
        </p>
      )}
      <div ref={reticle} className="pointer-events-none absolute left-0 top-0 opacity-0">
        <div className="-ml-5 -mt-5 size-10 border border-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,0.5)] [clip-path:polygon(0_0,30%_0,30%_8%,8%_8%,8%_30%,0_30%,0_0,100%_0,100%_30%,92%_30%,92%_8%,70%_8%,70%_0)]" />
        <div className="absolute left-7 top-[-6px] whitespace-nowrap font-mono text-[11px] leading-4 text-cyan-200 [text-shadow:0_0_8px_rgba(0,0,0,0.9)]">
          <div className="text-white">{sel.name}</div>
          <div>{fmtLat(sel.lat)}</div>
          <div>{fmtLon(sel.lon)}</div>
        </div>
      </div>
    </div>
  );
}