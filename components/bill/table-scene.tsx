import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { Radius } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * The table itself, in three dimensions: a round top with one small figure
 * seated at it per person, facing each other across it.
 *
 * It is a picture of the data, not decoration on top of it. Somebody who has
 * paid turns green and sits back; the rest lean in. That is the same thing the
 * cards below say in numbers, said in a shape you can take in without reading.
 *
 * Built from primitives — cylinders, capsules, spheres — so there is no model
 * to load, nothing to fetch, and nothing that can arrive late or not at all.
 * `expo-gl` ships inside Expo Go, so this runs on a phone without a development
 * build, which is the constraint everything else here bends to.
 */

export type SceneSeat = {
  id: string;
  /** Paid up: they sit back, and turn green. */
  settled: boolean;
  /** Has ordered something. Leans in a little further. */
  active: boolean;
};

type TableSceneProps = {
  seats: SceneSeat[];
  height?: number;
};

/**
 * three's renderer expects a browser canvas. Expo's GL context is not one, and
 * everything the renderer actually touches on it is here: the size it was told,
 * a style object it writes into, and the two listener methods it attaches a
 * context-lost handler to.
 */
function canvasFor(gl: ExpoWebGLRenderingContext) {
  return {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    clientWidth: gl.drawingBufferWidth,
    clientHeight: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
}

/** Seated height, so every figure is built against one number. */
const TABLE_TOP = 0.9;

/**
 * How far out the seats sit, and how far back the camera stands.
 *
 * Both grow with the headcount. A ring sized for four puts seven shoulder to
 * shoulder, and a camera placed for four cuts the nearest of seven off at the
 * bottom edge — the table has to be given room as people arrive, the same way a
 * real one does.
 */
function seatRadius(count: number) {
  return 1.9 + Math.max(0, count - 4) * 0.13;
}

/** Everything the scene draws sits inside this sphere, centred on the table. */
const SCENE_CENTRE_Y = 0.7;

function sceneRadius(count: number) {
  return seatRadius(count) + 0.45;
}

/** Vertical field of view. The frame is far wider than it is tall, so this is
 *  always the dimension that runs out first. */
const FOV = 50;

function buildFigure(seat: SceneSeat, index: number, count: number) {
  const group = new THREE.Group();

  // The body hangs in a group of its own, and that is what leans.
  //
  // Leaning the outer group would not work: `lookAt` has already turned it to
  // face the table, so its x axis points along the table's edge rather than
  // forwards. Setting `rotation.x` there tips somebody sitting at the side of
  // the table over sideways instead of leaning them in.
  const body = new THREE.Group();
  group.add(body);

  // A hue per seat, spread evenly, so neighbours never share a colour. Somebody
  // who has paid leaves that scheme entirely — it should be the one thing you
  // notice about the table at a glance.
  const colour = seat.settled
    ? new THREE.Color(0x3dd68c)
    : new THREE.Color().setHSL((index / Math.max(count, 1) + 0.08) % 1, 0.5, 0.58);

  const skin = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.05 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 6, 16), skin);
  torso.position.y = TABLE_TOP - 0.08;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 18), skin);
  head.position.y = TABLE_TOP + 0.42;
  body.add(head);

  // Arms, reaching towards the table. Two capsules is enough to read as "seated
  // at" rather than "standing near".
  //
  // Negative z is the way they face: `lookAt` points a body's -Z at its target,
  // so arms placed at +z reach out into the room with their back to the food.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), skin);
    arm.position.set(side * 0.26, TABLE_TOP - 0.02, -0.16);
    arm.rotation.x = 0.75;
    arm.rotation.z = side * 0.28;
    body.add(arm);
  }

  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const radius = seatRadius(count);
  group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);

  // Facing the middle is what puts them opposite one another, whatever the
  // headcount turns out to be — and the target is level with them, not at the
  // tabletop. Aiming at the tabletop tips every figure 23 degrees onto its
  // back, because `lookAt` turns the whole body towards a point above it.
  group.lookAt(0, 0, 0);

  return group;
}

export function TableScene({ seats, height = 190 }: TableSceneProps) {
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');

  // The render loop reads these, so a change of cast or of who has paid is
  // picked up without tearing down the GL context and starting again.
  const seatsRef = useRef(seats);
  const rebuildRef = useRef<(() => void) | null>(null);

  const signature = seats.map((seat) => `${seat.id}:${seat.settled}:${seat.active}`).join(',');

  useEffect(() => {
    seatsRef.current = seats;
    rebuildRef.current?.();
    // The signature is the whole of what the scene draws; the array identity is
    // not, and would rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasFor(gl),
      context: gl as unknown as WebGLRenderingContext,
      antialias: true,
      alpha: true,
    });
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3.5, 7, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-4, 2.5, -3);
    scene.add(fill);

    const wood = new THREE.MeshStandardMaterial({
      color: new THREE.Color(textSecondary),
      roughness: 0.75,
      metalness: 0.05,
    });

    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.11, 56), wood);
    top.position.y = TABLE_TOP;
    scene.add(top);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, TABLE_TOP, 24), wood);
    stem.position.y = TABLE_TOP / 2;
    scene.add(stem);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.07, 32), wood);
    foot.position.y = 0.035;
    scene.add(foot);

    const cast = new THREE.Group();
    scene.add(cast);

    function rebuild() {
      // Meshes hold GPU buffers, which outlive the object graph unless they are
      // told otherwise. A table where somebody joins every few minutes would
      // leak all evening.
      for (const child of [...cast.children]) {
        cast.remove(child);
        child.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            (node.material as THREE.Material).dispose();
          }
        });
      }

      const current = seatsRef.current;
      current.forEach((seat, index) => {
        cast.add(buildFigure(seat, index, current.length));
      });
    }

    rebuildRef.current = rebuild;
    rebuild();

    let frame = 0;
    let sized = '';
    const started = Date.now();

    /**
     * The drawing buffer is not its final size when the context is created.
     *
     * This cost an afternoon: on the first frame the canvas had been laid out
     * vertically but not horizontally, so `drawingBufferWidth` was 1 — and a
     * size taken once, there, left `gl.viewport` at [0, 0, 1, 376] forever. The
     * scene rendered perfectly into a strip three pixels wide. Reading the size
     * every frame also covers rotation and a window being dragged.
     */
    function fit() {
      const width = gl.drawingBufferWidth;
      const height_ = gl.drawingBufferHeight;
      if (width < 1 || height_ < 1) return false;

      const key = `${width}x${height_}`;
      if (key === sized) return true;

      sized = key;
      renderer.setSize(width, height_, false);
      camera.aspect = width / height_;
      camera.updateProjectionMatrix();
      return true;
    }

    function draw() {
      frame = requestAnimationFrame(draw);
      if (!fit()) return;

      const t = (Date.now() - started) / 1000;

      // A slow orbit, so the table reads as a solid thing rather than a picture
      // of one. Slow enough not to compete with the numbers underneath.
      // Stood back far enough to hold the whole table, worked out rather than
      // guessed. Three rounds of moving the camera by hand all left the nearest
      // seat hanging below the bottom edge at some headcount or other; fitting
      // the sphere the scene lives in cannot, whoever turns up.
      const orbit = t * 0.16;
      const radius = sceneRadius(seatsRef.current.length);
      const away = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.22;
      const elevation = THREE.MathUtils.degToRad(34);

      camera.position.set(
        Math.sin(orbit) * Math.cos(elevation) * away,
        SCENE_CENTRE_Y + Math.sin(elevation) * away,
        Math.cos(orbit) * Math.cos(elevation) * away
      );
      camera.lookAt(0, SCENE_CENTRE_Y, 0);

      const current = seatsRef.current;
      cast.children.forEach((figure, index) => {
        const seat = current[index];
        // Breathing, out of step with each other — everybody bobbing together
        // reads as a machine, not a table of people.
        const phase = index * 1.7;
        figure.position.y = Math.sin(t * 1.5 + phase) * 0.025;

        // Paid up means sitting back. Still ordering means leaning in.
        const lean = seat?.settled ? -0.05 : seat?.active ? 0.07 : 0.02;
        const body = figure.children[0];
        if (body) body.rotation.x = lean + Math.sin(t * 1.1 + phase) * 0.012;
      });

      renderer.render(scene, camera);
      gl.endFrameEXP();
    }

    draw();

    return () => cancelAnimationFrame(frame);
  }

  return (
    <View style={[styles.frame, { backgroundColor: surface, borderColor: border, height }]}>
      <GLView
        // A new context per headcount is wasteful; the scene rebuilds its cast
        // in place instead, and this key only changes if GL itself must restart.
        style={StyleSheet.absoluteFill}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
