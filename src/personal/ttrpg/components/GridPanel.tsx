import type { ChangeEvent } from 'react';

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

interface GridPanelProps
{
    grid: Grid;
    onChange: (grid: Grid) => void;
}

/**
 * The grid's settings, shown with the Grid tool. Dragging a box over one cell drawn on the
 * picture fills in size and offset, see alignTool in map/tools.ts; these fine tune them.
 */
export function GridPanel({ grid, onChange }: GridPanelProps)
{
    const set = (change: Partial<Grid>) => onChange({ ...grid, ...change });

    return (
        <section className="ttrpg-panel ttrpg-properties" aria-label="Grid">
            <h2>Grid</h2>
            <p className="ttrpg-properties__hint">
                Drag a box over one cell drawn on the map to line the grid up with it.
            </p>

            <label>
                Type
                <select
                    value={kindOf(grid)}
                    onChange={(event) => onChange(withKind(grid, event.target.value as GridKind))}
                >
                    <option value="square">Square</option>
                    <option value="pointy">Hex</option>
                    <option value="flat">Flat hex</option>
                    <option value="none">None, free movement</option>
                </select>
            </label>
            <label>
                Cell size
                <input
                    type="number"
                    min={10}
                    step={0.5}
                    value={Number(grid.size.toFixed(2))}
                    onChange={(event) => set({ size: Math.max(10, numberFrom(event, grid.size)) })}
                />
            </label>
            <label>
                Offset X
                <input
                    type="number"
                    step={0.5}
                    value={Number(grid.offsetX.toFixed(2))}
                    onChange={(event) => set({ offsetX: numberFrom(event, grid.offsetX) })}
                />
            </label>
            <label>
                Offset Y
                <input
                    type="number"
                    step={0.5}
                    value={Number(grid.offsetY.toFixed(2))}
                    onChange={(event) => set({ offsetY: numberFrom(event, grid.offsetY) })}
                />
            </label>
            <label>
                Lines
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={grid.opacity}
                    onChange={(event) => set({ opacity: numberFrom(event, grid.opacity) })}
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
                className="ttrpg-segment"
                title={`A square grid of ${defaultGrid.size} px cells from the top left corner, with faint lines`}
                disabled={(Object.keys(defaultGrid) as (keyof Grid)[]).every((field) => grid[field] === defaultGrid[field])}
                onClick={() => onChange(defaultGrid)}
            >
                Back to the default grid
            </button>
        </section>
    );
}
