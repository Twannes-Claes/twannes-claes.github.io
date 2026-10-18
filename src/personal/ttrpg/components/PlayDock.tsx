import {
    faCloud,
    faCompress,
    faDragon,
    faEye,
    faEyeSlash,
    faExpand,
    faCircle,
    faObjectGroup,
    faSnowflake,
    faSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { Scenario } from '../types';

import { RulerPicker } from './RulerPicker';
import { useFullscreen } from './useScreen';

/** What a press on the map does in play mode, besides drawing paths and dragging monsters. */
export type PlayTool = 'open-doors' | 'measure' | 'area' | 'reveal' | 'reveal-circle' | 'hide' | 'hide-circle';

/** Reveal's tool for a choice in its pop-out: uncover or hide, with a box or a circle. */
function fogTool(hide: boolean, circle: boolean): PlayTool
{
    if (hide)
        return circle ? 'hide-circle' : 'hide';

    return circle ? 'reveal-circle' : 'reveal';
}

interface PlayDockProps
{
    tool: PlayTool;
    onTool: (tool: PlayTool) => void;
    frozen: boolean;
    onFreeze: () => void;
    /** The maps of the session, to switch between. Players follow, see PLAN.md. */
    scenarios: Scenario[];
    activeId: string;
    onScenario: (id: string) => void;
    /** Faded out after a while without the mouse, so the table screen shows only the map. */
    hidden: boolean;
    /** Opens or closes the monsters, see Monsters.tsx. Only while a saved session is live. */
    onMonsters?: () => void;
    monstersOpen?: boolean;
    /** Opens or closes the fog: how it looks, and resetting it, see FogPanel.tsx. */
    onFog: () => void;
    fogOpen: boolean;
}

/**
 * The game master's controls in the GM view, at the bottom: the map, the ruler, Reveal area,
 * Freeze, the fog and full screen. Ruler and Reveal toggle, and pressing the one that is on goes
 * back to opening doors with a click. While the ruler is on, a pop-out above it picks a line or a
 * circle, see RulerPicker.tsx. While Reveal is on, its pop-out picks uncover or hide, and a box or
 * a circle, for a torch thrown or a spell of light.
 */
export function PlayDock({
    tool,
    onTool,
    frozen,
    onFreeze,
    scenarios,
    activeId,
    onScenario,
    hidden,
    onMonsters,
    monstersOpen = false,
    onFog,
    fogOpen,
}: PlayDockProps)
{
    const { fullscreen, toggle } = useFullscreen();
    const hiding = tool === 'hide' || tool === 'hide-circle';
    const circle = tool === 'reveal-circle' || tool === 'hide-circle';
    const revealing = hiding || circle || tool === 'reveal';

    return (
        <div className={`ttrpg-panel ttrpg-dock${hidden ? ' ttrpg-hidden' : ''}`}>
            {scenarios.length > 1 && (
                <div className="ttrpg-dock__group">
                    <select
                        className="ttrpg-segment ttrpg-select"
                        aria-label="Map"
                        value={activeId}
                        onChange={(event) => onScenario(event.target.value)}
                    >
                        {scenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                                {scenario.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <div className="ttrpg-dock__group">
                <RulerPicker
                    measure={tool === 'measure' || tool === 'area' ? tool : null}
                    onMeasure={(next) => onTool(next ?? 'open-doors')}
                />
                <span className="ttrpg-pop">
                    <button
                        type="button"
                        className="ttrpg-segment"
                        aria-pressed={revealing}
                        aria-expanded={revealing}
                        title="Drag over the map to uncover it"
                        onClick={() => onTool(revealing ? 'open-doors' : 'reveal')}
                    >
                        <FontAwesomeIcon icon={faObjectGroup} />
                        Reveal
                    </button>
                    {revealing && (
                        <span className="ttrpg-panel ttrpg-pop__menu" role="group" aria-label="Reveal">
                            <span className="ttrpg-pop__row">
                                <button
                                    type="button"
                                    className="ttrpg-segment"
                                    aria-pressed={!hiding}
                                    title="What you drag over counts as seen"
                                    onClick={() => onTool(fogTool(false, circle))}
                                >
                                    <FontAwesomeIcon icon={faEye} />
                                    Uncover
                                </button>
                                <button
                                    type="button"
                                    className="ttrpg-segment ttrpg-segment--danger"
                                    aria-pressed={hiding}
                                    title="What you drag over is forgotten, unless a player sees it now"
                                    onClick={() => onTool(fogTool(true, circle))}
                                >
                                    <FontAwesomeIcon icon={faEyeSlash} />
                                    Hide
                                </button>
                            </span>
                            <span className="ttrpg-pop__row">
                                <button
                                    type="button"
                                    className="ttrpg-segment"
                                    aria-pressed={!circle}
                                    title="Drag a box"
                                    onClick={() => onTool(fogTool(hiding, false))}
                                >
                                    <FontAwesomeIcon icon={faSquare} />
                                    Box
                                </button>
                                <button
                                    type="button"
                                    className="ttrpg-segment"
                                    aria-pressed={circle}
                                    title={hiding ? 'Drag from the middle out' : 'Drag from where a light lands to how far it shines. Walls stop it.'}
                                    onClick={() => onTool(fogTool(hiding, true))}
                                >
                                    <FontAwesomeIcon icon={faCircle} />
                                    Circle
                                </button>
                            </span>
                        </span>
                    )}
                </span>
            </div>
            {onMonsters && (
                <div className="ttrpg-dock__group">
                    <button type="button" className="ttrpg-segment" aria-pressed={monstersOpen} aria-expanded={monstersOpen} title="Add, hide or remove monsters" onClick={onMonsters}>
                        <FontAwesomeIcon icon={faDragon} />
                        Monsters
                    </button>
                </div>
            )}
            <div className="ttrpg-dock__group">
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={frozen}
                    title={frozen ? 'Let the players move again' : 'Stop the players moving their tokens'}
                    onClick={onFreeze}
                >
                    <FontAwesomeIcon icon={faSnowflake} />
                    Freeze
                </button>
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={fogOpen}
                    aria-expanded={fogOpen}
                    aria-label="Fog"
                    title="Fog: how it looks, or reset it"
                    onClick={onFog}
                >
                    <FontAwesomeIcon icon={faCloud} />
                </button>
            </div>
            <div className="ttrpg-dock__group">
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
                    title={fullscreen ? 'Leave full screen' : 'Full screen'}
                    onClick={toggle}
                >
                    <FontAwesomeIcon icon={fullscreen ? faCompress : faExpand} />
                </button>
            </div>
        </div>
    );
}
