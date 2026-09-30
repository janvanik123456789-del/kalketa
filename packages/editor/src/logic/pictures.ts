/**
 * Pictures put into a sheet by dropping, pasting or choosing a file. They are
 * stored inside the calculation file; the sheet gets a picture line
 * ![caption](path){width=60%}.
 */

import { formatPicture } from '@calccanvas/core';

/** A picture on its way into the sheet. */
export interface IncomingPicture {
  /** File name, or "" for a picture from the clipboard (a screenshot). */
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

/** A path in `folder` that no file of the sheet has yet: nosnik.png, nosnik-2.png, … */
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

/** The caption offered for a picture: its file name without the extension; nothing for a screenshot. */
export function captionOf(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

/**
 * Width in percent of the text width for a picture `pixels` wide, taken at
 * 96 dpi so a screenshot keeps roughly its size on screen; at most the whole
 * text width.
 */
export function widthFor(pixels: number | undefined, textWidthMm: number): number | undefined {
  if (!pixels || !(textWidthMm > 0)) return undefined;
  const mm = (pixels * 25.4) / 96;
  return Math.max(10, Math.min(100, Math.round((mm / textWidthMm) * 100)));
}

/** Width of a picture in pixels, when the browser can decode it. */
export async function pixelWidth(picture: IncomingPicture): Promise<number | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([picture.bytes as BlobPart], { type: picture.type }));
    const width = bitmap.width;
    bitmap.close();
    return width;
  } catch {
    return undefined;
  }
}

export function pictureLine(caption: string, path: string, width: number | undefined): string {
  return formatPicture({ caption, path, ...(width !== undefined ? { width } : {}) });
}

/** A file dropped or pasted, when it is a picture. */
export async function fromFile(file: File): Promise<IncomingPicture | undefined> {
  if (!isPictureType(file.type)) return undefined;
  return { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}
