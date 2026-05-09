// Inline SVG stamps. Each sticker draws into a 100x100 box using path data,
// and the app rescales/translates to the cursor + brush size. We keep these
// as fillable Path2D so the active color tints them.

window.STICKERS = [
  {
    id: 'star',
    label: 'Star',
    path: 'M50 6L62 38L96 40L68 62L78 96L50 78L22 96L32 62L4 40L38 38Z'
  },
  {
    id: 'heart',
    label: 'Heart',
    path: 'M50 88C20 70 6 52 6 32C6 18 18 8 30 8C40 8 46 14 50 22C54 14 60 8 70 8C82 8 94 18 94 32C94 52 80 70 50 88Z'
  },
  {
    id: 'bolt',
    label: 'Lightning',
    path: 'M58 6L22 56H46L40 96L80 42H54Z'
  },
  {
    id: 'smiley',
    label: 'Smiley',
    path: 'M50 6A44 44 0 1050 94A44 44 0 1050 6ZM34 36A6 6 0 1134 48A6 6 0 0134 36ZM66 36A6 6 0 1166 48A6 6 0 0166 36ZM30 60Q50 84 70 60'
  },
  {
    id: 'rocket',
    label: 'Rocket',
    path: 'M50 4C66 14 76 30 76 52V70L62 84H38L24 70V52C24 30 34 14 50 4ZM50 38A8 8 0 1050 54A8 8 0 0050 38ZM30 88L24 96H42L36 88ZM58 88L52 96H70L64 88Z'
  },
  {
    id: 'flower',
    label: 'Flower',
    path: 'M50 16A14 14 0 1150 44A14 14 0 0150 16ZM16 50A14 14 0 1144 50A14 14 0 0116 50ZM50 56A14 14 0 1150 84A14 14 0 0150 56ZM56 50A14 14 0 1184 50A14 14 0 0156 50ZM50 38A12 12 0 1150 62A12 12 0 0150 38Z'
  },
  {
    id: 'cloud',
    label: 'Cloud',
    path: 'M22 70Q4 70 6 54Q8 38 26 40Q32 22 54 26Q76 22 80 46Q96 50 92 66Q88 78 72 76H30Q22 78 22 70Z'
  },
  {
    id: 'dino',
    label: 'Dinosaur',
    path: 'M14 70L22 50L18 36L30 32L34 22H46L50 14H62L66 26L78 30L86 50L94 60L86 70L82 88H70L66 76H46L42 88H28L24 76L14 70ZM58 38A4 4 0 1158 46A4 4 0 0158 38Z'
  }
];
