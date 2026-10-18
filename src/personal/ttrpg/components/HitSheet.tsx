import { faBurst, faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';

import type { HitKind, Token } from '../types';

import { Spinner } from './Feedback';
import { useKeydown } from './useKeys';

interface AttackButtonProps
{
    onClick: () => void;
    disabled?: boolean;
}

/**
 * Starts picking targets for an attack or a heal. The controls it sits in make way for HitSheet
 * while picking, so it never needs to stop it.
 */
export function AttackButton({ onClick, disabled = false }: AttackButtonProps)
{
    return (
        <button
            type="button"
            className="ttrpg-segment"
            title="Pick tokens, then deal damage or heal them"
            disabled={disabled}
            onClick={onClick}
        >
            <FontAwesomeIcon icon={faBurst} />
            Attack
        </button>
    );
}

interface HitSheetProps
{
    /** The tokens picked so far, in the order they were picked. */
    targets: Token[];
    /** Whether Heal may go to these targets: a player heals players only. */
    canHeal: boolean;
    /** Fails with the message to show. */
    onApply: (kind: HitKind, amount: number) => Promise<void>;
    onCancel: () => void;
}

/**
 * While picking targets, at the bottom where a thumb reaches like the move sheet: who is picked,
 * how much, and Damage or Heal for all of them at once. Enter deals damage, Esc stops picking.
 */
export function HitSheet({ targets, canHeal, onApply, onCancel }: HitSheetProps)
{
    const [amount, setAmount] = useState('');
    const [failure, setFailure] = useState('');
    const [busy, setBusy] = useState(false);
    const value = Number(amount);
    const ready = targets.length > 0 && amount !== '' && Number.isInteger(value) && value >= 1 && !busy;

    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onCancel();

    });

    const apply = (kind: HitKind) =>
    {
        if (!ready)
            return;

        setBusy(true);
        setFailure('');
        onApply(kind, value)
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() => setBusy(false));
    };

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();
        apply('attack');
    };

    return (
        <form className="ttrpg-panel ttrpg-sheet ttrpg-hit" aria-label="Attack or heal" onSubmit={submit}>
            {targets.length === 0 ? (
                <p className="ttrpg-hit__hint">Tap the tokens to hit or heal.</p>
            ) : (
                <ul className="ttrpg-hit__targets" aria-label="Targets">
                    {targets.map((token) => (
                        <li key={token.id}>
                            <span className="ttrpg-swatch" style={{ background: token.color }} />
                            {token.name}
                        </li>
                    ))}
                </ul>
            )}
            <label className="ttrpg-field">
                Amount
                <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={9999}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                />
            </label>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <div className="ttrpg-popover__foot">
                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={onCancel}>
                    Cancel
                    <kbd>Esc</kbd>
                </button>
                <button
                    type="button"
                    className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm"
                    disabled={!ready || !canHeal}
                    title={canHeal ? undefined : 'Only players can be healed'}
                    onClick={() => apply('heal')}
                >
                    <FontAwesomeIcon icon={faHeart} />
                    Heal
                </button>
                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--hit" disabled={!ready}>
                    {busy ? <Spinner /> : <FontAwesomeIcon icon={faBurst} />}
                    Damage
                </button>
            </div>
        </form>
    );
}
