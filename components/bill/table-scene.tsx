import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { Radius } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * The table itself, in three dimensions: a round top with one small figure on a
 * chair at it per person, talking to each other.
 *
 * It is a picture of the data, not decoration on top of it. Somebody who has
 * paid turns green and sits back; the rest lean in. That is the same thing the
 * cards below say in numbers, said in a shape you can take in without reading.
 *
 * Built from primitives — cylinders, capsules, spheres, boxes — so there is no
 * model to load, nothing to fetch, and nothing that can arrive late or not at
 * all. `expo-gl` ships inside Expo Go, so this runs on a phone without a
 * development build, which is the constraint everything else here bends to.
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
const SEAT_HEIGHT = 0.46;
const SHOULDER = TABLE_TOP + 0.14;

/**
 * How far out the seats sit, and how far back the camera stands.
 *
 * Both grow with the headcount. A ring sized for four puts seven shoulder to
 * shoulder, and a camera placed for four cuts the nearest of seven off at the
 * bottom edge — the table has to be given room as people arrive, the same way a
 * real one does.
 */
function seatRadius(count: number) {
  // Close enough that the hands land on the tabletop rather than short of it,
  // which is what makes them look seated *at* the table.
  return 1.78 + Math.max(0, count - 4) * 0.14;
}

/** Everything the scene draws sits inside this sphere, centred on the table. */
const SCENE_CENTRE_Y = 0.7;

function sceneRadius(count: number) {
  return seatRadius(count) + 0.55;
}

/**
 * Vertical field of view. The frame is far wider than it is tall, so this is
 * always the dimension that runs out first.
 */
const FOV = 50;

/** What somebody is doing with their hands and head at this moment. */
type Gesture = 'none' | 'nod' | 'shake' | 'shrug' | 'point' | 'laugh' | 'sip';

type Actor = {
  group: THREE.Group;
  /** Leans and twists. The chair is deliberately not in here. */
  body: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  seat: SceneSeat;
  /** Where they sit on the ring, in radians. */
  angle: number;
  /** Keeps everybody out of step with everybody else. */
  phase: number;
  /** Head turn, eased towards the person they are attending to. */
  yaw: number;
  lookingAt: number;
  gesture: Gesture;
  gestureFrom: number;
  gestureUntil: number;
  nextGesture: number;
  /** Eased 0..1 while this person is leaning in on the table with a neighbour. */
  huddle: number;
};

/**
 * How far somebody must turn their head to face another seat.
 *
 * Everyone faces the middle, so their body already points at whoever is
 * opposite; this is the correction on top of that. Derived rather than
 * guessed: a head yawed by `h` on a body seated at `angle` points along
 * `-(sin, cos)(angle + h)`, so the yaw that aims it at a target direction `d`
 * is `atan2(-d.x, -d.z) - angle`.
 */
function yawBetween(from: Actor, to: Actor, radius: number) {
  const dx = Math.sin(to.angle) * radius - Math.sin(from.angle) * radius;
  const dz = Math.cos(to.angle) * radius - Math.cos(from.angle) * radius;

  const wanted = Math.atan2(-dx, -dz) - from.angle;

  // Wrap to the short way round, then stop at what a neck will actually do.
  const wrapped = Math.atan2(Math.sin(wanted), Math.cos(wanted));
  return THREE.MathUtils.clamp(wrapped, -1.15, 1.15);
}

function buildActor(seat: SceneSeat, index: number, count: number, chairColour: THREE.Color): Actor {
  const group = new THREE.Group();

  // The body hangs in a group of its own, and that is what leans and twists.
  //
  // Leaning the outer group would not work: it has been turned to face the
  // table, so its x axis runs along the table's edge rather than forwards, and
  // `rotation.x` there tips somebody sitting at the side over sideways. The
  // chair stays outside it, because a chair does not lean when its occupant
  // does.
  const body = new THREE.Group();
  group.add(body);

  const colour = seat.settled
    ? new THREE.Color(0x3dd68c)
    : new THREE.Color().setHSL((index / Math.max(count, 1) + 0.08) % 1, 0.5, 0.58);

  const skin = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.05 });
  const chairMat = new THREE.MeshStandardMaterial({
    color: chairColour,
    roughness: 0.85,
    metalness: 0,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.42, 6, 16), skin);
  torso.position.y = TABLE_TOP - 0.1;
  body.add(torso);

  // The head pivots at the neck rather than about the figure's feet, so a nod
  // reads as a nod instead of the whole person rocking.
  const head = new THREE.Group();
  head.position.y = TABLE_TOP + 0.24;
  body.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), skin);
  skull.position.y = 0.18;
  head.add(skull);

  // A nose, only so which way somebody is facing is legible at this size. It is
  // the whole reason a turned head reads as attention rather than a wobble.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), skin);
  nose.position.set(0, 0.17, -0.19);
  nose.rotation.x = -Math.PI / 2;
  head.add(nose);

  // Two segments with an elbow between them, not one stick.
  //
  // A rigid arm swinging from the shoulder reads as a scarecrow whatever it is
  // doing: hands end up wherever the angle throws them, and none of the shapes
  // people actually make — forearms on the table, palms turned up, a hand held
  // out — are reachable at all. The elbow is what buys every gesture below.
  const shoulders: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const elbows: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];

  shoulders.forEach((shoulder, i) => {
    const side = i === 0 ? -1 : 1;
    shoulder.position.set(side * 0.23, SHOULDER, 0);
    body.add(shoulder);

    // Each segment hangs below its own pivot, so turning a pivot swings it the
    // way the joint above it does.
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.16, 4, 10), skin);
    upper.position.y = -0.11;
    shoulder.add(upper);

    const elbow = elbows[i];
    elbow.position.y = -0.22;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), skin);
    fore.position.y = -0.1;
    elbow.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), skin);
    hand.position.y = -0.21;
    elbow.add(hand);
  });

  const seatPlate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), chairMat);
  seatPlate.position.set(0, SEAT_HEIGHT, 0.02);
  group.add(seatPlate);

  // Positive z is behind them: a figure faces along its own -z.
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.06), chairMat);
  back.position.set(0, SEAT_HEIGHT + 0.25, 0.22);
  back.rotation.x = -0.12;
  group.add(back);

  for (const lx of [-1, 1]) {
    for (const lz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, SEAT_HEIGHT, 8),
        chairMat
      );
      leg.position.set(lx * 0.17, SEAT_HEIGHT / 2, 0.02 + lz * 0.17);
      group.add(leg);
    }
  }

  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const radius = seatRadius(count);
  group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);

  // Facing the middle is what puts them opposite one another, whatever the
  // headcount turns out to be. Set directly rather than with `lookAt`, and that
  // is not a style choice.
  //
  // `Object3D.lookAt` swaps its arguments for anything that is not a camera or
  // a light, so a plain object ends up with **+Z** aimed at the target, not -Z.
  // Every figure was therefore turned a full half-circle: the chair back sat
  // between its occupant and the table, the nose pointed out into the room, and
  // the arms reached backwards over the chair. `rotation.y = angle` puts local
  // -Z on the centre, which is the convention the rest of this file is built
  // on — and it is worth stating rather than deriving twice.
  group.rotation.y = angle;

  return {
    group,
    body,
    head,
    shoulders,
    elbows,
    seat,
    angle,
    phase: index * 1.7,
    yaw: 0,
    lookingAt: index,
    gesture: 'none',
    gestureFrom: 0,
    gestureUntil: 0,
    nextGesture: 2 + Math.random() * 6,
    huddle: 0,
  };
}

export function TableScene({ seats, height = 210 }: TableSceneProps) {
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

    // Chairs read in both themes: the border colour vanishes into the surface in
    // the dark one, and the table colour is too close to the tabletop.
    const chairColour = new THREE.Color(textSecondary).multiplyScalar(0.62);

    const cast = new THREE.Group();
    scene.add(cast);

    let actors: Actor[] = [];
    let speaker = 0;
    let speakerUntil = 0;

    /** Two neighbours leaning in on the table, having their own conversation. */
    let pair: [number, number] | null = null;
    let pairUntil = 0;
    let nextPair = 5 + Math.random() * 7;

    function rebuild() {
      // Meshes hold GPU buffers, which outlive the object graph unless they are
      // told otherwise. A table where somebody joins every few minutes would
      // leak all evening.
      for (const child of [...cast.children]) {
        cast.remove(child);
        child.traverse((node: THREE.Object3D) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            (node.material as THREE.Material).dispose();
          }
        });
      }

      const current = seatsRef.current;
      actors = current.map((seat, index) => buildActor(seat, index, current.length, chairColour));
      for (const actor of actors) cast.add(actor.group);

      speaker = 0;
      speakerUntil = 0;
      pair = null;
      pairUntil = 0;
      nextPair = 5 + Math.random() * 7;
    }

    rebuildRef.current = rebuild;
    rebuild();

    /**
     * Who is talking, and who is watching them.
     *
     * A table is not everybody gesturing at once — it is one person holding the
     * floor while the others attend, and the floor changing hands every few
     * seconds. Everything the figures do reads as conversation only because of
     * that one rule; without it they look like a room of people talking to
     * nobody.
     */
    function direct(t: number) {
      if (actors.length < 2 || t < speakerUntil) return;

      const next = Math.floor(Math.random() * actors.length);
      speaker = next === speaker ? (speaker + 1) % actors.length : next;
      speakerUntil = t + 3 + Math.random() * 4;

      actors.forEach((actor, index) => {
        if (index === speaker) {
          // Somebody talking looks at one of the people listening, not at the
          // room.
          let target = Math.floor(Math.random() * actors.length);
          if (target === index) target = (index + 1) % actors.length;
          actor.lookingAt = target;
        } else {
          actor.lookingAt = speaker;
        }
      });
    }

    /**
     * Two people dropping out of the main conversation to lean in on the table
     * and talk to each other.
     *
     * Neighbours, not anybody: two people at opposite ends of a table do not
     * lean towards each other, they raise their voices. Needs three at the
     * table before it makes sense — with two, a pair leaning in is not a side
     * conversation, it is the conversation.
     */
    function directPair(t: number) {
      if (pair && t > pairUntil) {
        pair = null;
        nextPair = t + 7 + Math.random() * 9;
        return;
      }

      if (pair || t < nextPair || actors.length < 3) return;

      const first = Math.floor(Math.random() * actors.length);
      pair = [first, (first + 1) % actors.length];
      pairUntil = t + 5 + Math.random() * 4;
    }

    function scheduleGestures(t: number) {
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        if (t < actor.nextGesture || t < actor.gestureUntil) continue;

        const listening = i !== speaker;
        const roll = Math.random();

        // Listeners mostly agree, sometimes disagree, sometimes shrug, and
        // now and then laugh or reach for a drink. Somebody holding the floor
        // points and shrugs instead — nodding along to yourself reads as a
        // glitch — but they laugh and drink like everybody else.
        actor.gesture = listening
          ? roll < 0.38
            ? 'nod'
            : roll < 0.52
              ? 'shake'
              : roll < 0.64
                ? 'shrug'
                : roll < 0.82
                  ? 'laugh'
                  : 'sip'
          : roll < 0.44
            ? 'point'
            : roll < 0.66
              ? 'shrug'
              : roll < 0.84
                ? 'laugh'
                : 'sip';

        actor.gestureFrom = t;
        // A drink takes longer than a nod, and a shrug is held.
        const span = actor.gesture === 'sip' ? 2.2 : actor.gesture === 'shrug' ? 1.4 : 1.1;
        actor.gestureUntil = t + span;
        actor.nextGesture = actor.gestureUntil + 1.5 + Math.random() * 5;
      }
    }

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

      const key_ = `${width}x${height_}`;
      if (key_ === sized) return true;

      sized = key_;
      renderer.setSize(width, height_, false);
      camera.aspect = width / height_;
      camera.updateProjectionMatrix();
      return true;
    }

    function draw() {
      frame = requestAnimationFrame(draw);
      if (!fit()) return;

      const t = (Date.now() - started) / 1000;

      // Stood back far enough to hold the whole table, worked out rather than
      // guessed. Three rounds of moving the camera by hand all left the nearest
      // seat hanging below the bottom edge at some headcount or other; fitting
      // the sphere the scene lives in cannot, whoever turns up.
      const orbit = t * 0.16;
      const radius = sceneRadius(actors.length);
      const away = (radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.22;
      const elevation = THREE.MathUtils.degToRad(34);

      camera.position.set(
        Math.sin(orbit) * Math.cos(elevation) * away,
        SCENE_CENTRE_Y + Math.sin(elevation) * away,
        Math.cos(orbit) * Math.cos(elevation) * away
      );
      camera.lookAt(0, SCENE_CENTRE_Y, 0);

      direct(t);
      directPair(t);
      scheduleGestures(t);

      const ring = seatRadius(actors.length);

      actors.forEach((actor, index) => {
        const talking = index === speaker && actors.length > 1;

        // A pair leaning in on the table beats the main conversation: somebody
        // who has turned to their neighbour is not listening to the floor any
        // more, and having them keep facing the speaker was the giveaway.
        const inPair = pair !== null && (index === pair[0] || index === pair[1]);
        if (inPair && pair) actor.lookingAt = pair[0] === index ? pair[1] : pair[0];

        // Eased in and out over about half a second, so the two of them settle
        // onto the table rather than snapping down onto it.
        actor.huddle += ((inPair ? 1 : 0) - actor.huddle) * 0.035;

        const target = actors[actor.lookingAt] ?? actor;

        // Eased rather than snapped: a head that arrives instantly reads as a
        // glitch, and the ease is most of what makes it look like attention.
        const wanted = target === actor ? 0 : yawBetween(actor, target, ring);
        actor.yaw += (wanted - actor.yaw) * 0.06;

        const active = t < actor.gestureUntil;
        const progress = active ? (t - actor.gestureFrom) / (actor.gestureUntil - actor.gestureFrom) : 0;
        // Fades in and out, so a gesture starts and finishes rather than being
        // switched on.
        const strength = active ? Math.sin(progress * Math.PI) : 0;
        const gesture = active ? actor.gesture : 'none';

        const nod = gesture === 'nod' ? Math.sin(progress * Math.PI * 6) * 0.3 * strength : 0;
        const shake = gesture === 'shake' ? Math.sin(progress * Math.PI * 7) * 0.42 * strength : 0;

        // Laughing throws the head back and shakes the shoulders. The shake is
        // the half that sells it — a head tipped back on its own is somebody
        // looking at the ceiling.
        const laugh = gesture === 'laugh' ? strength : 0;
        const quiver = laugh * Math.sin(t * 19 + actor.phase) * 0.09;

        // Drinking brings the head down to meet the hand as much as the hand up
        // to the head: these arms are short, and the two halves meeting in the
        // middle is what reads as a sip.
        const sip = gesture === 'sip' ? strength : 0;

        // Talking moves a head constantly and slightly; listening barely at all.
        const chatter = talking ? Math.sin(t * 6.5 + actor.phase) * 0.05 : 0;

        actor.head.rotation.y = actor.yaw * 0.68 + shake;
        actor.head.rotation.x =
          nod + chatter + (talking ? 0.04 : 0) + laugh * 0.32 + quiver * 0.4 - sip * 0.24;

        // The shoulders follow the head part of the way. Nobody turns their head
        // ninety degrees and leaves their chest where it was.
        const base = actor.seat.settled ? -0.06 : actor.seat.active ? 0.08 : 0.03;
        const lean = base + actor.huddle * 0.24 - laugh * 0.1;
        actor.body.rotation.y = actor.yaw * 0.32;
        actor.body.rotation.x = lean + Math.sin(t * 1.1 + actor.phase) * 0.012;

        // Breathing, out of step with everybody else — a table bobbing together
        // reads as a machine, not as people.
        actor.group.position.y =
          Math.sin(t * 1.5 + actor.phase) * 0.02 + quiver * 0.12 - actor.huddle * 0.015;

        actor.shoulders.forEach((shoulder, side) => {
          const sign = side === 0 ? -1 : 1;
          const elbow = actor.elbows[side];

          // Resting: upper arms down, forearms folded forward onto the table,
          // which is where hands go when somebody is listening.
          //
          // Never quite still, though. Listeners held at exactly the same angle
          // read as furniture, and one person moving at a table of statues
          // looks worse than nobody moving at all.
          const idle = Math.sin(t * 0.9 + actor.phase + side * 2.3);
          let pitch = 0.32 + idle * 0.05;
          let spread = sign * (0.16 + idle * 0.03);
          let bend = 1.35 + Math.sin(t * 0.7 + actor.phase + side) * 0.07;

          if (talking) {
            // Hands move while the mouth does, the two of them out of phase, so
            // it reads as gesticulating rather than semaphore. The elbow carries
            // most of it — that is where the movement is in a real gesture.
            pitch = 0.3 + Math.sin(t * 3.6 + actor.phase + side * 1.9) * 0.28;
            spread = sign * (0.24 + Math.sin(t * 2.7 + actor.phase + side) * 0.2);
            bend = 1.25 + Math.sin(t * 4.4 + actor.phase + side * 2.4) * 0.45;
          }

          if (gesture === 'shrug') {
            // Elbows in, forearms out, palms up: "what do you want me to say".
            pitch = THREE.MathUtils.lerp(pitch, -0.15, strength);
            spread = THREE.MathUtils.lerp(spread, sign * 0.62, strength);
            bend = THREE.MathUtils.lerp(bend, 1.75, strength);
          }

          if (gesture === 'point' && side === 1) {
            // One arm straightened out towards whoever is being addressed.
            pitch = THREE.MathUtils.lerp(pitch, 1.35, strength);
            spread = THREE.MathUtils.lerp(spread, sign * 0.08, strength);
            bend = THREE.MathUtils.lerp(bend, 0.25, strength);
          }

          if (sip > 0 && side === 1) {
            // One hand folded up towards the mouth, elbow tucked in.
            pitch = THREE.MathUtils.lerp(pitch, 0.15, sip);
            spread = THREE.MathUtils.lerp(spread, sign * 0.06, sip);
            bend = THREE.MathUtils.lerp(bend, 2.7, sip);
          }

          // Shoulders shaking with a laugh, on top of whatever the arms were
          // already doing.
          pitch += quiver;

          // Leaning in puts both forearms flat on the table and the elbows
          // close together, which is the shape of two people talking across a
          // table rather than at one.
          pitch = THREE.MathUtils.lerp(pitch, 0.62, actor.huddle);
          spread = THREE.MathUtils.lerp(spread, sign * 0.07, actor.huddle);
          bend = THREE.MathUtils.lerp(bend, 1.5, actor.huddle);

          shoulder.rotation.x = pitch;
          shoulder.rotation.z = spread;
          // A shrug lifts the shoulders themselves, which is most of what makes
          // one legible from across a room.
          shoulder.position.y = SHOULDER + (gesture === 'shrug' ? strength * 0.07 : 0);
          elbow.rotation.x = bend;
        });
      });

      renderer.render(scene, camera);
      gl.endFrameEXP();
    }

    draw();

    return () => cancelAnimationFrame(frame);
  }

  return (
    <View style={[styles.frame, { backgroundColor: surface, borderColor: border, height }]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
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
