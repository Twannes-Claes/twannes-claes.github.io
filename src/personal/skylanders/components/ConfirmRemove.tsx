import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

import type { Skylander } from '../types';

import { elementFor } from '../content/elements';

interface ConfirmRemoveProps
{
    /** The Skylander waiting to be removed, or null when the dialog is closed. */
    item: Skylander | null;
    onConfirm: (item: Skylander) => void;
    onCancel: () => void;
}

/**
 * Asks before removing a Skylander, in place of window.confirm, which the browser draws in its
 * own style. A native <dialog> opened with showModal() handles the focus trap and Escape.
 */
export function ConfirmRemove({ item, onConfirm, onCancel }: ConfirmRemoveProps)
{
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        const element = dialog.current;

        if (!element)
            return;

        if (item && !element.open)
            element.showModal();
        else if (!item && element.open)
            element.close();

    }, [item]);

    const confirm = useCallback(() =>
    {
        if (item)
            onConfirm(item);

    }, [item, onConfirm]);

    // A click on the dialog element itself, rather than its contents, landed on the backdrop.
    const onBackdrop = useCallback(
        (event: MouseEvent<HTMLDialogElement>) =>
        {
            if (event.target === event.currentTarget)
                onCancel();

        },
        [onCancel],
    );

    const style = item ? ({ '--el': elementFor(item.element, item.item).color } as CSSProperties) : undefined;

    return (
        <dialog
            ref={dialog}
            className="sky-dialog"
            style={style}
            aria-labelledby="sky-dialog-title"
            onClose={onCancel}
            onClick={onBackdrop}
        >
            {item && (
                <div className="sky-dialog__body">
                    <div className="sky-dialog__portrait">
                        {item.image ? (
                            <img src={item.image} alt="" referrerPolicy="no-referrer" />
                        ) : (
                            <span className="sky-card__placeholder">?</span>
                        )}
                    </div>
                    <h2 id="sky-dialog-title" className="sky-dialog__title">
                        Remove {item.name}?
                    </h2>
                    <p className="sky-dialog__text">
                        {item.name} will leave the collection. You can always add it back later.
                    </p>
                    <div className="sky-dialog__actions">
                        <button
                            type="button"
                            className="sky-btn sky-btn--blue"
                            onClick={onCancel}
                            autoFocus
                        >
                            Keep
                        </button>
                        <button type="button" className="sky-btn sky-btn--red" onClick={confirm}>
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
