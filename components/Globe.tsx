
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Location } from "@/lib/terrascope-data";

export default function Globe({
  locations,
  selectedId,
  onSelect,
}: {
  locations: Location[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const locationsRef = useRef(locations);

  useEffect(() => {
    selectRef.current = onSelect;
    selectedRef.current = selectedId;
    locationsRef.current = locations;
  }, [onSelect, selectedId, locations]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
    } catch {
      host.textContent = "Unable to start the 3D globe. Try another browser.";
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      38,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      100
    );
    camera.position.z = 3.4;

    const globe = new THREE.Group();
    scene.add(globe);

    let alive = true;
    let animationId = 0;

    const loader = new THREE.TextureLoader();
    const textureLoader = (path: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(path, resolve, undefined, reject);
      });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pins = new Map<string, THREE.Mesh>();

    // Day and night textures blend according to the sunlight direction.
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: null },
        nightMap: { value: null },
        sunDirection: { value: new THREE.Vector3(1, 0.2, 1).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalLocal;

        void main() {
          vUv = uv;
          vNormalLocal = normalize(normal);
          gl_Position = projectionMatrix * modelViewMatrix
            * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;

        varying vec2 vUv;
        varying vec3 vNormalLocal;

        void main() {
          vec3 normal = normalize(vNormalLocal);
          float sunlight = dot(normal, normalize(sunDirection));

          // Smooth transition between daytime and nighttime.
          float dayFactor = smoothstep(-0.12, 0.16, sunlight);

          vec3 dayColor = texture2D(dayMap, vUv).rgb;
          vec3 nightColor = texture2D(nightMap, vUv).rgb;

          // Slightly boost city lights on the dark side.
          nightColor *= 1.35;

          vec3 color = mix(nightColor, dayColor, dayFactor);

          // Subtle twilight illumination at the terminator.
          float twilight = 1.0 - smoothstep(0.0, 0.28, abs(sunlight));
          color += vec3(0.025, 0.07, 0.12) * twilight * 0.35;

          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      earthMaterial
    );
    globe.add(earth);

    let dayTexture: THREE.Texture | null = null;
    let nightTexture: THREE.Texture | null = null;

    Promise.all([
      textureLoader("/earth/day.jpg"),
      textureLoader("/earth/night.jpg"),
    ])
      .then(([day, night]) => {
        if (!alive) {
          day.dispose();
          night.dispose();
          return;
        }

        dayTexture = day;
        nightTexture = night;

        day.colorSpace = THREE.SRGBColorSpace;
        night.colorSpace = THREE.SRGBColorSpace;

        day.anisotropy = renderer.capabilities.getMaxAnisotropy();
        night.anisotropy = renderer.capabilities.getMaxAnisotropy();

        earthMaterial.uniforms.dayMap.value = day;
        earthMaterial.uniforms.nightMap.value = night;
        earthMaterial.needsUpdate = true;
      })
      .catch((error) => {
        console.error("Earth texture loading failed:", error);
      });

    // Atmospheric blue halo.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 64, 64),
      new THREE.MeshBasicMaterial({
        color: "#38bdf8",
        transparent: true,
        opacity: 0.075,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    globe.add(atmosphere);

    // A subtle sun glow outside the globe.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.055, 64, 64),
      new THREE.MeshBasicMaterial({
        color: "#168bd0",
        transparent: true,
        opacity: 0.035,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    globe.add(glow);

    // Location pins.
    function updatePins() {
      const activeLocations = locationsRef.current;
      const activeIds = new Set(activeLocations.map((l) => l.id));

      for (const [id, pin] of pins) {
        if (!activeIds.has(id)) {
          globe.remove(pin);
          pin.geometry.dispose();
          (pin.material as THREE.Material).dispose();
          pins.delete(id);
        }
      }

      for (const location of activeLocations) {
        let pin = pins.get(location.id);

        if (!pin) {
          pin = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 12, 12),
            new THREE.MeshBasicMaterial()
          );
          pin.userData.locationId = location.id;
          pins.set(location.id, pin);
          globe.add(pin);
        }

        const lat = THREE.MathUtils.degToRad(location.lat);
        const lon = THREE.MathUtils.degToRad(location.lon);

        pin.position.set(
          -Math.cos(lat) * Math.sin(lon) * 1.012,
          Math.sin(lat) * 1.012,
          Math.cos(lat) * Math.cos(lon) * 1.012
        );

        const active = location.id === selectedRef.current;
        const pinMaterial = pin.material as THREE.MeshBasicMaterial;
        pinMaterial.color.set(active ? "#fbbf24" : "#e0f2fe");
        pin.scale.setScalar(active ? 1.6 : 1);
      }
    }

    updatePins();

    // Pointer rotation and reliable click detection.
    let dragging = false;
    let moved = false;
    let downX = 0;
    let downY = 0;
    let previousX = 0;
    let previousY = 0;

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      moved = false;
      downX = previousX = event.clientX;
      downY = previousY = event.clientY;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;

      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;

      if (
        Math.hypot(event.clientX - downX, event.clientY - downY) > 6
      ) {
        moved = true;
      }

      if (moved) {
        globe.rotation.y += dx * 0.005;
        globe.rotation.x += dy * 0.003;
        globe.rotation.x = THREE.MathUtils.clamp(
          globe.rotation.x,
          -1.2,
          1.2
        );
      }

      previousX = event.clientX;
      previousY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
      if (!dragging) return;

      dragging = false;
      renderer.domElement.style.cursor = "grab";

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }

      if (moved) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...pins.values()]);

      if (hits.length) {
        const id = hits[0].object.userData.locationId as string;
        if (id) selectRef.current(id);
      }
    }

    function onPointerCancel() {
      dragging = false;
      renderer.domElement.style.cursor = "grab";
    }

    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "pan-y";

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(host);

    // Sun direction is fixed in space, while the Earth rotates.
    const sunWorld = new THREE.Vector3(3, 0.8, 4).normalize();

    function animate() {
      animationId = requestAnimationFrame(animate);

      const inverseRotation = globe.quaternion.clone().invert();
      earthMaterial.uniforms.sunDirection.value
        .copy(sunWorld)
        .applyQuaternion(inverseRotation)
        .normalize();

      updatePins();
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      alive = false;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();

      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();

          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          materials.forEach((m) => m.dispose());
        }
      });

      dayTexture?.dispose();
      nightTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Interactive Earth globe with day and night lighting"
      className="aspect-square w-full cursor-grab overflow-hidden"
    />
  );
}
