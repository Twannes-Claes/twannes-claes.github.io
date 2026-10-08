import {
    faBorderAll,
    faBorderNone,
    faClockRotateLeft,
    faEye,
    faHexagonNodes,
    type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef, type ChangeEvent } from 'react';

import type { Grid } from '../types';

import { defaultGrid } from '../content/scenarios';

type GridKind = 'none' | 'square' | 'pointy' | 'flat';

function kindOf(grid: Grid): GridKind
{
    if (grid.type === 'hex')
        return grid.hexOrientation;

    return grid.type;
}

function withKind(grid: Grid, kind: GridKind): Grid
{
    if (kind === 'pointy' || kind === 'flat')
        return { ...grid, type: 'hex', hexOrientation: kind };

    return { ...grid, type: kind };
}

/**
 * The grid types as symbols, with the name as the tip. Font Awesome's free set has no plain
 * hexagon, so both hexes use the one with dots on its corners, the flat one turned a quarter.
 */
const kinds: { id: GridKind; icon: IconDefinition; title: string; turned?: boolean }[] = [
    { id: 'square', icon: faBorderAll, title: 'Square cells' },
    { id: 'pointy', icon: faHexagonNodes, title: 'Hexes with a point on top' },
    { id: 'flat', icon: faHexagonNodes, title: 'Hexes with a flat top', turned: true },
    { id: 'none', icon: faBorderNone, title: 'No grid' },
];

/** The ways a diagonal step can cost, labelled with what a walk of three costs. */
function diagonalRules(feet: number): { id: NonNullable<Grid['diagonals']>; label: string; title: string }[]
{
    return [
        { id: 'alternate', label: `${feet}, ${feet * 2}, ${feet} ft`, title: 'Every second diagonal step costs double' },
        { id: 'equal', label: `${feet} ft each`, title: 'Every diagonal step costs one cell' },
    ];
}

/** A number field's value, or the old one while the field is empty or half typed. */
function numberFrom(event: ChangeEvent<HTMLInputElement>, fallback: number): number
{
    const value = event.target.valueAsNumber;

    return Number.isFinite(value) ? value : fallback;
}

interface NumberFieldProps
{
    label: string;
    value: number;
    step: number;
    min?: number;
    /** merge is true for every change of a drag after the first, so the drag undoes as one. */
    onChange: (value: number, merge: boolean) => void;
}

/**
 * A number field whose name drags like a slider, as in Unity: a step per pixel left or right,
 * ten with Shift. A click on the name without moving still focuses the field.
 */
function NumberField({ label, value, step, min = -Infinity, onChange }: NumberFieldProps)
{
    const drag = useRef<{ x: number; from: number; moved: boolean; pressed: boolean } | null>(null);

    return (
        <label>
            <span
                className="ttrpg-settings__scrub"
                // No text selection while dragging; the click that focuses the field still comes.
                onPointerDown={(event) =>
                {
                    if (event.button !== 0)
                        return;

                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, from: value, moved: false, pressed: true };
                }}
                onPointerMove={(event) =>
                {
                    const current = drag.current;
                    const pixels = current ? event.clientX - current.x : 0;

                    // A few pixels of wobble is still a click.
                    if (!current?.pressed || (!current.moved && Math.abs(pixels) < 3))
                        return;

                    const merge = current.moved;

                    current.moved = true;
                    const raw = current.from + pixels * step * (event.shiftKey ? 10 : 1);

                    onChange(Math.max(min, Math.round(raw / step) * step), merge);
                }}
                onPointerUp={() =>
                {
                    if (drag.current)
                        drag.current.pressed = false;

                }}
                onClick={(event) =>
                {
                    if (drag.current?.moved)
                        event.preventDefault();

                }}
            >
                {label}
            </span>
            <input
                type="number"
                min={Number.isFinite(min) ? min : undefined}
                step={step}
                value={Number(value.toFixed(2))}
                onChange={(event) => onChange(Math.max(min, numberFrom(event, value)), false)}
            />
        </label>
    );
}

interface GridPanelProps
{
    grid: Grid;
    onChange: (grid: Grid, merge?: boolean) => void;
}

/** The grid's settings, shown with the Grid tool. Size and offset line it up with the picture. */
export function GridPanel({ grid, onChange }: GridPanelProps)
{
    const set = (change: Partial<Grid>, merge = false) => onChange({ ...grid, ...change }, merge);
    // True while the Lines slider is held, so one slide, or one held arrow key, undoes as one.
    const sliding = useRef(false);
    const letGo = () =>
    {
        sliding.current = false;
    };

    return (
        <section className="ttrpg-panel ttrpg-properties ttrpg-settings" aria-label="Grid">
            <h2>Grid</h2>

            <div className="ttrpg-settings__group" role="group" aria-label="Type">
                Type
                <div className="ttrpg-settings__choices">
                    {kinds.map((choice) => (
                        <button
                            key={choice.id}
                            type="button"
                            className="ttrpg-segment"
                            aria-pressed={kindOf(grid) === choice.id}
                            aria-label={choice.title}
                            title={choice.title}
                            // The type already on is no change, so it adds no step to undo.
                            onClick={() => kindOf(grid) !== choice.id && onChange(withKind(grid, choice.id))}
                        >
                            <FontAwesomeIcon icon={choice.icon} rotation={choice.turned ? 90 : undefined} />
                        </button>
                    ))}
                </div>
            </div>
            {grid.type === 'square' && (
                <div className="ttrpg-settings__group" role="group" aria-label="Diagonals">
                    Diagonals
                    <div className="ttrpg-settings__choices">
                        {diagonalRules(grid.feetPerCell).map((choice) => (
                            <button
                                key={choice.id}
                                type="button"
                                className="ttrpg-segment"
                                aria-pressed={(grid.diagonals ?? 'alternate') === choice.id}
                                title={choice.title}
                                onClick={() => (grid.diagonals ?? 'alternate') !== choice.id && set({ diagonals: choice.id })}
                            >
                                {choice.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {/* Only kept above 0, so typing 7 on the way to 70 does not jump to a bigger minimum. */}
            <NumberField label="Cell size" value={grid.size} step={0.5} min={1} onChange={(size, merge) => set({ size }, merge)} />
            <div className="ttrpg-settings__group" role="group" aria-label="Offset">
                Offset
                <div className="ttrpg-settings__pair">
                    <NumberField label="X" value={grid.offsetX} step={0.5} onChange={(offsetX, merge) => set({ offsetX }, merge)} />
                    <NumberField label="Y" value={grid.offsetY} step={0.5} onChange={(offsetY, merge) => set({ offsetY }, merge)} />
                </div>
            </div>
            <div className="ttrpg-settings__group" role="group" aria-label="Lines">
                Lines
                <div className="ttrpg-settings__line">
                    <input
                        type="range"
                        aria-label="How strong the lines are"
                        min={0}
                        max={1}
                        step={0.05}
                        value={grid.opacity}
                        // Hidden lines have no strength to set.
                        disabled={!grid.visible}
                        onChange={(event) =>
                        {
                            set({ opacity: numberFrom(event, grid.opacity) }, sliding.current);
                            sliding.current = true;
                        }}
                        onPointerUp={letGo}
                        onKeyUp={letGo}
                        onBlur={letGo}
                    />
                    <span className="ttrpg-settings__value">{`${Math.round(grid.opacity * 100)}%`}</span>
                    <button
                        type="button"
                        className="ttrpg-icon-button ttrpg-icon-button--small"
                        aria-pressed={grid.visible}
                        aria-label="Show the grid"
                        title={grid.visible ? 'Hide the grid' : 'Show the grid'}
                        onClick={() => set({ visible: !grid.visible })}
                    >
                        <FontAwesomeIcon icon={faEye} />
                    </button>
                </div>
            </div>
            <button
                type="button"
                className="ttrpg-segment ttrpg-segment--block"
                title={`Square, ${defaultGrid.size} px cells, faint lines`}
                disabled={(Object.keys(defaultGrid) as (keyof Grid)[]).every((field) => grid[field] === defaultGrid[field])}
                // The diagonal rule is a game rule, not part of lining the grid up, so it stays.
                onClick={() => onChange({ ...defaultGrid, diagonals: grid.diagonals })}
            >
                <FontAwesomeIcon icon={faClockRotateLeft} />
                Default grid
            </button>
        </section>
    );
}
