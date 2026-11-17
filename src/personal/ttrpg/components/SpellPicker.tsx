import { faBolt, faFire, faFlask, faSnowflake, faSun, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { CSSProperties } from 'react';

import type { Mark, SpellElement } from '../types';

const elements: { element: SpellElement; name: string; icon: IconDefinition }[] = [
    { element: 'fire', name: 'Fire', icon: faFire },
    { element: 'frost', name: 'Frost', icon: faSnowflake },
    { element: 'lightning', name: 'Lightning', icon: faBolt },
    { element: 'acid', name: 'Acid', icon: faFlask },
    { element: 'radiant', name: 'Radiant', icon: faSun },
];

interface SpellPickerProps
{
    /** The ruler or area just drawn, which the picker sits at the end of. */
    mark: Mark;
    onCast: (element: SpellElement) => void;
}

/**
 * The elements a ruler or area just drawn can play as a spell effect on every screen, see
 * map/spells.ts. On the map at the shape's far end, moving with it, like a note pin.
 */
export function SpellPicker({ mark, onCast }: SpellPickerProps)
{
    return (
        <div className="ttrpg-pin-at ttrpg-pin-at--open" style={{ '--x': mark.to.x, '--y': mark.to.y } as CSSProperties}>
            <div className="ttrpg-panel ttrpg-spells" role="group" aria-label="Spell effect">
                {elements.map(({ element, name, icon }) => (
                    <button key={element} type="button" className="ttrpg-segment" title={`Play ${name.toLowerCase()} here`} aria-label={name} onClick={() => onCast(element)}>
                        <FontAwesomeIcon icon={icon} />
                    </button>
                ))}
            </div>
        </div>
    );
}
