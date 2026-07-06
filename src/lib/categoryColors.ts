// The 20 colours offered by FitNotes' Android "Select Colour" dialog for
// categories, in the same 5-column x 4-row grid order shown there. Measured
// directly off a screenshot of that dialog and cross-checked against every
// distinct `Category.colour` value in a real FitNotes backup — all 8 colours
// in use matched a swatch here (within 1 bit/channel of screenshot noise),
// so this is treated as the exhaustive whitelist rather than an open picker,
// to avoid ever writing back a colour the Android app's dialog can't produce.
// Entries marked "DB-confirmed" are the exact `Category.colour` value from a
// real backup (see a category using that colour); the rest are read off the
// screenshot only (no category in the sample backup used them) and could be
// off by a bit or two from the app's real constant.
export const CATEGORY_COLOR_PALETTE = [
  '#54b2b6', // DB-confirmed — Posture PT
  '#2ecc71', // DB-confirmed — Knee
  '#3498db', // DB-confirmed — Legs PT
  '#9a59b5', // screenshot only
  '#607d8b', // screenshot only
  '#16a086', // screenshot only
  '#28ae61', // screenshot only
  '#297fb8', // screenshot only
  '#8d44ad', // screenshot only
  '#2d3e50', // screenshot only
  '#f1c40f', // DB-confirmed — Hands PT
  '#e67f22', // screenshot only
  '#e74c3c', // DB-confirmed — Cardio
  '#8d6e63', // DB-confirmed — Pull
  '#bdbdbd', // screenshot only
  '#f39c11', // screenshot only
  '#d25400', // screenshot only
  '#c0392b', // screenshot only
  '#5d4037', // DB-confirmed — Push
  '#757575', // DB-confirmed — Shoulders, Triceps, Biceps, Chest, Back, Legs, Abs, Yoga, Full Body
] as const

// FitNotes stores category colour as an Android ARGB int (opaque, so alpha
// 0xFF pushes the sign bit and it reads negative); masking to the low 24
// bits recovers the RGB portion regardless of sign.
export function categoryColorToHex(colour: number): string {
  return `#${(colour & 0xffffff).toString(16).padStart(6, '0')}`
}

export function hexToCategoryColor(hex: string): number {
  return 0xff000000 | parseInt(hex.slice(1), 16)
}
