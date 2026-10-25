import { faCircle, faRulerHorizontal, faWifi } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** What the ruler measures: a line, or a circle or a cone for an area of effect, see map/tools.ts. */
export type Measure = 'measure' | 'area' | 'cone';

interface RulerPickerProps
{
    /** The tool on now, the ruler's or any other, which leaves the ruler off. */
    tool: string;
    onMeasure: (next: Measure | null) => void;
    /** Opens its pop-out to the right rather than centred, for a button in a screen's corner. */
    start?: boolean;
}

/**
 * The ruler, for the game master and the players alike. Pressing it turns it on with a line, and
 * while it is on a pop-out above it picks a line, a circle or a cone, like Reveal's, see
 * PlayDock.tsx. Pressing it again puts it away.
 */
export function RulerPicker({ tool, onMeasure, start = false }: RulerPickerProps)
{
    const measure = tool === 'measure' || tool === 'area' || tool === 'cone' ? tool : null;

    return (
        <span className="ttrpg-pop">
            <button
                type="button"
                className="ttrpg-segment"
                aria-pressed={measure !== null}
                aria-expanded={measure !== null}
                title="Drag to measure a distance or an area"
                onClick={() => onMeasure(measure ? null : 'measure')}
            >
                <FontAwesomeIcon icon={faRulerHorizontal} />
                Ruler
            </button>
            {measure && (
                <span className={`ttrpg-panel ttrpg-pop__menu${start ? ' ttrpg-pop__menu--start' : ''}`} role="group" aria-label="Ruler">
                    <span className="ttrpg-pop__row">
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={measure === 'measure'}
                            title="Drag from one spot to another"
                            onClick={() => onMeasure('measure')}
                        >
                            <FontAwesomeIcon icon={faRulerHorizontal} />
                            Line
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={measure === 'area'}
                            title="Drag from where a spell lands out to how far it reaches"
                            onClick={() => onMeasure('area')}
                        >
                            <FontAwesomeIcon icon={faCircle} />
                            Circle
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={measure === 'cone'}
                            title="Drag from where a cone starts the way it points, out to how far it reaches"
                            onClick={() => onMeasure('cone')}
                        >
                            <FontAwesomeIcon icon={faWifi} />
                            Cone
                        </button>
                    </span>
                </span>
            )}
        </span>
    );
}
