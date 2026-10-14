/** A file's name without its extension, as the name of a map or prop. */
export function baseName(file: File): string
{
    return file.name.replace(/\.[^.]+$/, '');
}

/** A picture ready to store: WebP, and its size in pixels. */
export interface Converted
{
    blob: Blob;
    width: number;
    height: number;
    /** How much it was shrunk, 1 when it already fit. */
    scale: number;
}

/**
 * Shrinks a picture to at most maxSide pixels on its long side and converts it to WebP, in the
 * browser, before it is uploaded. A 20 MB PNG map becomes a few MB, and props keep their
 * transparency. Throws for files the browser cannot open as a picture.
 */
export async function toWebp(picture: Blob, maxSide: number): Promise<Converted>
{
    const bitmap = await createImageBitmap(picture);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);

    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return { blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }), width, height, scale };
}

/** A token picture's side in pixels: sharp on the 4K screen, about 20 KB as WebP. */
const avatarSide = 256;

/** A player's photo cut to the square in its middle and shrunk, for a round token. */
export async function toAvatar(picture: Blob): Promise<Blob>
{
    const bitmap = await createImageBitmap(picture);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(avatarSide, avatarSide);
    const left = (bitmap.width - side) / 2;
    const top = (bitmap.height - side) / 2;

    canvas.getContext('2d')?.drawImage(bitmap, left, top, side, side, 0, 0, avatarSide, avatarSide);
    bitmap.close();

    return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
}

/** A file size in the largest unit that keeps it above 1, like 240 kB or 12.4 MB, kB at the least. */
export function fileSize(bytes: number): string
{
    const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
    const step = Math.min(units.length - 1, Math.max(1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024))));
    const format = new Intl.NumberFormat(undefined, { style: 'unit', unit: units[step], maximumFractionDigits: 1 });

    return format.format(bytes / 1024 ** step);
}

/** The SHA-256 of a file in hex, the same for the same picture whatever its name. */
export async function fingerprint(file: Blob): Promise<string>
{
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
