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
    onReset: () => void;
    onClose: () => void;
}

/** One slider of the panel, with its value written beside its name and what it does on hover. */
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
        <label className="ttrpg-slider" title={hint}>
            <span>{name}</span>
            <span className="ttrpg-slider__value">{shown}</span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(event.target.valueAsNumber)}
            />
        </label>
    );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const fields = Object.keys(defaultFogSettings) as (keyof FogSettings)[];

const defaultLook = `Clears in ${(defaultFogSettings.fade / 1000).toFixed(1)} s, softness ${percent(defaultFogSettings.softness)}, seen rooms ${percent(defaultFogSettings.memory)}, far haze ${percent(defaultFogSettings.haze)}, smoke ${percent(defaultFogSettings.smoke)}.`;

/**
 * How the fog looks, opened from the play dock. Moving a slider shows on this screen at once,
 * letting go saves it for the session, so the phones and every reload look the same.
 */
export function FogPanel({ settings, onChange, onCommit, onReset, onClose }: FogPanelProps)
{
    const set = (change: Partial<FogSettings>) => onChange({ ...settings, ...change });

    return (
        <Popover title="Fog" className="ttrpg-dock-panel" onClose={onClose}>
            <div className="ttrpg-popover__body" onPointerUp={onCommit} onKeyUp={onCommit}>
                <Slider
                    name="Clears in"
                    hint="How long the fog takes to clear or close in when what the players see changes, and how long tokens take to fade in and out. Longer feels like fog drifting away; 0 is instant."
                    shown={`${(settings.fade / 1000).toFixed(1)} s`}
                    value={settings.fade}
                    min={0}
                    max={2000}
                    step={50}
                    onChange={(fade) => set({ fade })}
                />
                <Slider
                    name="Softness"
                    hint="How soft the edges of sight and shadows are. Shadows cast past a corner fade over a wider stretch; walls always stay crisp. 0% is fully sharp."
                    shown={percent(settings.softness)}
                    value={settings.softness}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(softness) => set({ softness })}
                />
                <Slider
                    name="Seen rooms"
                    hint="How much of a room seen before still shows once nobody can see it now. Lower keeps explored rooms darker, higher shows more of the map."
                    shown={percent(settings.memory)}
                    value={settings.memory}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(memory) => set({ memory })}
                />
                <Slider
                    name="Far haze"
                    hint="How much fog lingers far from the players, even where they can see. 0% is crystal clear to the walls."
                    shown={percent(settings.haze)}
                    value={settings.haze}
                    min={0}
                    max={0.8}
                    step={0.05}
                    onChange={(haze) => set({ haze })}
                />
                <Slider
                    name="Smoke"
                    hint="How thick the drifting smoke over the unseen and remembered parts of the map is. 0% is a plain dark shadow."
                    shown={percent(settings.smoke)}
                    value={settings.smoke}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(smoke) => set({ smoke })}
                />
            </div>
            <button
                type="button"
                className="ttrpg-segment ttrpg-segment--block"
                title={defaultLook}
                disabled={fields.every((field) => settings[field] === defaultFogSettings[field])}
                onClick={onReset}
            >
                Back to the default look
            </button>
        </Popover>
    );
}
