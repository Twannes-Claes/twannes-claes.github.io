import { faPaperPlane, faStop } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type FormEvent } from 'react';

import type { GroupCheck, Token } from '../types';

import { Popover } from './Popover';

interface CheckPanelProps
{
    /** The check out to the players, null while there is none. */
    check: GroupCheck | null;
    /** The players on this map, who are asked. */
    players: Token[];
    /** Sends a new check to the picked players, or with null closes it. */
    onSend: (check: { text: string; asked: string[] } | null) => void;
    onClose: () => void;
}

/**
 * The GM's group check, above the play dock: write what to roll, pick who rolls, everyone at
 * first, and their phones ask for the number, like initiative. Who rolled what shows here only,
 * see Group checks in PLAN.md.
 */
export function CheckPanel({ check, players, onSend, onClose }: CheckPanelProps)
{
    const [text, setText] = useState('');
    // The ones taken off rather than the ones picked, so a player who joins meanwhile is in.
    const [left, setLeft] = useState<string[]>([]);

    if (!check)
    {
        const asked = players.filter((token) => !left.includes(token.id)).map((token) => token.id);

        const send = (event: FormEvent) =>
        {
            event.preventDefault();

            if (text.trim() && asked.length > 0)
                onSend({ text: text.trim(), asked });

        };

        const toggle = (id: string) => setLeft((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

        return (
            <Popover title="Group check" className="ttrpg-dock-panel" onClose={onClose}>
                <form className="ttrpg-popover__body ttrpg-check-form" onSubmit={send}>
                    <label className="ttrpg-field">
                        What to roll
                        <input value={text} maxLength={200} placeholder="Reflex save, the floor gives way" autoFocus onChange={(event) => setText(event.target.value)} />
                    </label>
                    <div className="ttrpg-field" role="group" aria-label="Who rolls">
                        <span className="ttrpg-picks__head">
                            Who rolls
                            {players.length > 1 && (
                                <span className="ttrpg-picks__quick">
                                    <button type="button" disabled={left.length === 0} onClick={() => setLeft([])}>
                                        All
                                    </button>
                                    <button type="button" disabled={asked.length === 0} onClick={() => setLeft(players.map((token) => token.id))}>
                                        None
                                    </button>
                                </span>
                            )}
                        </span>
                        {players.length === 0 && <p className="ttrpg-empty">No players on this map.</p>}
                        <div className="ttrpg-picks">
                            {players.map((token) => (
                                <button key={token.id} type="button" className="ttrpg-pick" aria-pressed={!left.includes(token.id)} onClick={() => toggle(token.id)}>
                                    <span className="ttrpg-swatch" style={{ background: token.color }} />
                                    {token.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={!text.trim() || asked.length === 0}>
                        <FontAwesomeIcon icon={faPaperPlane} />
                        {asked.length === 0 ? 'Pick who rolls' : asked.length === players.length ? 'Send to everyone' : `Send to ${asked.length}`}
                    </button>
                </form>
            </Popover>
        );
    }

    const rollOf = (token: Token) => check.rolls.find((entry) => entry.tokenId === token.id)?.roll;
    // Highest first, then who is still missing.
    const rows = players.filter((token) => check.asked.includes(token.id)).sort((a, b) => (rollOf(b) ?? -Infinity) - (rollOf(a) ?? -Infinity));

    return (
        <Popover title="Group check" className="ttrpg-dock-panel" onClose={onClose}>
            <div className="ttrpg-popover__body">
                <p className="ttrpg-empty">{check.text}</p>
                {rows.length === 0 && <p className="ttrpg-empty">Nobody asked is on this map.</p>}
                <ul className="ttrpg-rows">
                    {rows.map((token) => (
                        <li key={token.id} className="ttrpg-row">
                            <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                <span className="ttrpg-swatch" style={{ background: token.color }} />
                                <span className="ttrpg-row__text">
                                    <span className="ttrpg-row__name">{token.name}</span>
                                    {rollOf(token) === undefined && <span className="ttrpg-row__detail">No roll yet</span>}
                                </span>
                            </span>
                            {rollOf(token) !== undefined && <strong>{rollOf(token)}</strong>}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="ttrpg-popover__body">
                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => onSend(null)}>
                    <FontAwesomeIcon icon={faStop} />
                    Close check
                </button>
            </div>
        </Popover>
    );
}
