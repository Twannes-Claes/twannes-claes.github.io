import { faArrowDown, faArrowUp, faBurst, faDice, faDiceD20, faForwardStep, faHeart, faPlay, faRotateLeft, faSkull, faStop, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import type { DiceAsk, DiceRoll, GameSystem, Initiative, LoggedHit, Preset, Token } from '../types';

import { diceName, rollDice } from '../map/dice';
import { begun, cleanRoll, hasRolled, newFight, nextTurn, swapped, withoutRoll, withRoll } from '../map/initiative';
import { initiativeBonus } from '../map/presets';

import { DicePanel } from './DicePanel';
import { glide, morph, place, readMs, type Placed } from './morph';
import { Popover } from './Popover';
import { StatChips } from './StatsForm';

interface InitiativePanelProps
{
    /** The fight on this map, null while there is none. */
    fight: Initiative | null;
    /** Every token on this map, hidden monsters too. */
    tokens: Token[];
    system: GameSystem;
    /** The GM's monster presets, whose stat blocks give the monsters' initiative bonus. */
    presets: Preset[];
    /** For the dice, see DicePanel.tsx. */
    rolls: DiceRoll[];
    /** Rolls with the dice, giving the dice and the total. Fails with the message to show. */
    onRoll: (ask: DiceAsk) => Promise<Pick<DiceRoll, 'dice' | 'total'>>;
    /** A roll that failed without the dice to say so. */
    onError: (message: string) => void;
    onChange: (fight: Initiative | null) => void;
    /** The fight's hits, newest first, see LoggedHit. */
    hits: LoggedHit[];
    /** Takes back the newest hit, settling once the log shows it gone. */
    onUndo: (hitId: string) => Promise<void>;
    onClose: () => void;
}

/**
 * The token a roll by hand in the dice goes to, none while they throw for all, and what they start
 * with added.
 */
interface Throw
{
    token?: Token;
    modifier: number;
}

/**
 * A name in its token's ring colour instead of a swatch beside it, a quarter mixed with the ink, so
 * a dark ring still reads on the dark theme and a pale one on the light.
 */
function inColour(color: string)
{
    return { color: `color-mix(in srgb, ${color} 75%, var(--ttrpg-ink))` };
}

/** How long a monster's total shows before the dice throw for the next one. */
const nextMs = 700;

/** How long the panel's rise or a hit unfolding or folding away takes, with room to spare. */
const settleMs = 500;

/** How long an undone hit takes to fold away, see .ttrpg-hit-log__entry, before the next can go. */
const foldMs = 420;

/**
 * The GM's initiative, above the play dock: start a fight, and every phone asks for its roll. The
 * order fills in as the rolls come; the GM types any roll, a monster's to bring it in, and swaps
 * neighbours to settle a tie otherwise. Begin starts the turns, Next passes them on, see PLAN.md.
 * A token can also be rolled for with the dice, which the panel turns into and back from, like
 * the phone's roll pop-up, see morph.ts.
 */
export function InitiativePanel({ fight, tokens, system, presets, rolls, onRoll, onError, onChange, hits, onUndo, onClose }: InitiativePanelProps)
{
    // The hits there when the panel opened show at once; only those after grow in.
    const [shown] = useState(() => new Set(hits.map((hit) => hit.id)));
    // Whether an undo is on its way or its line still folding away, so the next line's Undo, now
    // under the pointer, waits and a double press takes back one.
    const [undoing, setUndoing] = useState(false);
    // The fight as it is now, for dice that come back after it changed, see apply.
    const latest = useRef(fight);
    const [throwing, setThrowing] = useState<Throw | null>(null);
    // Once it has morphed, the panel comes back without its own rise, see .ttrpg-roll-swap.
    const [morphed, setMorphed] = useState(false);

    useEffect(() =>
    {
        latest.current = fight;
    }, [fight]);

    // Where the panel and its rows were before the last change, to glide from, see glide.
    const placed = useRef<Placed | null>(null);

    // A change from this panel, measured as things stand right before it, so the glide starts from
    // where the rows really are: not where the panel's rise or a hit unfolding since left them.
    const change = (next: Initiative | null) =>
    {
        placed.current = place();
        onChange(next);
    };

    const alive = (id: string) => tokens.some((token) => token.id === id);
    const kindOf = (id: string) => tokens.find((token) => token.id === id)?.kind;
    const bonusOf = (token: Token) => initiativeBonus(token, presets, system);

    const swap = (next: Throw | null) =>
        morph(() =>
        {
            setThrowing(next);
            setClosing(null);
            setMorphed(true);
        });

    // Rolls added to the fight as it is when the dice are back, so a phone's roll that came in
    // meanwhile stays. Kept as the latest at once too, so rolls back before the fight's next update
    // build on each other.
    const addRolls = (entries: { token: Token; roll: number }[]) =>
    {
        if (!latest.current || entries.length === 0)
            return;

        const next = entries.reduce((current, { token, roll }) => withRoll(current, token, roll, kindOf, system), latest.current);

        latest.current = next;
        change(next);
    };

    // A roll's total as the token's.
    const apply = (token: Token | undefined, { total }: Pick<DiceRoll, 'total'>) => token && addRolls([{ token, roll: total }]);

    // The tokens the dice still throw for, one roll each with its own bonus, see landed.
    const queue = useRef<Token[]>([]);
    // The tokens a closed throw for all still waits on, see stopDice.
    const [closing, setClosing] = useState<Token[] | null>(null);

    // Throws hidden for the next token in the queue. A failed throw empties it, leaving the dice
    // open to try by hand.
    const throwNext = () =>
    {
        const [token, ...rest] = queue.current;

        if (!token)
            return;

        queue.current = rest;
        onRoll({ sides: 20, count: 1, modifier: bonusOf(token) ?? 0, hidden: true }).then(
            (rolled) => apply(token, rolled),
            (reason: Error) =>
            {
                queue.current = [];
                onError(reason.message);
            },
        );
    };

    // The dice open, with a lone token's bonus added, and with auto throw for each token in turn
    // once they are in place.
    const openDice = (picked: Token[], auto: boolean) =>
    {
        queue.current = auto ? picked : [];

        void swap({ token: picked.length === 1 ? picked[0] : undefined, modifier: picked.length === 1 ? (bonusOf(picked[0]) ?? 0) : 0 }).then(() =>
        {
            if (auto)
                throwNext();

        });
    };

    // A GM's roll that shows its total throws for the next token, or after a moment to read it turns
    // back. Players' rolls carry their ring colour, the GM's none.
    const landed = (thrown: DiceRoll) =>
    {
        if (thrown.color !== undefined)
            return;

        if (queue.current.length > 0)
            setTimeout(throwNext, nextMs);
        else
            setTimeout(() => swap(null), readMs);

    };

    // Closing the dice in a throw for all rolls the rest at once in this tab, without the show, as
    // the GM can type any roll anyway. The dice stay until the fight has them all, so the panel turns
    // back once, as it ends up, see below. Closing again turns back at once.
    const stopDice = () =>
    {
        const rest = queue.current;

        queue.current = [];

        if (rest.length === 0)
        {
            void swap(null);

            return;
        }

        setClosing(rest);
        addRolls(rest.map((token) => ({ token, roll: rollDice({ sides: 20, count: 1, modifier: bonusOf(token) ?? 0 }, Math.random).total })));
    };

    const turnBack = useEffectEvent(() => void swap(null));

    useEffect(() =>
    {
        if (!closing || (fight && !closing.every((token) => hasRolled(fight, token.id))))
            return;

        const timer = setTimeout(turnBack);

        return () => clearTimeout(timer);
    }, [closing, fight]);

    // Each change to the fight glides the rows into their new places, from where they were before
    // it, see change, or for one from a phone after the last, see below. Not while the dice show, so
    // the panel coming back starts afresh.
    useLayoutEffect(() =>
    {
        const now = throwing ? null : place();

        if (placed.current && now)
            glide(placed.current, now);

        placed.current = now;
    }, [fight, throwing]);

    // Once the panel has risen, or a hit has unfolded or folded away, where things are, for a change
    // from a phone, which comes without a press here to measure on. Not during a glide, which
    // measuring would cut short.
    useEffect(() =>
    {
        const timer = setTimeout(() =>
        {
            if (!document.getAnimations().some((motion) => motion.id === 'glide'))
                placed.current = place() ?? placed.current;
        }, settleMs);

        return () => clearTimeout(timer);
    }, [hits]);

    if (throwing)
    {
        const roll = (ask: DiceAsk) => onRoll(ask).then((rolled) => apply(throwing.token, rolled));

        return <DicePanel rolls={rolls} onRoll={roll} system={system} host quick modifier={throwing.modifier} onLanded={landed} onClose={stopDice} />;
    }

    if (!fight)
    {
        return (
            <Popover title="Initiative" className="ttrpg-dock-panel ttrpg-initiative" onClose={onClose}>
                <div className="ttrpg-popover__body ttrpg-settings">
                    <p className="ttrpg-empty">Every phone asks for its roll. You type the monsters&apos; here.</p>
                    <button type="button" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" onClick={() => change(newFight)}>
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

        change(roll === null ? withoutRoll(fight, token.id, alive) : withRoll(fight, token, roll, kindOf, system));
    };

    const ordered = fight.order.flatMap((entry) =>
    {
        const token = tokens.find((candidate) => candidate.id === entry.tokenId);

        return token ? [{ token, roll: entry.roll }] : [];
    });
    // Summons stay out of the fight, see Token.
    const waiting = tokens.filter((token) => !hasRolled(fight, token.id) && !token.summonOf);
    const players = waiting.filter((token) => token.kind === 'player');
    const monsters = waiting.filter((token) => token.kind === 'npc');
    const rollable = monsters.filter((token) => bonusOf(token) !== undefined);

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

    const waitingRow = (token: Token) =>
    {
        const bonus = bonusOf(token);

        return (
            <li key={token.id} className="ttrpg-row" data-glide={token.id}>
                {rollField(token)}
                <span className="ttrpg-row__main">
                    <span className="ttrpg-row__text">
                        <span className="ttrpg-row__name ttrpg-initiative__name" style={inColour(token.color)}>
                            {token.name}
                        </span>
                        <span className="ttrpg-row__detail">{token.kind === 'player' && !fight.begun ? 'No roll yet' : 'Sits out without a roll'}</span>
                    </span>
                </span>
                {/* Not disabled, which would keep the pointer and so the tip off it. */}
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
                    aria-label={`Roll ${token.name}'s initiative bonus`}
                    title={bonus === undefined ? 'No initiative bonus in its stat block' : `Roll ${diceName({ sides: 20, count: 1, modifier: bonus })}, its initiative bonus`}
                    aria-disabled={bonus === undefined}
                    onClick={() => bonus !== undefined && openDice([token], true)}
                >
                    <FontAwesomeIcon icon={faDiceD20} />
                </button>
                <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label={`Roll for ${token.name} with the dice`} title="Roll with the dice" onClick={() => openDice([token], false)}>
                    <FontAwesomeIcon icon={faDice} />
                </button>
            </li>
        );
    };

    return (
        <Popover title={fight.begun ? `Initiative · Round ${fight.round}` : 'Initiative · Rolling'} className={`ttrpg-dock-panel ttrpg-initiative ttrpg-roll-swap${morphed ? ' ttrpg-roll-swap--still' : ''}`} onClose={onClose}>
            <div className="ttrpg-popover__body">
                {ordered.length === 0 && <p className="ttrpg-empty" data-glide="empty">No rolls yet.</p>}
                <ol className="ttrpg-rows ttrpg-initiative__order">
                    {ordered.map(({ token, roll }, index) => (
                        <li key={token.id} className={`ttrpg-row${fight.turn === token.id ? ' ttrpg-row--turn' : ''}`} data-glide={token.id}>
                            {rollField(token, roll)}
                            <span className="ttrpg-row__main">
                                {/* The name with its HP and AC under it, as in the Monsters panel. */}
                                <span className="ttrpg-row__text">
                                    <span className="ttrpg-row__name ttrpg-initiative__name" style={inColour(token.color)}>
                                        {token.name}
                                    </span>
                                    <StatChips token={token} brief />
                                </span>
                            </span>
                            {/* One tile on the right, mirroring the roll's on the left. */}
                            <span className="ttrpg-initiative__tools">
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={`Move ${token.name} up`}
                                    title="Swap with the one above"
                                    disabled={index === 0}
                                    onClick={() => change(swapped(fight, token.id, true))}
                                >
                                    <FontAwesomeIcon icon={faArrowUp} />
                                </button>
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={`Move ${token.name} down`}
                                    title="Swap with the one below"
                                    disabled={index === ordered.length - 1}
                                    onClick={() => change(swapped(fight, token.id, false))}
                                >
                                    <FontAwesomeIcon icon={faArrowDown} />
                                </button>
                                <button
                                    type="button"
                                    className="ttrpg-icon-button ttrpg-icon-button--small"
                                    aria-label={`Take ${token.name} out`}
                                    title="Take out of the order, back to no roll"
                                    onClick={() => change(withoutRoll(fight, token.id, alive))}
                                >
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ol>
            </div>

            {players.length > 0 && (
                <div className="ttrpg-popover__body">
                    <h3 className="ttrpg-subhead" data-glide="players">Players not in yet</h3>
                    <ul className="ttrpg-rows">{players.map(waitingRow)}</ul>
                </div>
            )}

            {monsters.length > 0 && (
                <div className="ttrpg-popover__body">
                    <div className="ttrpg-subhead ttrpg-subhead--row" data-glide="monsters">
                        <h3>Monsters not in yet</h3>
                        <button
                            type="button"
                            className="ttrpg-icon-button ttrpg-icon-button--small"
                            aria-label="Roll for every monster"
                            title={rollable.length > 0 ? 'Roll for every monster with an initiative bonus in its stat block' : 'No monster here has an initiative bonus in its stat block'}
                            aria-disabled={rollable.length === 0}
                            onClick={() => rollable.length > 0 && openDice(rollable, true)}
                        >
                            <FontAwesomeIcon icon={faDiceD20} />
                        </button>
                    </div>
                    <ul className="ttrpg-rows">{monsters.map(waitingRow)}</ul>
                </div>
            )}

            {/* Always there in a fight, so the last hit undone folds away rather than the section going. */}
            <div className="ttrpg-popover__body">
                <h3 className="ttrpg-subhead" data-glide="hits">
                    Hits
                </h3>
                {/* The line and the list in one place, so the panel never jumps between them. */}
                <div className="ttrpg-hit-log__stack">
                    {hits.length === 0 && <p className="ttrpg-empty ttrpg-hit-log__empty">No hits yet.</p>}
                    <ol className="ttrpg-rows ttrpg-hit-log">
                        {hits.map((hit, index) => (
                            <li key={hit.id} className={`ttrpg-row ttrpg-hit-log__entry${shown.has(hit.id) ? '' : ' ttrpg-hit-log__entry--new'}`}>
                                <span className={`ttrpg-hit-log__amount ttrpg-hit-log__amount--${hit.kind}`} title={hit.kind === 'attack' ? 'Damage' : 'Heal'}>
                                    <FontAwesomeIcon icon={hit.kind === 'attack' ? faBurst : faHeart} />
                                    {hit.amount}
                                </span>
                                <span className="ttrpg-row__main ttrpg-row__text">
                                    <span className="ttrpg-hit-log__targets">
                                        {hit.targets.map((target, index) => (
                                            <span key={index} className="ttrpg-hit-log__target ttrpg-initiative__name" style={inColour(target.color)}>
                                                {target.name}
                                                {target.died && <FontAwesomeIcon icon={faSkull} title="Killed" />}
                                            </span>
                                        ))}
                                    </span>
                                    <span className="ttrpg-row__detail">
                                        by{' '}
                                        <span className="ttrpg-initiative__name" style={hit.color ? inColour(hit.color) : undefined}>
                                            {hit.by}
                                        </span>
                                    </span>
                                </span>
                                {index === 0 && (
                                    <button
                                        type="button"
                                        className="ttrpg-hit-log__undo"
                                        title="Take this hit back, for a mistyped number"
                                        disabled={undoing}
                                        onClick={() =>
                                        {
                                            setUndoing(true);
                                            void onUndo(hit.id).finally(() => setTimeout(() => setUndoing(false), foldMs));
                                        }}
                                    >
                                        <FontAwesomeIcon icon={faRotateLeft} />
                                        Undo
                                    </button>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            </div>

            <div className="ttrpg-popover__body">
                <div className="ttrpg-popover__foot">
                    <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => change(null)}>
                        <FontAwesomeIcon icon={faStop} />
                        End
                    </button>
                    {fight.begun ? (
                        <button type="button" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" onClick={() => change(nextTurn(fight, alive))}>
                            <FontAwesomeIcon icon={faForwardStep} />
                            Next turn
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm"
                            disabled={ordered.length === 0}
                            onClick={() => change(begun(fight, alive))}
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
