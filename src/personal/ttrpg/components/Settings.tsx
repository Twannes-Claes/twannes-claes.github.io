import { faGear } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type CSSProperties } from 'react';

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
            ['W', 'Walls and doors'],
            ['E', 'Erase'],
            ['P', 'Props'],
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
        title: 'Player view',
        keys: [
            ['Space', 'Hold to see through fog'],
            ['Enter', 'Move along the path'],
            ['Esc', 'Cancel the path'],
            ['Alt', 'Drag a monster freely'],
        ],
    },
];

/**
 * The gear beside the modes: this screen's settings, see useScreenSettings.ts, and every shortcut.
 */
export function Settings({ settings, onChange }: { settings: ScreenSettings; onChange: (settings: ScreenSettings) => void })
{
    const [open, setOpen] = useState(false);
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
                aria-expanded={open}
                title="Settings and shortcuts"
                onClick={() => setOpen((shown) => !shown)}
            >
                <FontAwesomeIcon icon={faGear} />
            </button>

            {open && (
                <Popover title="Settings" className="ttrpg-start" dismissOnOutside closeButton={false} onClose={() => setOpen(false)}>
                    <div className="ttrpg-popover__body ttrpg-settings">
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
                        <section className="ttrpg-shortcuts" aria-label="Frame rate" title="Frames per second in the corner, for checking a screen">
                            <h3 className="ttrpg-subhead">Frame rate</h3>
                            <div className="ttrpg-settings__choices">
                                <button type="button" className="ttrpg-segment" aria-pressed={!settings.frameRate} onClick={() => set({ frameRate: false })}>
                                    Hidden
                                </button>
                                <button type="button" className="ttrpg-segment" aria-pressed={settings.frameRate} onClick={() => set({ frameRate: true })}>
                                    Shown
                                </button>
                            </div>
                        </section>
                        {shortcuts.map((group) => (
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
                    </div>
                </Popover>
            )}
        </>
    );
}
