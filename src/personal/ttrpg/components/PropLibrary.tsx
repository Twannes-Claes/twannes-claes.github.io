import { faTrashCan, faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ChangeEvent } from 'react';

import type { PropPicture } from '../types';

import { fileSize } from '../services/images';

import { carry, readyCarry } from './carry';
import { propDragType } from './MapCanvas';
import { StorageMeter } from './StorageMeter';
import { useKeydown } from './useKeys';

interface PropLibraryProps
{
    pictures: PropPicture[];
    /** The picture each click on the map places, null while editing placed props. */
    placing: PropPicture | null;
    onPick: (picture: PropPicture | null) => void;
    onUpload: (files: File[]) => void;
    /** Deletes a picture and its placed copies, after asking, see removePicture in MapEditor.tsx. */
    onRemove: (picture: PropPicture) => void;
    /** The size of every stored file besides the props, see load in convex/sessions.ts. */
    otherBytes: number;
}

/**
 * The game master's own prop pictures, shown with the Props tool. Drag one onto the map, or pick
 * one and every click on the map places it; pick it again, or press Esc, to go back to moving and scaling placed props.
 * The bin on a hovered tile deletes the picture, which frees its storage.
 * There is no built-in set, everyone brings the art they own, see PLAN.md.
 */
export function PropLibrary({ pictures, placing, onPick, onUpload, onRemove, otherBytes }: PropLibraryProps)
{
    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onPick(null);

    }, placing !== null);

    const picked = (event: ChangeEvent<HTMLInputElement>) =>
    {
        onUpload([...(event.target.files ?? [])]);
        // Cleared, so picking the same files again still adds them.
        event.target.value = '';
    };

    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings" aria-label="Props">
            <h2>Props</h2>

            {pictures.length === 0 ? (
                <p className="ttrpg-empty">Upload pictures you own to place them.</p>
            ) : (
                <ul className="ttrpg-library">
                    {pictures.map((picture) => (
                        <li key={picture.id}>
                            <button
                                type="button"
                                className="ttrpg-library__item"
                                aria-pressed={placing?.id === picture.id}
                                title={`${picture.name}, ${fileSize(picture.bytes)}. Drag onto the map, or pick it to place with clicks`}
                                draggable
                                onPointerEnter={readyCarry}
                                onDragStart={(event) =>
                                {
                                    event.dataTransfer.setData(propDragType, picture.id);
                                    event.dataTransfer.effectAllowed = 'copy';
                                    carry(event, picture);
                                }}
                                onDragEnd={() => carry(null, null)}
                                onClick={() => onPick(placing?.id === picture.id ? null : picture)}
                            >
                                <img src={picture.src} alt={picture.name} />
                            </button>
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-library__remove"
                                aria-label={`Delete ${picture.name}`}
                                title="Delete"
                                onClick={() => onRemove(picture)}
                            >
                                <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <label className="ttrpg-segment ttrpg-segment--block">
                <FontAwesomeIcon icon={faUpload} />
                Upload pictures
                <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    multiple
                    className="ttrpg-hidden-input"
                    onChange={picked}
                />
            </label>

            <StorageMeter
                propBytes={pictures.reduce((sum, picture) => sum + picture.bytes, 0)}
                otherBytes={otherBytes}
            />

            {/* Moving, scaling and turning need no words, the handles and cursor on the map show them. */}
            <ul className="ttrpg-keys" aria-label="Keys">
                {placing ? (
                    <li>
                        <kbd>Esc</kbd> Stop placing
                    </li>
                ) : (
                    <>
                        <li>
                            <kbd>Del</kbd> Remove
                        </li>
                        <li>
                            <kbd>Alt</kbd> No snap
                        </li>
                    </>
                )}
            </ul>
        </section>
    );
}
