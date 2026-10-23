import type { Grid, Point, Preset, Token } from '../types';
import { statsOf } from '../content/statBlocks.ts';

import { cleanStats } from './health.ts';
import { anchorAt, footprintCenter } from './size.ts';

/**
 * The monster a preset puts on a map where it was dropped, shared by the server and the demo, see
 * placeMonster in convex/play.ts: its stat block's numbers at full health, lined up with the grid,
 * hidden until the GM shows it. A second of the same name on the map gets a number, from the
 * names already there.
 */
export function monsterFrom(preset: Pick<Preset, 'name' | 'markdown' | 'color' | 'downs' | 'avatar'>, grid: Grid, at: Point, names: Set<string>): Omit<Token, 'id' | 'presetId'>
{
    const stats = statsOf(preset.markdown);
    const size = stats.size ?? 'medium';
    const base = (stats.name || preset.name).slice(0, 26);
    const numbers = stats.maxHp === undefined ? {} : cleanStats({ hp: stats.maxHp, maxHp: stats.maxHp, tempHp: 0, ac: stats.ac ?? 10, perception: stats.perception ?? 10 });
    const spot = grid.type === 'none' ? at : footprintCenter(grid, anchorAt(grid, at, size), size);
    let name = base;

    for (let count = 2; names.has(name); count++)
        name = `${base} ${count}`;

    return {
        kind: 'npc',
        name,
        color: preset.color,
        size,
        speed: stats.speed === undefined ? 30 : Math.min(999, Math.max(0, stats.speed)),
        // The preset's picture, which stays the preset's: the monster dying leaves it be.
        avatar: preset.avatar,
        hidden: true,
        downs: preset.downs ? true : undefined,
        x: spot.x,
        y: spot.y,
        ...numbers,
    };
}
