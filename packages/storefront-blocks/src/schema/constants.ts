/**
 * Plain constants the blocks need at runtime. Kept free of zod: the blocks
 * import only this file and *types* from the schemas, so neither the
 * mini-program bundle nor the admin canvas bundle carries a validator.
 */

/** Image-cube layout → its label and how many cells it shows. */
export const IMAGE_CUBE_LAYOUTS = {
  row2: { label: '一行两个', cells: 2 },
  row3: { label: '一行三个', cells: 3 },
  row4: { label: '一行四个', cells: 4 },
  grid2x2: { label: '两行两列', cells: 4 },
  left1right2: { label: '左一右二', cells: 3 },
  top1bottom2: { label: '上一下二', cells: 3 },
} as const;

export type ImageCubeLayout = keyof typeof IMAGE_CUBE_LAYOUTS;
