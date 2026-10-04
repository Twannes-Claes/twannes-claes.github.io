import { useCallback, type CSSProperties } from 'react';

import type { Skylander } from '../types';

import { elementFor } from '../content/elements';

import { useModal } from './useModal';

interface ConfirmRemoveProps
{
    /** The Skylander waiting to be removed, or null when the dialog is closed. */
    item: Skylander | null;
    onConfirm: (item: Skylander) => void;
    onCancel: () => void;
}

/**
 * Asks before removing a Skylander, in place of window.confirm, which the browser draws in its
 * own style. A native <dialog>, see useModal.ts.
 */
export function ConfirmRemove({ item, onConfirm, onCancel }: ConfirmRemoveProps)
{
    const modal = useModal(item !== null, onCancel);

    const confirm = useCallback(() =>
    {
        if (item)
            onConfirm(item);

    }, [item, onConfirm]);

    const style = item ? ({ '--el': elementFor(item.element, item.item).color } as CSSProperties) : undefined;

    return (
        <dialog
            {...modal}
            className="sky-dialog"
            style={style}
            aria-labelledby="sky-dialog-title"
            onClose={onCancel}
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
