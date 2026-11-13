// The only colours the game is allowed to use. See docs/LOOK.md.
// Colours are display (sRGB) values used directly; the renderer does no colour conversion.
import { Color } from 'three';

const c = (hex) => new Color(hex);

export const PAL = {
  skyTop: c('#b99ccc'),
  skyMid: c('#f2b9b4'),
  skyHorizon: c('#ffd9a8'),
  sun: c('#fff1c9'),
  haze: c('#f6c9b4'),
  hazeLow: c('#d9b3c9'),

  cloud: [c('#fde6d8'), c('#c7a4c6')],
  canopy: [c('#f8b8c6'), c('#c48cad')],
  canopyAlt: [c('#f3c2d2'), c('#b591bd')],
  trunk: [c('#c08a70'), c('#8a6272')],
  grass: [c('#bfc27e'), c('#7e9878')],
  path: [c('#f2c899'), c('#b98c7c')],
  stone: [c('#e2c7b6'), c('#a08ca4')],
  moss: [c('#bcc272'), c('#728a6e')],
  cliff: [c('#d0a48e'), c('#8f78a2')],
  wood: [c('#cd9468'), c('#8a6068')],

  capeRed: [c('#ef7050'), c('#b24a48')],
  capeBlue: [c('#55a0bb'), c('#3d6f92')],
  trim: [c('#f6cd70'), c('#b98454')],
  tunic: [c('#f8ead2'), c('#c4a19c')],
  skin: [c('#fddcc2'), c('#d79f98')],
  hairLight: [c('#f8eedc'), c('#c4ada9')],
  hairDark: [c('#7a4e3a'), c('#432a33')],
  boots: [c('#9a6446'), c('#55363c')],
  eye: [c('#4a2f3a'), c('#3a2430')],

  mushroom: [c('#e8644c'), c('#a24152')],
  spot: [c('#fff4de'), c('#d9c2c4')],
  flowers: [c('#f7a4bc'), c('#bca4e8'), c('#fff4d8'), c('#f6c27a')],

  // secrets (round 4)
  water: [c('#f4f0ff'), c('#a9b4dc')],
  crystalCore: c('#f6f0ff'), crystalHalo: c('#b49cff'),
  foxCore: c('#fff4e2'), foxHalo: c('#ffa870'),
  fairyCap: [c('#f6c6e0'), c('#b48ab8')], fairyCore: c('#fff0f6'), fairyHalo: c('#ff8fc0'),
  roro: [c('#f8c5b6'), c('#c99aa6')],          // Roro Jr's peachy-pink fur (from Abdo's photo)
  roroMuzzle: [c('#fde2df'), c('#d9aab4')],
  bow: [c('#93303f'), c('#5e2036')],          // burgundy bow
  bowDot: [c('#f6e8bc'), c('#c9b48e')],       // cream polka dots + trim
  petal: [c('#ffd45e'), c('#e0953e')],        // sunflowers
  seedHead: [c('#9a6446'), c('#5a3a40')],
  leaf: [c('#b2c66c'), c('#6d8a62')],

  // Crystal Lake (round 6)
  crystalStone: [c('#ece2fa'), c('#a796c9')], // pale lilac stone: crystal bridge planks, crystal bases
  lotus: [c('#fbc6d6'), c('#c48db2')],        // carved lotus petals on the lotus stones
  lily: [c('#bfd08a'), c('#7f9a7c')],         // lily pads

  // Sunset Desert (round 7)
  sand: [c('#f8d6a6'), c('#c69ba2')],         // dunes: warm peach sand, lavender-mauve in shade
  paving: [c('#f4d2ac'), c('#b8939f')],       // worn paving on the plaza, the paths and the terrace
  sandstone: [c('#efb98a'), c('#a98096')],    // ruins, walls, the bridge and the cliffs below
  cactus: [c('#a9c48b'), c('#6d8c88')],
  palm: [c('#bccd72'), c('#6f8f6c')],         // oasis palm fronds
  dust: c('#f7dcb6'),                         // sand gusts
  sunCore: c('#fff6d2'), sunHalo: c('#ff9c50'), // the lost sun spirit and the sundial

  glowCore: c('#fff3c6'),
  glowHalo: c('#ffb45e'),
  rim: c('#ffd08a'),
  plum: c('#5a3d4a'),
  shadowBlob: c('#8a6a9a'),
};
