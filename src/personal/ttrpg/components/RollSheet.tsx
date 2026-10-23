import { faDiceD20 } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';

import { Spinner } from './Feedback';

interface RollSheetProps
{
    /** What to roll, like Roll initiative. */
    title: string;
    /** A line under it, like a reminder of what the roll usually is. */
    note?: string;
    /** Fails with the message to show. */
    onSend: (roll: number) => Promise<void>;
}

/**
 * Asks a phone for one number it rolled, at the bottom where a thumb reaches, like the move sheet.
 * For initiative now, and for the GM's group checks, see PLAN.md.
 */
export function RollSheet({ title, note, onSend }: RollSheetProps)
{
    const [typed, setTyped] = useState('');
    const [failure, setFailure] = useState('');
    const [busy, setBusy] = useState(false);
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

    return (
        <form className="ttrpg-panel ttrpg-sheet ttrpg-hit" aria-label={title} onSubmit={send}>
            <p className="ttrpg-sheet__who">
                <strong>{title}</strong>
                {note && <span>{note}</span>}
            </p>
            <label className="ttrpg-field">
                You rolled
                <input type="number" inputMode="numeric" min={-99} max={99} value={typed} autoFocus onChange={(event) => setTyped(event.target.value)} />
            </label>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <div className="ttrpg-popover__foot">
                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={!ready}>
                    {busy ? <Spinner /> : <FontAwesomeIcon icon={faDiceD20} />}
                    Send
                </button>
            </div>
        </form>
    );
}
