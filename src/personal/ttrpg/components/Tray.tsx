import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';

import type { Point, Token } from '../types';

import { carry, readyCarry } from './carry';
import { presetDragType, trayDragType } from './MapCanvas';
import { PresetFace } from './PresetDialog';

/** How long a tile takes to fade out, fade in or glide to its new place. */
const tileMs = 180;

interface TrayProps
{
    /** The monsters waiting on the open map's tray. */
    monsters: Token[];
    /** Takes a preset let go over the tray, in Edit; missing where presets are not dragged. */
    onPresetDrop?: (presetId: string) => void;
    /** Opens a monster's menu, with where on the page, see TokenMenu.tsx. */
    onMenu: (id: string, at: Point) => void;
    /** A monster on the map is being dragged, which lands here if let go over the tray. */
    carrying?: boolean;
}

/**
 * The open map's tray, bottom right in Edit and the GM view: monsters made ready off the grid,
 * hidden, to drag onto the map when they are needed, see Monster staging in PLAN.md. A monster
 * dragged off the map and let go over it goes onto it, see ontoTray in MapEditor.tsx. A click or
 * right click opens one's menu, as on the map.
 */
export function Tray({ monsters, onPresetDrop, onMenu, carrying = false }: TrayProps)
{
    // A preset held over the tray, to show it lands here.
    const [over, setOver] = useState(false);
    // The same for a monster dragged off the map, which is no drag the browser knows of: the map
    // holds the pointer, so its moves only pass by the window.
    const [held, setHeld] = useState(false);
    const box = useRef<HTMLElement>(null);

    useEffect(() =>
    {
        if (!carrying)
            return;

        const track = (event: PointerEvent) =>
        {
            const rect = box.current?.getBoundingClientRect();

            setHeld(rect !== undefined && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
        };

        window.addEventListener('pointermove', track, true);

        return () =>
        {
            window.removeEventListener('pointermove', track, true);
            setHeld(false);
        };
    }, [carrying]);

    // The tiles drawn: the monsters on the tray, and those that just left it, kept until they have
    // faded out where they stood. Under reduced motion they go at once.
    const [kept, setKept] = useState(monsters);
    const [keptFor, setKeptFor] = useState(monsters);
    const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (monsters !== keptFor)
    {
        setKeptFor(monsters);
        setKept((current) => [
            ...current.flatMap((tile) =>
            {
                const now = monsters.find((monster) => monster.id === tile.id);

                return now ? [now] : calm ? [] : [tile];
            }),
            ...monsters.filter((monster) => !current.some((tile) => tile.id === monster.id)),
        ]);
    }

    // Where each tile stood, so the rest glide into place once one goes or comes, and the tiles
    // fading out now, so each fades once.
    const places = useRef(new Map<string, DOMRect>());
    const fading = useRef(new Set<string>());

    useLayoutEffect(() =>
    {
        const tiles = [...(box.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
        const before = places.current;

        places.current = new Map(tiles.map((tile) => [tile.dataset.tile ?? '', tile.getBoundingClientRect()]));

        if (calm || !box.current)
            return;

        // Moves inside the panel are in its zoomed pixels, see the control size in useScreenSettings.ts.
        const zoom = Number(getComputedStyle(box.current).getPropertyValue('--ttrpg-ui')) || 1;
        const timing = { duration: tileMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

        for (const tile of tiles)
        {
            const id = tile.dataset.tile ?? '';
            const was = before.get(id);
            const now = places.current.get(id);

            if (!monsters.some((monster) => monster.id === id))
            {
                if (fading.current.has(id))
                    continue;

                fading.current.add(id);
                // Cancelled when it comes back first, and then it stays.
                tile.animate({ opacity: [1, 0], scale: [1, 0.8] }, { ...timing, fill: 'forwards' }).finished.then(
                    () =>
                    {
                        fading.current.delete(id);
                        setKept((current) => current.filter((other) => other.id !== id));
                    },
                    () => fading.current.delete(id),
                );
            }
            else if (fading.current.has(id))
            {
                for (const motion of tile.getAnimations())
                    motion.cancel();

            }
            else if (!was && before.size > 0)
                tile.animate({ opacity: [0, 1], scale: [0.8, 1] }, timing);
            else if (was && now && (was.left !== now.left || was.top !== now.top))
                tile.animate({ translate: [`${(was.left - now.left) / zoom}px ${(was.top - now.top) / zoom}px`, '0 0'] }, timing);

        }
    }, [kept, monsters, calm]);

    const accepts = (event: DragEvent) => Boolean(onPresetDrop) && event.dataTransfer.types.includes(presetDragType);

    // The menu opens beside the tile, as a right click on the map opens it beside the token.
    const open = (id: string, tile: HTMLElement) =>
    {
        const { right, top } = tile.getBoundingClientRect();

        onMenu(id, { x: right, y: top });
    };

    return (
        <section
            ref={box}
            className={`ttrpg-panel ttrpg-tray${over || held ? ' ttrpg-tray--over' : ''}`}
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
                    {kept.length === 0 ? (
                        <p className="ttrpg-tray__empty">
                            {onPresetDrop ? 'Drop a preset or a monster here to keep it off the map.' : 'Drag a monster here to keep it off the map.'}
                        </p>
                    ) : (
                        <ul className="ttrpg-tray__list">
                            {kept.map((monster) => (
                                <li key={monster.id} data-tile={monster.id} inert={!monsters.some((other) => other.id === monster.id)}>
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
