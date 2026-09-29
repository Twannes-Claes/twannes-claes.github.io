import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';

import type { Skylander } from '../types';

import { elementFor } from '../content/elements';
import { offeredVariants, plainCount, type VariantId } from '../content/variants';

interface VariantsDialogProps
{
    /** The Skylander whose versions are being edited, or null when the dialog is closed. */
    item: Skylander | null;
    /** A variant of undefined means a plain copy. */
    onChange: (item: Skylander, delta: number, variant?: VariantId) => void;
    onClose: () => void;
}

interface RowProps
{
    item: Skylander;
    label: string;
    color: string;
    count: number;
    variant?: VariantId;
    onChange: VariantsDialogProps['onChange'];
}

function Row({ item, label, color, count, variant, onChange }: RowProps)
{
    const increase = useCallback(() => onChange(item, 1, variant), [item, variant, onChange]);
    const decrease = useCallback(() => onChange(item, -1, variant), [item, variant, onChange]);

    return (
        <li className="sky-variant" style={{ '--v': color } as CSSProperties}>
            <span className="sky-variant__name">{label}</span>
            <div className="sky-stepper" role="group" aria-label={`${label} copies`}>
                <button
                    type="button"
                    className="sky-stepper__btn sky-stepper__btn--minus"
                    onClick={decrease}
                    // The last copy goes through the remove button on the card instead.
                    disabled={count === 0 || item.count === 1}
                    aria-label={`One less ${label}`}
                >
                    <FontAwesomeIcon icon={faMinus} />
                </button>
                <span className="sky-stepper__count" key={count} aria-live="polite">
                    {count}
                </span>
                <button
                    type="button"
                    className="sky-stepper__btn sky-stepper__btn--plus"
                    onClick={increase}
                    aria-label={`One more ${label}`}
                >
                    <FontAwesomeIcon icon={faPlus} />
                </button>
            </div>
        </li>
    );
}

/**
 * Lists every version of a figure with its own stepper, for telling a Legendary or a Series 2
 * apart from the plain one. A native <dialog>, like ConfirmRemove.tsx.
 */
export function VariantsDialog({ item, onChange, onClose }: VariantsDialogProps)
{
    const dialog = useRef<HTMLDialogElement>(null);

    // Runs on every item change rather than only on open and close, so the dialog is shown again
    // even if it was closed some way that did not reach onClose.
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

    // A click on the dialog element itself, rather than its contents, landed on the backdrop.
    const onBackdrop = useCallback(
        (event: MouseEvent<HTMLDialogElement>) =>
        {
            if (event.target === event.currentTarget)
                onClose();

        },
        [onClose],
    );

    const style = item ? ({ '--el': elementFor(item.element).color } as CSSProperties) : undefined;

    return (
        <dialog
            ref={dialog}
            className="sky-dialog"
            style={style}
            aria-labelledby="sky-variants-title"
            onClose={onClose}
            onClick={onBackdrop}
        >
            {item && (
                <div className="sky-dialog__body">
                    <h2 id="sky-variants-title" className="sky-dialog__title">
                        {item.name} versions
                    </h2>
                    <p className="sky-dialog__text">
                        {item.count} {item.count === 1 ? 'figure' : 'figures'} in total.
                    </p>
                    <ul className="sky-variants">
                        <Row
                            item={item}
                            label="Normal"
                            color="#f5c542"
                            count={plainCount(item.count, item.variants)}
                            onChange={onChange}
                        />
                        {offeredVariants(item.versions, item.variants).map((variant) => (
                            <Row
                                key={variant.id}
                                item={item}
                                label={variant.name}
                                color={variant.color}
                                count={item.variants[variant.id] ?? 0}
                                variant={variant.id}
                                onChange={onChange}
                            />
                        ))}
                    </ul>
                    <div className="sky-dialog__actions">
                        <button type="button" className="sky-btn sky-btn--blue" onClick={onClose}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
