// Solmar Nights — low-poly people. One builder makes every human in the
// city: the player, pedestrians, cops and gang members, each in their own
// colours, with swinging limbs driven by a walk phase.

import * as THREE from 'three';

const SKIN_TONES = [0xf2c89b, 0xd9a066, 0xa06a3b, 0x8a5a2b, 0xf0d0b0];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x34495e];
const PANTS = [0x2c3e50, 0x5d6d7e, 0x7b241c, 0x1e8449, 0x6e2c00];

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Build a person ~1.8 units tall. Returns { group, legL, legR, armL, armR, head }.
// The limbs pivot at the hip/shoulder so walk cycles just rotate them.
export function makePersonMesh(opts = {}) {
  const skin = opts.skin ?? SKIN_TONES[0];
  const shirt = opts.shirt ?? SHIRTS[0];
  const pants = opts.pants ?? PANTS[0];
  const group = new THREE.Group();

  const torso = box(0.62, 0.72, 0.34, shirt, 0, 1.18, 0);
  group.add(torso);
  const head = box(0.36, 0.36, 0.36, skin, 0, 1.74, 0);
  group.add(head);
  // Hair cap.
  group.add(box(0.38, 0.12, 0.38, opts.hair ?? 0x2b1a12, 0, 1.94, 0));

  // Legs pivot at y=0.82 (hip); geometry hangs below the pivot.
  const legGeo = new THREE.BoxGeometry(0.24, 0.82, 0.28);
  legGeo.translate(0, -0.41, 0);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.17, 0.82, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.17, 0.82, 0);
  legR.castShadow = true;
  group.add(legL, legR);

  // Arms pivot at the shoulder (y=1.5).
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.22);
  armGeo.translate(0, -0.35, 0);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.42, 1.5, 0);
  armL.castShadow = true;
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.42, 1.5, 0);
  armR.castShadow = true;
  group.add(armL, armR);

  // A simple gun in the right hand, hidden unless armed.
  const gun = box(0.08, 0.1, 0.34, 0x1a1a1a, 0, -0.68, 0.08);
  gun.visible = false;
  armR.add(gun);

  return { group, legL, legR, armL, armR, head, gun, torso };
}

// Drive the limbs from a walk phase (radians) and a speed factor 0..1.
export function animateWalk(person, phase, speed01) {
  const swing = 0.7 * speed01;
  person.legL.rotation.x = Math.sin(phase) * swing;
  person.legR.rotation.x = -Math.sin(phase) * swing;
  person.armL.rotation.x = -Math.sin(phase) * swing * 0.8;
  person.armR.rotation.x = Math.sin(phase) * swing * 0.8;
}

// Aim pose: right arm forward, gun out.
export function animateAim(person, aiming) {
  person.gun.visible = aiming;
  if (aiming) {
    person.armR.rotation.x = -Math.PI / 2 + 0.15;
    person.armL.rotation.x = -Math.PI / 2 + 0.35;
  }
}

export { SKIN_TONES, SHIRTS, PANTS };
