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
  canopy: [c('#f6b0c0'), c('#b282aa')],
  canopyAlt: [c('#f0bccf'), c('#a686b6')],
  trunk: [c('#c08a70'), c('#8a6272')],
  grass: [c('#cbc67c'), c('#7f9a74')],
  path: [c('#f2c899'), c('#b98c7c')],
  stone: [c('#ecd3c0'), c('#a690a6')],
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

  glowCore: c('#fff3c6'),
  glowHalo: c('#ffb45e'),
  rim: c('#ffd08a'),
  plum: c('#5a3d4a'),
  shadowBlob: c('#8a6a9a'),
};
