import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState, type DragEvent } from 'react';

import type { Point, Token } from '../types';

import { carry, readyCarry } from './carry';
import { presetDragType, trayDragType } from './MapCanvas';
import { PresetFace } from './PresetDialog';

interface TrayProps
{
    /** The monsters waiting on the open map's tray. */
    monsters: Token[];
    /** Takes a preset let go over the tray, in Edit; missing where presets are not dragged. */
    onPresetDrop?: (presetId: string) => void;
    /** Opens a monster's menu, with where on the page, see TokenMenu.tsx. */
    onMenu: (id: string, at: Point) => void;
}

/**
 * The open map's tray, bottom right in Edit: monsters made ready off the grid, hidden,
 * to drag onto the map when they are needed, see Monster staging in PLAN.md. A monster dragged
 * off the map and let go over it goes onto it, see ontoTray in MapEditor.tsx. A click or
 * right click opens one's menu, as on the map.
 */
export function Tray({ monsters, onPresetDrop, onMenu }: TrayProps)
{
    // A preset held over the tray, to show it lands here.
    const [over, setOver] = useState(false);

    const accepts = (event: DragEvent) => Boolean(onPresetDrop) && event.dataTransfer.types.includes(presetDragType);

    // The menu opens beside the tile, as a right click on the map opens it beside the token.
    const open = (id: string, tile: HTMLElement) =>
    {
        const { right, top } = tile.getBoundingClientRect();

        onMenu(id, { x: right, y: top });
    };

    return (
        <section
            className={`ttrpg-panel ttrpg-tray${over ? ' ttrpg-tray--over' : ''}`}
            aria-label="Tray"
            onDragOver={(event) =>
            {
                if (!accepts(event))
                    return;

                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setOver(true);
            }}
            onDragLeave={(event) =>
            {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setOver(false);

            }}
            onDrop={(event) =>
            {
                const presetId = event.dataTransfer.getData(presetDragType);

                setOver(false);

                if (!onPresetDrop || !presetId)
                    return;

                event.preventDefault();
                onPresetDrop(presetId);
            }}
        >
            {/* Folds to its title, to give the map more room, as the map panel does. */}
            <details open>
                <summary>
                    <h2 className="ttrpg-subhead">{monsters.length > 0 ? `Tray · ${monsters.length}` : 'Tray'}</h2>
                    <FontAwesomeIcon icon={faChevronDown} className="ttrpg-usage__chevron" />
                </summary>
                <div className="ttrpg-tray__body">
                    {monsters.length === 0 ? (
                        <p className="ttrpg-tray__empty">
                            {onPresetDrop ? 'Drop a preset or a monster here to keep it off the map.' : 'Drag a monster here to keep it off the map.'}
                        </p>
                    ) : (
                        <ul className="ttrpg-tray__list">
                            {monsters.map((monster) => (
                                <li key={monster.id}>
                                    <button
                                        type="button"
                                        className="ttrpg-library__item ttrpg-preset-tile"
                                        title={`${monster.name}: drag onto the map, or click for more`}
                                        draggable
                                        onPointerEnter={readyCarry}
                                        onDragStart={(event) =>
                                        {
                                            event.dataTransfer.setData(trayDragType, monster.id);
                                            event.dataTransfer.effectAllowed = 'move';
                                            carry(event, monster);
                                        }}
                                        onDragEnd={() => carry(null, null)}
                                        onClick={(event) => open(monster.id, event.currentTarget)}
                                        onContextMenu={(event) =>
                                        {
                                            event.preventDefault();
                                            open(monster.id, event.currentTarget);
                                        }}
                                    >
                                        <PresetFace preset={monster} />
                                        <span className="ttrpg-preset-tile__name">{monster.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </details>
        </section>
    );
}
