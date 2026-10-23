import { faArrowDown, faArrowUp, faDiceD20, faForwardStep, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { GameSystem, Initiative, Token } from '../types';

import { begun, cleanRoll, hasRolled, newFight, nextTurn, swapped, withoutRoll, withRoll } from '../map/initiative';

import { Popover } from './Popover';

interface InitiativePanelProps
{
    /** The fight on this map, null while there is none. */
    fight: Initiative | null;
    /** Every token on this map, hidden monsters too. */
    tokens: Token[];
    system: GameSystem;
    onChange: (fight: Initiative | null) => void;
    onClose: () => void;
}

/**
 * The GM's initiative, above the play dock: start a fight, and every phone asks for its roll. The
 * order fills in as the rolls come; the GM types any roll, a monster's to bring it in, and swaps
 * neighbours to settle a tie otherwise. Begin starts the turns, Next passes them on, see PLAN.md.
 */
export function InitiativePanel({ fight, tokens, system, onChange, onClose }: InitiativePanelProps)
{
    const alive = (id: string) => tokens.some((token) => token.id === id);
    const kindOf = (id: string) => tokens.find((token) => token.id === id)?.kind;

    if (!fight)
    {
        return (
            <Popover title="Initiative" className="ttrpg-dock-panel" onClose={onClose}>
                <div className="ttrpg-popover__body ttrpg-settings">
                    <p className="ttrpg-empty">Every phone asks for its roll. You type the monsters&apos; here.</p>
                    <button type="button" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" onClick={() => onChange(newFight)}>
                        <FontAwesomeIcon icon={faDiceD20} />
                        Start initiative
                    </button>
                </div>
            </Popover>
        );
    }

    // A roll typed in: empty takes the token out of the fight.
    const setRoll = (token: Token, typed: string) =>
    {
        const roll = typed.trim() === '' ? null : cleanRoll(Number(typed));
        const was = fight.order.find((entry) => entry.tokenId === token.id)?.roll;

        if (roll === (was ?? null))
            return;

        onChange(roll === null ? withoutRoll(fight, token.id, alive) : withRoll(fight, token, roll, kindOf, system));
    };

    const ordered = fight.order.flatMap((entry) =>
    {
        const token = tokens.find((candidate) => candidate.id === entry.tokenId);

        return token ? [{ token, roll: entry.roll }] : [];
    });
    const waiting = tokens.filter((token) => !hasRolled(fight, token.id));

    const rollField = (token: Token, roll?: number) => (
        <input
            // Keyed on the roll, so a roll from a phone or a swap fills the field anew.
            key={`${token.id} ${roll ?? ''}`}
            className="ttrpg-initiative__roll"
            inputMode="numeric"
            aria-label={`Roll of ${token.name}`}
            defaultValue={roll}
            placeholder="–"
            onBlur={(event) => setRoll(token, event.target.value)}
            onKeyDown={(event) =>
            {
                if (event.key === 'Enter')
                    event.currentTarget.blur();

            }}
        />
    );

    return (
        <Popover title={fight.begun ? `Initiative · Round ${fight.round}` : 'Initiative · Rolling'} className="ttrpg-dock-panel" onClose={onClose}>
            <div className="ttrpg-popover__body">
                {ordered.length === 0 && <p className="ttrpg-empty">No rolls yet.</p>}
                <ol className="ttrpg-rows">
                    {ordered.map(({ token, roll }, index) => (
                        <li key={token.id} className={`ttrpg-row${fight.turn === token.id ? ' ttrpg-row--turn' : ''}${token.hidden ? ' ttrpg-row--hidden' : ''}`}>
                            {rollField(token, roll)}
                            <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                <span className="ttrpg-swatch" style={{ background: token.color }} />
                                <span className="ttrpg-row__name">{token.name}</span>
                            </span>
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label={`Move ${token.name} up`}
                                title="Swap with the one above"
                                disabled={index === 0}
                                onClick={() => onChange(swapped(fight, token.id, true))}
                            >
                                <FontAwesomeIcon icon={faArrowUp} />
                            </button>
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label={`Move ${token.name} down`}
                                title="Swap with the one below"
                                disabled={index === ordered.length - 1}
                                onClick={() => onChange(swapped(fight, token.id, false))}
                            >
                                <FontAwesomeIcon icon={faArrowDown} />
                            </button>
                        </li>
                    ))}
                </ol>
            </div>

            {waiting.length > 0 && (
                <div className="ttrpg-popover__body">
                    <h3 className="ttrpg-subhead">Not in yet</h3>
                    <ul className="ttrpg-rows">
                        {waiting.map((token) => (
                            <li key={token.id} className={`ttrpg-row${token.hidden ? ' ttrpg-row--hidden' : ''}`}>
                                {rollField(token)}
                                <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                    <span className="ttrpg-swatch" style={{ background: token.color }} />
                                    <span className="ttrpg-row__text">
                                        <span className="ttrpg-row__name">{token.name}</span>
                                        <span className="ttrpg-row__detail">{token.kind === 'player' && !fight.begun ? 'No roll yet' : 'Sits out without a roll'}</span>
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="ttrpg-popover__body">
                <div className="ttrpg-popover__foot">
                    <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => onChange(null)}>
                        <FontAwesomeIcon icon={faStop} />
                        End
                    </button>
                    {fight.begun ? (
                        <button type="button" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" onClick={() => onChange(nextTurn(fight, alive))}>
                            <FontAwesomeIcon icon={faForwardStep} />
                            Next turn
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm"
                            disabled={ordered.length === 0}
                            onClick={() => onChange(begun(fight, alive))}
                        >
                            <FontAwesomeIcon icon={faPlay} />
                            Begin
                        </button>
                    )}
                </div>
            </div>
        </Popover>
    );
}
