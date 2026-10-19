// Profile photos are cut to a centred square and saved small, so they upload and load quickly.

export const AVATAR_SIZE = 192

/** The centred square of a w×h image: where it starts and how big it is. */
export function coverCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}

/** A picked image as a small square WebP. Throws a message fit to show if it can't be read. */
export async function avatarBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That isn’t an image.')
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too big (15 MB at most).')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Couldn’t read that image. Try a JPG or PNG.')
  }
  const { sx, sy, side } = coverCrop(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  if (!blob || blob.type !== 'image/webp') throw new Error('Couldn’t prepare that image.')
  return blob
}
