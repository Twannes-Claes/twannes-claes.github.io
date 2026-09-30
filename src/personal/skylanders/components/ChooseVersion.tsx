import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

import type { SkylanderDetails } from '../types';

import { elementFor } from '../content/elements';
import {
    normal,
    normalFor,
    offeredVersions,
    versionImage,
    type VersionId,
} from '../content/variants';

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
    const dialog = useRef<HTMLDialogElement>(null);
    /** Whether a version was picked, rather than the dialog cancelled, see settleFocus(). */
    const picked = useRef(false);

    useEffect(() =>
    {
        const element = dialog.current;

        if (!element)
            return;

        if (details && !element.open)
        {
            picked.current = false;
            element.showModal();
            // showModal() focuses the first tile, which then looks picked before anything is.
            element.focus();
        }
        else if (!details && element.open)
        {
            element.close();
            settleFocus(picked.current);
        }

    }, [details]);

    // Escape closes the dialog without going through the effect above.
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

    // A click on the dialog element itself, rather than its contents, landed on the backdrop.
    const onBackdrop = useCallback(
        (event: MouseEvent<HTMLDialogElement>) =>
        {
            if (event.target === event.currentTarget)
                onCancel();

        },
        [onCancel],
    );

    const style = details
        ? ({ '--el': elementFor(details.element).color } as CSSProperties)
        : undefined;
    const choices = details
        ? [
            { ...normalFor(details.versions), src: details.looks?.normal ?? details.image },
            ...offeredVersions({ ...details, variants: {} }).map((version) => ({
                ...version,
                src: versionImage(details, version),
            })),
        ]
        : [];
    // A figure that only came in one version shows that picture alone, to check before adding.
    const single = choices.length === 1;

    return (
        <dialog
            ref={dialog}
            className="sky-dialog sky-dialog--wide"
            style={style}
            aria-labelledby="sky-choose-title"
            tabIndex={-1}
            onClose={closed}
            onClick={onBackdrop}
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
                        {choices.map((choice) => (
                            <li key={choice.id}>
                                <button
                                    type="button"
                                    className="sky-choice"
                                    style={{ '--v': choice.color } as CSSProperties}
                                    onClick={() =>
                                        choose(
                                            details,
                                            choice.id === normal.id ? undefined : choice.id,
                                        )
                                    }
                                >
                                    <span className="sky-choice__picture">
                                        {choice.src ? (
                                            <img
                                                src={choice.src}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <span className="sky-card__placeholder">?</span>
                                        )}
                                    </span>
                                    <span className="sky-choice__name">{choice.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="sky-dialog__actions">
                        <button type="button" className="sky-btn sky-btn--blue" onClick={onCancel}>
                            Cancel
                        </button>
                        {single && (
                            <button
                                type="button"
                                className="sky-btn"
                                onClick={() => choose(details)}
                            >
                                Add
                            </button>
                        )}
                    </div>
                </div>
            )}
        </dialog>
    );
}
