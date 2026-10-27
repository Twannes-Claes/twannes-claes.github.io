import { faDiceD20, faDiceD6, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type DiceBox from '@3d-dice/dice-box-threejs';

import type { DiceAsk, DiceRoll, GameSystem } from '../types';

import { diceIcons } from '../content/diceIcons';
import { diceName, diceSides, maxDice } from '../map/dice';
import { lift } from '../map/colours';
import { colourSet, loadDiceBox, notationOf, scaleOf } from '../services/diceBox';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';

import { Spinner } from './Feedback';
import { Popover } from './Popover';
import { useLook } from './useLook';

interface DicePanelProps
{
    /** The session's last rolls, newest first. */
    rolls: DiceRoll[];
    /** Rolls on the server. Fails with the message to show. */
    onRoll: (ask: DiceAsk) => Promise<void>;
    /** Advantage and disadvantage are offered in D&D 5e only. */
    system: GameSystem;
    /** The GM, who can roll hidden. */
    host?: boolean;
    /** On a phone a press beside it closes it, like the settings. */
    phone?: boolean;
    onClose: () => void;
}

const threeDKey = 'ttrpg-dice-3d';

/** Whether this screen shows the dice in 3D, kept in its browser like the screen settings. */
function readThreeD(): boolean
{
    try
    {
        return localStorage.getItem(threeDKey) !== 'false';
    }
    catch
    {
        // Blocked storage, or no window while the page is prerendered.
        return true;
    }
}

/** A die's icon from the set, in the colour of the text around it. */
function DieIcon({ sides }: { sides: number })
{
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            {/* The d100 has its number cut out like the set's own dice. */}
            {sides === 100 && (
                <mask id="ttrpg-d100">
                    <rect width="24" height="24" fill="white" />
                    <text x="12" y="14.7" textAnchor="middle" fontSize="7.6" fontWeight="900" letterSpacing="-0.5" fill="black">
                        100
                    </text>
                </mask>
            )}
            <path fill="currentColor" mask={sides === 100 ? 'url(#ttrpg-d100)' : undefined} d={diceIcons[sides]} />
        </svg>
    );
}

/** A flat die's number, flicking through random faces while it tumbles, then settling on its own. */
function Face({ value, sides, delay, still }: { value: number; sides: number; delay: number; still: boolean })
{
    const [shown, setShown] = useState(still ? value : 0);
    const landed = shown === value;

    useEffect(() =>
    {
        if (still)
            return;

        const flick = setInterval(() => setShown(Math.ceil(Math.random() * sides)), 70);
        const land = setTimeout(() =>
        {
            clearInterval(flick);
            setShown(value);
        }, delay);

        return () =>
        {
            clearInterval(flick);
            clearTimeout(land);
        };
    }, [value, sides, delay, still]);

    // Keyed on landing, so the settled number pops in.
    return (
        <span key={String(landed)} className={`ttrpg-dice__face${landed ? ' ttrpg-dice__face--landed' : ''}`}>
            {shown || ''}
        </span>
    );
}

/** What is added to a roll, like +3, in the accent colour. */
function Extra({ modifier }: { modifier: number })
{
    return <span className="ttrpg-chip ttrpg-dice__extra">{modifier > 0 ? `+${modifier}` : `−${-modifier}`}</span>;
}

/** The dice and what is added, like 12 +3, over the total. */
function Total({ roll, delay }: { roll: DiceRoll; delay: number })
{
    return (
        <span className="ttrpg-dice__total" style={{ animationDelay: `${delay}ms` }}>
            {roll.modifier !== 0 && (
                <span className="ttrpg-dice__sum">
                    <span className="ttrpg-chip">{roll.total - roll.modifier}</span>
                    <Extra modifier={roll.modifier} />
                </span>
            )}
            <strong>{roll.total}</strong>
        </span>
    );
}

/** Somewhere between the two. */
function between(low: number, high: number)
{
    return low + Math.random() * (high - low);
}

/** A die's own throw, so no two land alike: where it comes from, how it tumbles and bounces, how fast, and where and at what slant it rests. */
function throwOf(index: number)
{
    const axis = Math.random() * 2 * Math.PI;

    return {
        delay: index * 130 + between(0, 120),
        ms: between(1150, 1600),
        x: between(-0.8, 0.8),
        y: between(-1, -0.3),
        spin: (Math.random() < 0.5 ? -1 : 1) * between(120, 320),
        // Tumbling over on an axis across the tray, whole turns, so it comes back face up.
        ax: Math.cos(axis),
        ay: Math.sin(axis),
        turn: (Math.random() < 0.5 ? 1 : 1.5) * 360,
        hop: between(0.4, 1),
        tilt: between(-15, 15),
        // Off the line a little sideways, all at the same height.
        dx: between(-0.15, 0.15),
    };
}

/**
 * The newest roll as flat dice tumbling into a tray, each landing on its number, then the total.
 * Keyed on the roll, so every new one on any phone plays it again.
 */
function Tray({ roll, color, still }: { roll: DiceRoll; color: string; still: boolean })
{
    const [throws] = useState(() => roll.dice.map((_, index) => throwOf(index)));
    // With an edge, the die not kept lands faded.
    const kept = roll.edge ? roll.dice.indexOf((roll.edge === 'advantage' ? Math.max : Math.min)(...roll.dice)) : -1;
    const done = Math.max(...throws.map(({ delay, ms }) => delay + ms));

    return (
        <div className={`ttrpg-dice__tray${still ? ' ttrpg-dice__tray--still' : ''}`} aria-live="polite" aria-label={`${roll.name} rolled ${diceName(roll)}: ${roll.total}`}>
            <span className="ttrpg-dice__dice" style={{ '--columns': Math.min(roll.dice.length, 5) } as CSSProperties}>
                {roll.dice.map((value, index) =>
                {
                    const { delay, ms, x, y, spin, ax, ay, turn, hop, tilt, dx } = throws[index];
                    const style = {
                        animationDelay: `${delay}ms`,
                        animationDuration: `${ms}ms`,
                        color,
                        '--x': `${x}rem`,
                        '--y': `${y}rem`,
                        '--spin': `${spin}deg`,
                        '--hop': `${hop}rem`,
                        '--tilt': `${tilt}deg`,
                        '--ax': ax,
                        '--ay': ay,
                        '--turn': `${turn}deg`,
                        '--dx': `${dx}rem`,
                    };

                    return (
                        <span key={index} className={`ttrpg-dice__die${kept >= 0 && kept !== index ? ' ttrpg-dice__die--dropped' : ''}`} style={style as CSSProperties}>
                            <FontAwesomeIcon icon={roll.sides === 6 ? faDiceD6 : faDiceD20} />
                            <Face value={value} sides={roll.sides} delay={delay + ms * 0.85} still={still} />
                        </span>
                    );
                })}
            </span>
            <Total roll={roll} delay={done + 100} />
        </div>
    );
}

/**
 * The newest roll as real dice thrown into the tray, with physics, landing on the numbers the
 * server rolled, see services/diceBox.ts. One WebGL scene while the panel is open, rolling each new
 * roll again. Without WebGL, or if the library does not load, the flat tray instead. The dice's
 * size, by how many there are, takes a new scene to change, see where it is keyed. A new colour,
 * like the GM picking another accent, is for the next throw.
 */
function Tray3D({ roll, color, scale }: { roll: DiceRoll; color: string; scale: number })
{
    const [box, setBox] = useState<DiceBox | null>(null);
    const [landed, setLanded] = useState('');
    const [failed, setFailed] = useState(false);
    // The library takes one thing at a time, so a colour and a throw wait their turn.
    const queue = useRef(Promise.resolve());
    const notation = notationOf(roll);

    useEffect(() =>
    {
        let alive = true;
        let made: DiceBox | null = null;

        loadDiceBox()
            .then(async ({ default: Box }) =>
            {
                if (!alive)
                    return;

                // Physics steps twice a frame for smoother motion, thrown softer so a die rarely
                // ends up leaning on the tray's wall.
                made = new Box('#ttrpg-dice-box', { sounds: false, shadows: true, framerate: 1 / 120, strength: 0.7, light_intensity: 0.9, baseScale: scale, gravity_multiplier: 500 });
                await made.initialize();
                // The library draws at the page's size, blurry on a sharp screen without this.
                made.renderer.setPixelRatio(window.devicePixelRatio);

                if (alive)
                    setBox(made);

            })
            .catch(() => alive && setFailed(true));

        return () =>
        {
            alive = false;
            made?.renderer.dispose();
            made?.renderer.forceContextLoss();
        };
    }, [scale]);

    useEffect(() =>
    {
        if (!box)
            return;

        queue.current = queue.current
            .then(() => box.updateConfig({ theme_customColorset: colourSet(color) }))
            .catch(() => setFailed(true));
    }, [box, color]);

    useEffect(() =>
    {
        if (!box)
            return;

        queue.current = queue.current
            .then(() => box.roll(notation))
            .then(() => setLanded(roll.id), () => setFailed(true));
    }, [box, notation, roll.id]);

    if (failed)
        return <Tray roll={roll} color={color} still={false} />;

    return (
        <div className="ttrpg-dice__tray ttrpg-dice__tray--3d" aria-live="polite" aria-label={`${roll.name} rolled ${diceName(roll)}: ${roll.total}`}>
            <div id="ttrpg-dice-box" className="ttrpg-dice__box" />
            {landed === roll.id && <Total roll={roll} delay={0} />}
        </div>
    );
}

/**
 * The dice roller above the dock or the phone's buttons: pick a die, how many and what to add,
 * roll, and everyone at the table sees it in the log. The server rolls, see convex/dice.ts.
 */
export function DicePanel({ rolls, onRoll, system, host = false, phone = false, onClose }: DicePanelProps)
{
    const [sides, setSides] = useState(20);
    const [count, setCount] = useState(1);
    const [modifier, setModifier] = useState(0);
    const [edge, setEdge] = useState<DiceAsk['edge']>();
    const [hidden, setHidden] = useState(false);
    const [failure, setFailure] = useState('');
    const [busy, setBusy] = useState(false);
    const [threeD, setThreeD] = useState(readThreeD);
    // Without motion the flat tray, which then shows the dice as they landed.
    const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
    // The last roll when the tray emptied, on opening or a switch of look. It shows only later ones.
    const [seen, setSeen] = useState<string | undefined>(rolls[0]?.id);
    const fresh = rolls[0] && rolls[0].id !== seen ? rolls[0] : undefined;
    const thrown = threeD && !calm;
    // The GM's dice in the accent lifted, like their marks on the map, following a new pick.
    const gm = lift(useLook().accent);
    const edges = system === '5e' && sides === 20 && count === 1;
    const ask: DiceAsk = { sides, count, modifier, edge: edges ? edge : undefined, hidden: host && hidden };

    const roll = (event: FormEvent) =>
    {
        event.preventDefault();
        setBusy(true);
        setFailure('');
        onRoll(ask)
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() => setBusy(false));
    };

    const toggleThreeD = () =>
    {
        setThreeD(!threeD);
        setSeen(rolls[0]?.id);

        try
        {
            localStorage.setItem(threeDKey, String(!threeD));
        }
        catch
        {
            // Blocked storage: the choice holds until the panel closes.
        }
    };

    return (
        <Popover title="Dice" className="ttrpg-dock-panel" dismissOnOutside={phone} onClose={onClose}>
            <form className="ttrpg-popover__body ttrpg-check-form" onSubmit={roll}>
                <div className="ttrpg-dice__pick" role="group" aria-label="Die">
                    {diceSides.map((die) => (
                        <button key={die} type="button" className="ttrpg-dice__tile" aria-pressed={sides === die} aria-label={`d${die}`} onClick={() => setSides(die)}>
                            <DieIcon sides={die} />
                            <span className="ttrpg-dice__sides">d{die}</span>
                        </button>
                    ))}
                </div>
                <div className="ttrpg-dice__numbers">
                    <label className="ttrpg-field">
                        How many
                        <input type="number" inputMode="numeric" min={1} max={maxDice} value={count} onChange={(event) => setCount(Math.min(maxDice, Math.max(1, Math.round(Number(event.target.value)) || 1)))} />
                    </label>
                    <label className="ttrpg-field">
                        Add
                        <input type="number" inputMode="numeric" min={-99} max={99} value={modifier} onChange={(event) => setModifier(Math.min(99, Math.max(-99, Math.round(Number(event.target.value)) || 0)))} />
                    </label>
                </div>
                <div className="ttrpg-picks">
                    <button type="button" className="ttrpg-pick ttrpg-die" aria-pressed={threeD} title="Show the dice in 3D" onClick={toggleThreeD}>
                        3D
                    </button>
                    {edges && (
                        <>
                            <button type="button" className="ttrpg-pick ttrpg-die" aria-pressed={edge === 'advantage'} onClick={() => setEdge(edge === 'advantage' ? undefined : 'advantage')}>
                                Advantage
                            </button>
                            <button type="button" className="ttrpg-pick ttrpg-die" aria-pressed={edge === 'disadvantage'} onClick={() => setEdge(edge === 'disadvantage' ? undefined : 'disadvantage')}>
                                Disadvantage
                            </button>
                        </>
                    )}
                    {host && (
                        <button type="button" className="ttrpg-pick ttrpg-die" aria-pressed={hidden} title="Only you see this roll" onClick={() => setHidden(!hidden)}>
                            <FontAwesomeIcon icon={faEyeSlash} />
                            Hidden
                        </button>
                    )}
                </div>
                {failure && (
                    <p className="ttrpg-error" role="alert">
                        {failure}
                    </p>
                )}
                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={busy}>
                    {busy ? <Spinner /> : <FontAwesomeIcon icon={faDiceD20} />}
                    Roll {diceName(ask)}
                </button>
            </form>

            {/* Empty in the look picked until a new roll, then that one thrown, in 3D in a new
                scene when the dice's size changes. */}
            {!fresh ? (
                <div className={`ttrpg-dice__tray${thrown ? ' ttrpg-dice__tray--3d' : ''}`} />
            ) : thrown ? (
                <Tray3D key={scaleOf(fresh)} roll={fresh} color={fresh.color ?? gm} scale={scaleOf(fresh)} />
            ) : (
                <Tray key={fresh.id} roll={fresh} color={fresh.color ?? gm} still={calm} />
            )}

            <div className="ttrpg-popover__scroll ttrpg-dice__log">
                {rolls.length === 0 && <p className="ttrpg-empty">No rolls yet.</p>}
                <ul className="ttrpg-rows">
                    {rolls.map((entry) => (
                        <li key={entry.id} className="ttrpg-row ttrpg-dice__roll">
                            <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                <span className="ttrpg-swatch" style={{ background: entry.color ?? gm }} />
                                <span className="ttrpg-row__text">
                                    <span className="ttrpg-row__name">
                                        {entry.name}
                                        {entry.hidden && ', hidden'}
                                    </span>
                                    <span className="ttrpg-row__detail ttrpg-dice__detail">
                                        <DieIcon sides={entry.sides} />
                                        <span className="ttrpg-dice__name">{`${entry.count > 1 ? entry.count : ''}d${entry.sides}`}</span>
                                        {entry.modifier !== 0 && <Extra modifier={entry.modifier} />}
                                        {entry.edge && <span className="ttrpg-chip">{entry.edge}</span>}
                                    </span>
                                </span>
                            </span>
                            <strong>{entry.total}</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </Popover>
    );
}
