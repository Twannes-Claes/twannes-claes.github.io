import { useCallback, useEffect, useRef, type CSSProperties } from 'react';

import type { SkylanderDetails } from '../types';

import { elementFor } from '../content/elements';
import {
    normal,
    offeredVersions,
    variantLink,
    versionPictures,
    type VersionId,
} from '../content/variants';

import { useModal } from './useModal';

interface ChooseVersionProps
{
    /** The figure being added, or null when the dialog is closed. */
    details: SkylanderDetails | null;
    /** A variant of undefined means the plain version. */
    onChoose: (details: SkylanderDetails, variant?: VersionId) => void;
    onCancel: () => void;
}

/**
 * Where focus goes once the dialog closes. It hands focus back to the search on its own, which
 * opens the suggestions. That is wanted after a cancel, to look for another name straight away,
 * but not after a version was picked, so then it lets go of the search.
 */
function settleFocus(picked: boolean)
{
    const search = document.querySelector<HTMLInputElement>('.sky-search .sky-input');

    if (picked)
        search?.blur();
    else
        search?.focus();

}

/**
 * Asks which version of a figure is being added, with a picture of each to compare against the
 * one in hand. A native <dialog>, like ConfirmRemove.tsx.
 */
export function ChooseVersion({ details, onChoose, onCancel }: ChooseVersionProps)
{
    const modal = useModal(details !== null, onCancel);
    /** Whether a version was picked, rather than the dialog cancelled, see settleFocus(). */
    const picked = useRef(false);

    // After useModal's own effect, which has shown the dialog by now.
    useEffect(() =>
    {
        if (!details)
            return;

        picked.current = false;
        // showModal() focuses the first tile, which then looks picked before anything is.
        modal.ref.current?.focus();
    }, [details, modal.ref]);

    // Fires however the dialog closes, Escape and useModal's close() alike.
    const closed = useCallback(() =>
    {
        settleFocus(picked.current);
        onCancel();
    }, [onCancel]);

    const choose = useCallback(
        (chosen: SkylanderDetails, variant?: VersionId) =>
        {
            picked.current = true;
            onChoose(chosen, variant);
        },
        [onChoose],
    );

    // The single version's Add button.
    const add = useCallback(() =>
    {
        if (details)
            choose(details);

    }, [choose, details]);

    const style = details
        ? ({ '--el': elementFor(details.element, details.item).color } as CSSProperties)
        : undefined;
    const choices = details
        ? versionPictures(details, offeredVersions({ ...details, variants: {} }))
        : [];
    // A figure that only came in one version shows that picture alone, to check before adding.
    const single = choices.length === 1;

    return (
        <dialog
            {...modal}
            className="sky-dialog sky-dialog--wide"
            style={style}
            aria-labelledby="sky-choose-title"
            tabIndex={-1}
            onClose={closed}
        >
            {details && (
                <div className="sky-dialog__body">
                    <h2 id="sky-choose-title" className="sky-dialog__title">
                        {single ? `Add ${details.name}?` : `Which ${details.name}?`}
                    </h2>
                    <p className="sky-dialog__text">
                        {single
                            ? 'Check it is the one you have.'
                            : 'Pick the version you are adding.'}
                    </p>
                    <ul className={`sky-choices${single ? ' sky-choices--single' : ''}`}>
                        {/* The picture adds that version, the name opens it on the wiki, like
                            the names in VariantsDialog.tsx. A link cannot sit inside a button,
                            so the tile is a box holding both. */}
                        {choices.map((choice) => (
                            <li
                                key={choice.id}
                                className="sky-choice"
                                style={{ '--v': choice.color } as CSSProperties}
                            >
                                <button
                                    type="button"
                                    className="sky-choice__picture"
                                    aria-label={`Add ${choice.name} ${details.name}`}
                                    onClick={() =>
                                        choose(
                                            details,
                                            choice.id === normal.id ? undefined : choice.id,
                                        )
                                    }
                                >
                                    {choice.src ? (
                                        <img src={choice.src} alt="" referrerPolicy="no-referrer" />
                                    ) : (
                                        <span className="sky-card__placeholder">?</span>
                                    )}
                                </button>
                                <a
                                    className="sky-choice__name"
                                    // One version alone is just the figure, so its own page.
                                    href={
                                        single && details.url
                                            ? details.url
                                            : variantLink(details, choice)
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`See what ${choice.name} ${details.name} looks like`}
                                >
                                    {choice.name}
                                </a>
                            </li>
                        ))}
                    </ul>
                    <div className="sky-dialog__actions">
                        <button type="button" className="sky-btn sky-btn--blue" onClick={onCancel}>
                            Cancel
                        </button>
                        {single && (
                            <button type="button" className="sky-btn" onClick={add}>
                                Add
                            </button>
                        )}
                    </div>
                </div>
            )}
        </dialog>
    );
}
