import type { Store, StoredPicture } from '../types';

import { baseName } from './images';

/*
 * The store behind ?demo, see pages/Editor.tsx: pictures stay in this tab as local addresses, and
 * nothing is saved, so a reload starts over. It never loads Convex.
 */

async function keep(picture: Blob): Promise<StoredPicture>
{
    const bitmap = await createImageBitmap(picture);
    const kept = { src: URL.createObjectURL(picture), width: bitmap.width, height: bitmap.height };

    bitmap.close();

    return kept;
}

export const demoStore: Store = {
    uploadProp: async (file) => ({
        ...(await keep(file)),
        id: crypto.randomUUID(),
        name: baseName(file),
    }),
    uploadMap: keep,
};
