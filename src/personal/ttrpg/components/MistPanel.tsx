import { faCircle, faDrawPolygon } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { mistColors, type MistLook } from '../map/fog';

import { Slider } from './FogPanel';
import { RingPicker } from './RingPicker';

interface MistPanelProps
{
    /** A circle dragged out from the middle, or a polygon clicked corner by corner. */
    circle: boolean;
    onCircle: (circle: boolean) => void;
    look: MistLook;
    onLook: (look: MistLook) => void;
}

/**
 * The mist tool's settings: its shape, drawn like Reveal's, and the colour and density of the
 * next area, a swatch or any colour. The eraser takes an area away again.
 */
export function MistPanel({ circle, onCircle, look, onLook }: MistPanelProps)
{
    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings" aria-label="Mist">
            <h2>Mist</h2>

            <div className="ttrpg-settings__choices">
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={!circle}
                    title="Click the corners, then the first one again"
                    onClick={() => onCircle(false)}
                >
                    <FontAwesomeIcon icon={faDrawPolygon} />
                    Polygon
                </button>
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={circle}
                    title="Drag from the middle out. Walls stop it."
                    onClick={() => onCircle(true)}
                >
                    <FontAwesomeIcon icon={faCircle} />
                    Circle
                </button>
            </div>

            <div className="ttrpg-settings__group" role="group" aria-label="Colour">
                Colour
                <RingPicker value={look.color} onChange={(color) => onLook({ ...look, color })} label="Mist colour" colours={mistColors} />
            </div>

            <Slider
                name="Density"
                hint="How thick the next area is, from a faint haze to hiding the map"
                shown={`${Math.round(look.density * 100)}%`}
                value={look.density}
                min={0.2}
                max={1}
                step={0.05}
                onChange={(density) => onLook({ ...look, density })}
            />

            {!circle && (
                <ul className="ttrpg-keys" aria-label="Keys">
                    <li>
                        <kbd>Shift</kbd> Straight lines
                    </li>
                    <li>
                        <kbd>Esc</kbd> Drop the shape
                    </li>
                </ul>
            )}
        </section>
    );
}
