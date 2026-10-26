import { faEye, faGear } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type CSSProperties, type ReactNode } from 'react';

import { LookSettings } from './LookSettings';
import { Popover } from './Popover';
import { largestScale, smallestScale, type ScreenSettings } from './useScreenSettings';

/** How long player view waits without the mouse before it hides its controls. */
const hideChoices = [
    { after: 3000, label: '3 s' },
    { after: 10000, label: '10 s' },
    { after: 30000, label: '30 s' },
    { after: 0, label: 'Never' },
];

/** Every shortcut, by where it works. A key cap per key, "or" between two that do the same. */
const shortcuts: { title: string; keys: [string, string][] }[] = [
    {
        title: 'Edit tools',
        keys: [
            ['V or Space', 'Move around'],
            ['B', 'Select'],
            ['W', 'Walls and doors'],
            ['E', 'Erase'],
            ['P', 'Props'],
            ['M', 'Monsters'],
            ['S', 'Spawn point'],
            ['G', 'Grid'],
            ['Ctrl+Z', 'Undo'],
            ['Ctrl+Y', 'Redo'],
        ],
    },
    {
        title: 'Placing',
        keys: [
            ['Alt', 'Hold for no snapping'],
            ['Esc', 'Stop drawing or placing'],
            ['Del', 'Remove the picked prop'],
        ],
    },
    {
        title: 'Map',
        keys: [
            ['Wheel', 'Zoom'],
            ['Middle drag', 'Pan with any tool'],
            ['Right click', 'Cancel or drop the tool'],
        ],
    },
    {
        title: 'GM view',
        keys: [
            ['Long press', 'Ping a spot for everyone'],
            ['Enter', 'Move along the path'],
            ['Esc', 'Cancel the path'],
            ['Alt', 'Drag a monster freely'],
        ],
    },
];

/** On a phone: what a finger does on the map, in place of the keys. */
const gestures: { title: string; keys: [string, string][] }[] = [
    {
        title: 'On the map',
        keys: [
            ['Drag token', 'Draw your path'],
            ['Drag', 'Look around'],
            ['Pinch', 'Zoom'],
            ['Long press', 'Ping a spot for everyone'],
        ],
    },
];

interface SettingsProps
{
    settings: ScreenSettings;
    onChange: (settings: ScreenSettings) => void;
    /** On a player's phone: no controls to hide, and gestures rather than keys. */
    phone?: boolean;
    /** Settings of the page's own, above the screen's, like a player's picture. */
    children?: ReactNode;
    /** The game master's settings for every screen at the table, in a tab beside this screen's. */
    table?: ReactNode;
    /** The bar the gear is on has faded out, see useIdle: the panel steps aside with it. */
    hidden?: boolean;
}

/**
 * The gear beside the modes: this screen's settings, see useScreenSettings.ts, and every shortcut,
 * or on a phone every gesture. With table, a Table tab beside them for the whole table.
 */
export function Settings({ settings, onChange, phone = false, children, table, hidden = false }: SettingsProps)
{
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'editor' | 'table'>('editor');
    const set = (change: Partial<ScreenSettings>) => onChange({ ...settings, ...change });
    // The size while the slider is held. It only zooms once let go, or the slider would grow
    // and shrink under the pointer.
    const [draft, setDraft] = useState<number | null>(null);
    const shown = draft ?? settings.scale;
    const settle = () =>
    {
        if (draft !== null)
            set({ scale: draft });

        setDraft(null);
    };

    return (
        <>
            <button
                type="button"
                className="ttrpg-segment"
                aria-label="Settings and shortcuts"
                aria-pressed={open}
                aria-expanded={open}
                title="Settings and shortcuts"
                onClick={() => setOpen((shown) => !shown)}
            >
                <FontAwesomeIcon icon={faGear} />
            </button>

            {open && !hidden && (
                <Popover title="Settings" className={phone ? 'ttrpg-dock-panel' : 'ttrpg-start'} dismissOnOutside closeButton={false} onClose={() => setOpen(false)}>
                    <div className="ttrpg-popover__body ttrpg-settings">
                        {table && (
                            <div className="ttrpg-settings__choices" role="tablist" aria-label="Settings for">
                                <button
                                    type="button"
                                    role="tab"
                                    className="ttrpg-segment"
                                    aria-selected={tab === 'editor'}
                                    title="This screen: control size and shortcuts"
                                    onClick={() => setTab('editor')}
                                >
                                    Editor
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    className="ttrpg-segment"
                                    aria-selected={tab === 'table'}
                                    title="Every screen at the table, phones too"
                                    onClick={() => setTab('table')}
                                >
                                    Table
                                </button>
                            </div>
                        )}
                        {table && tab === 'table' && table}
                        {(!table || tab === 'editor') && (
                            <>
                                {children}
                                <LookSettings />
                                <section className="ttrpg-shortcuts" aria-label="Control size" title="How big the controls are on this screen">
                                    <h3 className="ttrpg-subhead">Control size</h3>
                                    <div className="ttrpg-settings__line">
                                        <input
                                            type="range"
                                            aria-label="Control size"
                                            min={smallestScale}
                                            max={largestScale}
                                            step={0.05}
                                            value={shown}
                                            style={{ '--fill': `${((shown - smallestScale) / (largestScale - smallestScale)) * 100}%` } as CSSProperties}
                                            onChange={(event) => setDraft(event.target.valueAsNumber)}
                                            onPointerUp={settle}
                                            onKeyUp={settle}
                                            onBlur={settle}
                                        />
                                        <span className="ttrpg-settings__value">{`${Math.round(shown * 100)}%`}</span>
                                    </div>
                                </section>
                                {!phone && (
                                    <section className="ttrpg-shortcuts" aria-label="Hide controls after" title="In player view, after this long without the mouse">
                                        <h3 className="ttrpg-subhead">Hide controls after</h3>
                                        <div className="ttrpg-settings__choices">
                                            {hideChoices.map((choice) => (
                                                <button
                                                    key={choice.after}
                                                    type="button"
                                                    className="ttrpg-segment"
                                                    aria-pressed={settings.hideAfter === choice.after}
                                                    onClick={() => set({ hideAfter: choice.after })}
                                                >
                                                    {choice.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                )}
                                {(phone ? gestures : shortcuts).map((group) => (
                                    <section key={group.title} className="ttrpg-shortcuts" aria-label={group.title}>
                                        <h3 className="ttrpg-subhead">{group.title}</h3>
                                        <dl>
                                            {group.keys.map(([keys, what]) => (
                                                <div key={what}>
                                                    <dt>
                                                        {keys.split(' or ').map((key) => <kbd key={key}>{key}</kbd>)}
                                                    </dt>
                                                    <dd>{what}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </section>
                                ))}
                                <div className="ttrpg-subhead ttrpg-subhead--row">
                                    <h3>Frame rate</h3>
                                    <button
                                        type="button"
                                        className="ttrpg-icon-button ttrpg-icon-button--small"
                                        aria-pressed={settings.frameRate}
                                        aria-label="Show the frame rate"
                                        title={settings.frameRate ? 'Hide the frame rate' : 'Show the frame rate, for checking a screen'}
                                        onClick={() => set({ frameRate: !settings.frameRate })}
                                    >
                                        <FontAwesomeIcon icon={faEye} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </Popover>
            )}
        </>
    );
}
