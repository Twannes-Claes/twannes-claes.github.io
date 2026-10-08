import { faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, type ChangeEvent } from 'react';

import type { PropPicture } from '../types';

interface PropLibraryProps
{
    pictures: PropPicture[];
    /** The picture each click on the map places, null while editing placed props. */
    placing: PropPicture | null;
    onPick: (picture: PropPicture | null) => void;
    onUpload: (files: File[]) => void;
}

/**
 * The game master's own prop pictures, shown with the Props tool. Pick one and every click on
 * the map places it; pick it again, or press Esc, to go back to moving and scaling placed props.
 * There is no built-in set, everyone brings the art they own, see PLAN.md.
 */
export function PropLibrary({ pictures, placing, onPick, onUpload }: PropLibraryProps)
{
    useEffect(() =>
    {
        if (!placing)
            return;

        const keydown = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
                onPick(null);

        };

        window.addEventListener('keydown', keydown);

        return () => window.removeEventListener('keydown', keydown);
    }, [placing, onPick]);

    const picked = (event: ChangeEvent<HTMLInputElement>) =>
    {
        onUpload([...(event.target.files ?? [])]);
        // Cleared, so picking the same files again still adds them.
        event.target.value = '';
    };

    return (
        <section className="ttrpg-panel ttrpg-properties" aria-label="Props">
            <h2>Props</h2>
            <p className="ttrpg-properties__hint">
                {placing
                    ? 'Click the map to place it. Esc when you are done.'
                    : 'Pick a picture to place it. Click a placed prop to move it, drag its corner to scale or its top handle to turn. Delete removes it, Alt places freely.'}
            </p>

            {pictures.length > 0 && (
                <ul className="ttrpg-library">
                    {pictures.map((picture) => (
                        <li key={picture.id}>
                            <button
                                type="button"
                                className="ttrpg-library__item"
                                aria-pressed={placing?.id === picture.id}
                                title={picture.name}
                                onClick={() => onPick(placing?.id === picture.id ? null : picture)}
                            >
                                <img src={picture.src} alt={picture.name} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <label className="ttrpg-segment ttrpg-library__upload">
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
        </section>
    );
}
