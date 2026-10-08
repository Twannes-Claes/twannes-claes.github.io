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
                className="ttrpg-properties__scrub"
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
        <section className="ttrpg-panel ttrpg-properties" aria-label="Grid">
            <h2>Grid</h2>

            <label>
                Type
                <select
                    value={kindOf(grid)}
                    onChange={(event) => onChange(withKind(grid, event.target.value as GridKind))}
                >
                    <option value="square">Square</option>
                    <option value="pointy">Hex</option>
                    <option value="flat">Flat hex</option>
                    <option value="none">None</option>
                </select>
            </label>
            {grid.type === 'square' && (
                <label>
                    Diagonals
                    <select
                        value={grid.diagonals ?? 'alternate'}
                        onChange={(event) => set({ diagonals: event.target.value as Grid['diagonals'] })}
                    >
                        <option value="alternate">{`${grid.feetPerCell}, ${grid.feetPerCell * 2}, ${grid.feetPerCell} ft`}</option>
                        <option value="equal">{`${grid.feetPerCell} ft each`}</option>
                    </select>
                </label>
            )}
            {/* Only kept above 0, so typing 7 on the way to 70 does not jump to a bigger minimum. */}
            <NumberField label="Cell size" value={grid.size} step={0.5} min={1} onChange={(size, merge) => set({ size }, merge)} />
            <NumberField label="Offset X" value={grid.offsetX} step={0.5} onChange={(offsetX, merge) => set({ offsetX }, merge)} />
            <NumberField label="Offset Y" value={grid.offsetY} step={0.5} onChange={(offsetY, merge) => set({ offsetY }, merge)} />
            <label>
                Lines
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={grid.opacity}
                    onChange={(event) =>
                    {
                        set({ opacity: numberFrom(event, grid.opacity) }, sliding.current);
                        sliding.current = true;
                    }}
                    onPointerUp={letGo}
                    onKeyUp={letGo}
                    onBlur={letGo}
                />
            </label>
            <label className="ttrpg-properties__check">
                <input
                    type="checkbox"
                    checked={grid.visible}
                    onChange={(event) => set({ visible: event.target.checked })}
                />
                Show the grid
            </label>
            <button
                type="button"
                className="ttrpg-segment ttrpg-segment--block"
                title={`A square grid of ${defaultGrid.size} px cells from the top left corner, with faint lines`}
                disabled={(Object.keys(defaultGrid) as (keyof Grid)[]).every((field) => grid[field] === defaultGrid[field])}
                // The diagonal rule is a game rule, not part of lining the grid up, so it stays.
                onClick={() => onChange({ ...defaultGrid, diagonals: grid.diagonals })}
            >
                Back to the default grid
            </button>
        </section>
    );
}
