import type { GameSystem, Point, Preset, Scenario, Token } from '../types';
import { initiativeOf, statsOf } from '../content/statBlocks.ts';

import { cleanStats } from './health.ts';
import { landingAt } from './size.ts';

/**
 * The monster a preset puts on a map where it was dropped, shared by the server and the demo, see
 * placeMonster in convex/play.ts: its stat block's numbers at full health, lined up with the grid,
 * hidden until the GM shows it, clear of the others on the map. A second of the same name on the
 * map gets a number, from the names already there.
 */
export function monsterFrom(preset: Pick<Preset, 'name' | 'markdown' | 'color' | 'downs' | 'avatar'>, map: Pick<Scenario, 'grid' | 'width' | 'height'>, at: Point, names: Set<string>, others: Pick<Token, 'x' | 'y' | 'size'>[]): Omit<Token, 'id' | 'presetId' | 'summonOf'>
{
    const stats = statsOf(preset.markdown);
    const size = stats.size ?? 'medium';
    const base = (stats.name || preset.name).slice(0, 26);
    const numbers = stats.maxHp === undefined ? {} : cleanStats({ hp: stats.maxHp, maxHp: stats.maxHp, tempHp: 0, ac: stats.ac ?? 10, perception: stats.perception ?? 10 });
    const spot = landingAt(map, at, size, others);
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

/**
 * What a token adds to its initiative roll: what its player filled in, in any system, as a feat
 * can have them roll something else; from its preset's stat block, see initiativeOf; or in
 * Pathfinder 2e from its passive Perception, as initiative there is a Perception check. Undefined
 * when none says.
 */
export function initiativeBonus(token: Pick<Token, 'presetId' | 'perception' | 'initiative'>, presets: Pick<Preset, 'id' | 'markdown'>[], system: GameSystem): number | undefined
{
    if (token.initiative !== undefined)
        return token.initiative;

    const preset = presets.find((candidate) => candidate.id === token.presetId);
    const written = preset ? initiativeOf(preset.markdown, system) : undefined;

    if (written !== undefined)
        return written;

    return system === 'pf2e' && token.perception !== undefined ? token.perception - 10 : undefined;
}
