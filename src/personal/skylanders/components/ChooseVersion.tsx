import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

import type { SkylanderDetails } from '../types';

import { elementFor } from '../content/elements';
import { normal, normalFor, offeredVariants, type VariantId } from '../content/variants';

interface ChooseVersionProps
{
    /** The figure being added, or null when the dialog is closed. */
    details: SkylanderDetails | null;
    /** A variant of undefined means the plain version. */
    onChoose: (details: SkylanderDetails, variant?: VariantId) => void;
    onCancel: () => void;
}

/**
 * Closing the dialog hands focus back to the search, which would open its suggestions again right
 * after a version was picked, so it lets go of it.
 */
function leaveSearch()
{
    if (document.activeElement instanceof HTMLInputElement)
        document.activeElement.blur();

}

/**
 * Asks which version of a figure is being added, with a picture of each to compare against the
 * one in hand. A native <dialog>, like ConfirmRemove.tsx.
 */
export function ChooseVersion({ details, onChoose, onCancel }: ChooseVersionProps)
{
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        const element = dialog.current;

        if (!element)
            return;

        if (details && !element.open)
        {
            element.showModal();
            // showModal() focuses the first tile, which then looks picked before anything is.
            element.focus();
        }
        else if (!details && element.open)
        {
            element.close();
            leaveSearch();
        }

    }, [details]);

    // Escape closes the dialog without going through the effect above.
    const closed = useCallback(() =>
    {
        leaveSearch();
        onCancel();
    }, [onCancel]);

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
            ...offeredVariants(details.versions, {}).map((variant) => ({
                ...variant,
                src: details.looks?.[variant.id] ?? '',
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
                                        onChoose(
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
                                onClick={() => onChoose(details)}
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
