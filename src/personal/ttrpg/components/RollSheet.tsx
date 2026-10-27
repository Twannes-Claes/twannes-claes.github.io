import { faDice, faDiceD20 } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';

import type { DiceAsk, DiceRoll, GameSystem } from '../types';

import { diceName } from '../map/dice';

import { DicePanel } from './DicePanel';
import { Spinner } from './Feedback';
import { morph, readMs } from './morph';

interface RollSheetProps
{
    /** What to roll, like Roll initiative. */
    title: string;
    /** A line under it, like a reminder of what the roll usually is. */
    note?: string;
    /** For the dice, see DicePanel.tsx. */
    rolls: DiceRoll[];
    system: GameSystem;
    /** The player's ring colour, which their own rolls carry. */
    own?: string;
    /**
     * What the roll adds, from the token's stats, for a button that rolls with it, see
     * initiativeBonus in map/presets.ts. Null greys it out, where the stats do not say; without
     * it, as for a group check, there is no such button.
     */
    bonus?: number | null;
    /** Rolls with the app's dice, giving the total. Fails with the message to show. */
    onDice: (ask: DiceAsk) => Promise<{ total: number }>;
    /** Fails with the message to show. */
    onSend: (roll: number) => Promise<void>;
}

/**
 * Asks a phone for one number it rolled, at the bottom where a thumb reaches, like the move sheet.
 * For initiative and the GM's group checks, see PLAN.md. The player types their own roll, or opens
 * the dice in its place, flat on one d20. Once a roll there lands, its total fills the field and
 * the sheet comes back. Both sit at the bottom of the screen, so only one shows at a time.
 */
export function RollSheet({ title, note, rolls, system, own, bonus, onDice, onSend }: RollSheetProps)
{
    const [typed, setTyped] = useState('');
    const [failure, setFailure] = useState('');
    const [busy, setBusy] = useState(false);
    const [diceOpen, setDiceOpen] = useState(false);
    const roll = Number(typed);
    const ready = typed !== '' && Number.isInteger(roll) && !busy;

    const send = (event: FormEvent) =>
    {
        event.preventDefault();

        if (!ready)
            return;

        setBusy(true);
        setFailure('');
        onSend(roll)
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() => setBusy(false));
    };

    // Once it has morphed, the sheet comes back without its own rise, see .ttrpg-roll-swap.
    const [morphed, setMorphed] = useState(false);

    // What the dice open with in their Add field.
    const [start, setStart] = useState(0);

    const swap = (open: boolean, modifier = 0) =>
        morph(() =>
        {
            setDiceOpen(open);
            setStart(modifier);
            setMorphed(true);
        });

    const throwDice = (ask: DiceAsk) => onDice(ask).then(({ total }) => setTyped(String(total)));

    // The dice open, and once they are in place throw with the bonus added, landing like any roll.
    const rollBonus = () =>
    {
        if (bonus === null || bonus === undefined)
            return;

        void swap(true, bonus).then(() =>
            throwDice({ sides: 20, count: 1, modifier: bonus }).catch((reason: Error) =>
            {
                setFailure(reason.message);
                void swap(false);
            }),
        );
    };

    // Back once the player's own roll shows its total, flat or 3D, with a moment to read it.
    const landed = (thrown: DiceRoll) =>
    {
        if (thrown.color === own)
            setTimeout(() => swap(false), readMs);

    };

    if (diceOpen)
        return <DicePanel rolls={rolls} onRoll={throwDice} system={system} phone quick modifier={start} own={own} onLanded={landed} onClose={() => swap(false)} />;

    return (
        <form className={`ttrpg-panel ttrpg-sheet ttrpg-roll-swap${morphed ? ' ttrpg-roll-swap--still' : ''}`} aria-label={title} onSubmit={send}>
            <p className="ttrpg-sheet__who">
                <strong>{title}</strong>
                {note && <span>{note}</span>}
            </p>
            {/* Typing first, but not back from the dice, where a phone's keyboard would jump up mid-morph. */}
            <label className="ttrpg-field">
                You rolled
                <input type="number" inputMode="numeric" min={-99} max={99} value={typed} autoFocus={typed === ''} onChange={(event) => setTyped(event.target.value)} />
            </label>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <div className="ttrpg-popover__foot">
                {/* Not disabled without a bonus, which would keep the pointer and so the tip off it. */}
                {bonus !== undefined && (
                    <button
                        type="button"
                        className="ttrpg-segment ttrpg-segment--block"
                        title={bonus === null ? 'No initiative bonus on your character' : `Roll ${diceName({ sides: 20, count: 1, modifier: bonus })}, your initiative bonus`}
                        aria-disabled={bonus === null}
                        onClick={rollBonus}
                    >
                        <FontAwesomeIcon icon={faDiceD20} />
                        {bonus === null ? 'Bonus' : `Roll ${bonus < 0 ? '−' : '+'}${Math.abs(bonus)}`}
                    </button>
                )}
                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => swap(true)}>
                    <FontAwesomeIcon icon={faDice} />
                    Roll dice
                </button>
                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={!ready}>
                    {busy ? <Spinner /> : <FontAwesomeIcon icon={faDiceD20} />}
                    Send
                </button>
            </div>
        </form>
    );
}
