/** Pictures put on a canvas (chosen, pasted or dropped). */

export interface CanvasPicture {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

export function isPictureType(type: string): boolean {
  return type in EXTENSIONS;
}

export async function fromFile(file: File): Promise<CanvasPicture | undefined> {
  if (!isPictureType(file.type)) return undefined;
  return { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** A path in `folder` not taken yet: foto.png, foto-2.png, … */
export function picturePath(folder: string, name: string, type: string, taken: (path: string) => boolean): string {
  const ext = EXTENSIONS[type] ?? 'png';
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'obrazek';
  for (let n = 1; ; n++) {
    const path = `${folder}/${base}${n === 1 ? '' : `-${n}`}.${ext}`;
    if (!taken(path)) return path;
  }
}

/** Width and height in pixels; undefined when the picture cannot be decoded. */
export async function pixelSize(picture: CanvasPicture): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([picture.bytes as BlobPart], { type: picture.type }));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size.width > 0 && size.height > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}
