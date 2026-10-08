import { faClockRotateLeft, faCloud } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { FogSettings } from '../types';

import { defaultFogSettings } from '../map/fog';

import { Popover } from './Popover';

interface FogPanelProps
{
    settings: FogSettings;
    /** Every step of a slider, so the map shows it at once. */
    onChange: (settings: FogSettings) => void;
    /** When a slider is let go: saved, and sent to every screen. */
    onCommit: () => void;
    /** Back to the default look. */
    onReset: () => void;
    /** Covers the map again, as if nobody has seen it. */
    onResetFog: () => void;
    onClose: () => void;
}

/** One slider of the panel, a row with its name, its value beside it, and what it does on hover. */
function Slider({
    name,
    hint,
    shown,
    value,
    min,
    max,
    step,
    onChange,
}: {
    name: string;
    hint: string;
    shown: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
})
{
    return (
        <label title={hint}>
            {name}
            <span className="ttrpg-settings__line">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => onChange(event.target.valueAsNumber)}
                />
                <span className="ttrpg-settings__value">{shown}</span>
            </span>
        </label>
    );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const fields = Object.keys(defaultFogSettings) as (keyof FogSettings)[];

const defaultLook = `Clears in ${(defaultFogSettings.fade / 1000).toFixed(1)} s, softness ${percent(defaultFogSettings.softness)}, seen rooms ${percent(defaultFogSettings.memory)}, far haze ${percent(defaultFogSettings.haze)}, smoke ${percent(defaultFogSettings.smoke)}.`;

/**
 * How the fog looks, and resetting what the party has seen, opened from the play dock. Moving a
 * slider shows on this screen at once, letting go saves it for the session, so the phones and
 * every reload look the same.
 */
export function FogPanel({ settings, onChange, onCommit, onReset, onResetFog, onClose }: FogPanelProps)
{
    const set = (change: Partial<FogSettings>) => onChange({ ...settings, ...change });

    return (
        <Popover title="Fog" className="ttrpg-dock-panel" onClose={onClose}>
            <div className="ttrpg-popover__body ttrpg-settings" onPointerUp={onCommit} onKeyUp={onCommit}>
                <Slider
                    name="Clears in"
                    hint="How fast the fog clears or closes in. 0 is instant."
                    shown={`${(settings.fade / 1000).toFixed(1)} s`}
                    value={settings.fade}
                    min={0}
                    max={2000}
                    step={50}
                    onChange={(fade) => set({ fade })}
                />
                <Slider
                    name="Softness"
                    hint="How soft the edges of sight are. Walls stay crisp."
                    shown={percent(settings.softness)}
                    value={settings.softness}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(softness) => set({ softness })}
                />
                <Slider
                    name="Seen rooms"
                    hint="How much of a room seen before still shows."
                    shown={percent(settings.memory)}
                    value={settings.memory}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(memory) => set({ memory })}
                />
                <Slider
                    name="Far haze"
                    hint="Fog far from the players, even where they can see."
                    shown={percent(settings.haze)}
                    value={settings.haze}
                    min={0}
                    max={0.8}
                    step={0.05}
                    onChange={(haze) => set({ haze })}
                />
                <Slider
                    name="Smoke"
                    hint="Smoke over the unseen and remembered map."
                    shown={percent(settings.smoke)}
                    value={settings.smoke}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(smoke) => set({ smoke })}
                />
            </div>
            <div className="ttrpg-settings__actions">
                <button
                    type="button"
                    className="ttrpg-segment ttrpg-segment--block"
                    title={defaultLook}
                    disabled={fields.every((field) => settings[field] === defaultFogSettings[field])}
                    onClick={onReset}
                >
                    <FontAwesomeIcon icon={faClockRotateLeft} />
                    Default look
                </button>
                <button
                    type="button"
                    className="ttrpg-segment ttrpg-segment--block"
                    title="Cover the map again, as if nobody has seen it"
                    onClick={onResetFog}
                >
                    <FontAwesomeIcon icon={faCloud} />
                    Reset fog
                </button>
            </div>
        </Popover>
    );
}
