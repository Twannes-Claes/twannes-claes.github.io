import { faEyeDropper } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { ringColours } from '../map/colours';


interface RingPickerProps
{
    value: string;
    onChange: (color: string) => void;
    /** What it picks a colour for, for screen readers. */
    label?: string;
    /** The swatches offered, ringColours unless given. */
    colours?: string[];
}

/** A ring colour, or a pen's: one of the swatches, or any other from the last one. */
export function RingPicker({ value, onChange, label = 'Ring colour', colours = ringColours }: RingPickerProps)
{
    const custom = !colours.includes(value);

    return (
        <div className="ttrpg-rings" role="radiogroup" aria-label={label}>
            {colours.map((color) => (
                <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={value === color}
                    aria-label={color}
                    className="ttrpg-ring"
                    style={{ background: color }}
                    onClick={() => onChange(color)}
                />
            ))}
            <label className={`ttrpg-ring ttrpg-ring--custom${custom ? ' ttrpg-ring--picked' : ''}`} title="Any colour" style={custom ? { background: value } : undefined}>
                <FontAwesomeIcon icon={faEyeDropper} />
                <input type="color" className="ttrpg-hidden-input" aria-label="Any colour" value={value} onChange={(event) => onChange(event.target.value)} />
            </label>
        </div>
    );
}
