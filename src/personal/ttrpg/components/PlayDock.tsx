import {
    faCloud,
    faCompress,
    faDragon,
    faEye,
    faEyeSlash,
    faExpand,
    faCircle,
    faObjectGroup,
    faRulerHorizontal,
    faSnowflake,
    faSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';

import type { Scenario } from '../types';

import { typing } from './useKeys';
import { useFullscreen } from './useScreen';

/** What a press on the map does in play mode, besides drawing paths and dragging monsters. */
export type PlayTool = 'open-doors' | 'measure' | 'reveal' | 'reveal-circle' | 'hide' | 'hide-circle';

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
    onPeek: (peek: boolean) => void;
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
 * The game master's controls in play mode, at the bottom: the map, the ruler, Reveal area, Peek,
 * Freeze, the fog and full screen. Peek works while held, the button or the space bar, so the fog
 * never stays open on the table screen by accident. Ruler and Reveal toggle, and pressing the
 * one that is on goes back to opening doors with a click. While Reveal is on, a pop-out above it
 * picks uncover or hide, and a box or a circle, for a torch thrown or a spell of light.
 */
export function PlayDock({
    tool,
    onTool,
    frozen,
    onFreeze,
    onPeek,
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

    useEffect(() =>
    {
        const held = (peek: boolean) => (event: KeyboardEvent) =>
        {
            if (event.key !== ' ' || event.repeat || typing(event))
                return;

            event.preventDefault();
            onPeek(peek);
        };

        const press = held(true);
        const release = held(false);

        window.addEventListener('keydown', press);
        window.addEventListener('keyup', release);

        return () =>
        {
            window.removeEventListener('keydown', press);
            window.removeEventListener('keyup', release);
            onPeek(false);
        };
    }, [onPeek]);

    const pick = (next: PlayTool) => onTool(tool === next ? 'open-doors' : next);
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
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={tool === 'measure'}
                    title="Drag to measure a distance"
                    onClick={() => pick('measure')}
                >
                    <FontAwesomeIcon icon={faRulerHorizontal} />
                    Ruler
                </button>
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
                <button
                    type="button"
                    className="ttrpg-segment"
                    title="Hold to see through the fog (Space)"
                    onPointerDown={() => onPeek(true)}
                    onPointerUp={() => onPeek(false)}
                    onPointerLeave={() => onPeek(false)}
                    onPointerCancel={() => onPeek(false)}
                >
                    <FontAwesomeIcon icon={faEye} />
                    Peek
                </button>
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
