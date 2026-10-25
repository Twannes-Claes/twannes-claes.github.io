import { faEraser, faPen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { CSSProperties } from 'react';

import type { Pen } from '../types';

import { penWidths } from '../map/drawings';

import { RingPicker } from './CharacterList';

/** What the draw tool does: draw a line, or erase lines, see map/drawings.ts. */
export type Sketch = 'draw' | 'rub-out';

interface DrawPickerProps
{
    /** The tool on now, the draw tool's or any other, which leaves it off. */
    tool: string;
    onSketch: (next: Sketch | null) => void;
    pen: Pen;
    onPen: (pen: Pen) => void;
    /** The colour a line gets with none picked: the player's ring colour or the GM's. */
    colour: string;
    /** Opens its pop-out to the right rather than centred, for a button in a screen's corner. */
    start?: boolean;
}

/**
 * Drawing on the map, for the game master and the players alike, beside the ruler and working
 * like it: pressing it turns it on to draw, and its pop-out picks drawing or erasing, see
 * RulerPicker.tsx. While drawing, it also picks the colour and how thick. Pressing it again puts
 * it away.
 */
export function DrawPicker({ tool, onSketch, pen, onPen, colour, start = false }: DrawPickerProps)
{
    const sketch = tool === 'draw' || tool === 'rub-out' ? tool : null;

    return (
        <span className="ttrpg-pop">
            <button
                type="button"
                className="ttrpg-segment"
                aria-pressed={sketch !== null}
                aria-expanded={sketch !== null}
                title="Draw lines on the map for everyone"
                onClick={() => onSketch(sketch ? null : 'draw')}
            >
                <FontAwesomeIcon icon={faPen} />
                Draw
            </button>
            {sketch && (
                <span className={`ttrpg-panel ttrpg-pop__menu${start ? ' ttrpg-pop__menu--start' : ''}`} role="group" aria-label="Draw">
                    <span className="ttrpg-pop__row">
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={sketch === 'draw'}
                            title="Drag to draw a line"
                            onClick={() => onSketch('draw')}
                        >
                            <FontAwesomeIcon icon={faPen} />
                            Pen
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={sketch === 'rub-out'}
                            title="Drag over a line to erase it"
                            onClick={() => onSketch('rub-out')}
                        >
                            <FontAwesomeIcon icon={faEraser} />
                            Eraser
                        </button>
                    </span>
                    {sketch === 'draw' && (
                        <>
                            <span className="ttrpg-pop__row">
                                <RingPicker value={pen.color ?? colour} onChange={(color) => onPen({ ...pen, color })} label="Pen colour" />
                            </span>
                            <label className="ttrpg-pop__row ttrpg-settings__line">
                                Thickness
                                <input
                                    type="range"
                                    min={penWidths.min}
                                    max={penWidths.max}
                                    step={1}
                                    value={pen.width}
                                    style={{ '--fill': `${((pen.width - penWidths.min) / (penWidths.max - penWidths.min)) * 100}%` } as CSSProperties}
                                    onChange={(event) => onPen({ ...pen, width: event.target.valueAsNumber })}
                                />
                            </label>
                        </>
                    )}
                </span>
            )}
        </span>
    );
}
