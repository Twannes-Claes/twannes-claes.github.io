import type { Grid, Scenario, Token, Wall } from '../types';

import { cellCenter } from '../map/grid';
import { footprintCenter } from '../map/size';
import { spawnCells } from '../map/spawn';

/** Pixels per cell in the demo, the size of a cell on a typical exported battle map. */
const cell = 100;

/** A wall between two grid corners, given in cells. */
function wall(x1: number, y1: number, x2: number, y2: number): Wall
{
    return {
        id: `${x1},${y1},${x2},${y2}`,
        x1: x1 * cell,
        y1: y1 * cell,
        x2: x2 * cell,
        y2: y2 * cell,
        blocksSight: true,
        blocksMove: true,
    };
}

/**
 * The map behind ?demo, see pages/Editor.tsx: 30 by 20 cells, a room with a door on the left, a
 * hall with a door on the right and a pillar between them. No picture, so it needs nothing from
 * Firebase or the network.
 */
/** The grid a blank map starts with, and what the grid panel's default button goes back to. */
export const defaultGrid: Grid = {
    type: 'square',
    hexOrientation: 'pointy',
    size: cell,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    color: '#fcf8ec',
    opacity: 0.18,
    visible: true,
};

export const demoScenario: Scenario = {
    id: 'demo',
    name: 'Demo',
    width: 30 * cell,
    height: 20 * cell,
    background: null,
    grid: defaultGrid,
    props: [],
    walls: [
        // The room, with a door in its right wall.
        wall(3, 3, 12, 3),
        wall(3, 3, 3, 10),
        wall(3, 10, 12, 10),
        wall(12, 3, 12, 6),
        wall(12, 7, 12, 10),
        // The hall, with a door in its top wall.
        wall(18, 8, 22, 8),
        wall(23, 8, 27, 8),
        wall(27, 8, 27, 17),
        wall(18, 17, 27, 17),
        wall(18, 8, 18, 17),
        // The pillar.
        wall(14, 13, 15, 13),
        wall(15, 13, 15, 14),
        wall(15, 14, 14, 14),
        wall(14, 14, 14, 13),
    ],
    spawn: { x: 6.5 * cell, y: 6.5 * cell },
};

/** An empty floor of 30 by 20 cells, the start of a map drawn in the editor. */
export function blankScenario(name: string): Scenario
{
    return {
        ...demoScenario,
        id: crypto.randomUUID(),
        name,
        props: [],
        walls: [],
        spawn: { x: demoScenario.width / 2, y: demoScenario.height / 2 },
    };
}

const demoPlayers = [
    { name: 'Aria', color: '#683c9b', speed: 30 },
    { name: 'Bram', color: '#2f8f55', speed: 25 },
];

/**
 * Two players, placed around a map's spawn point the way joining players will be. The demo map
 * also has a Large ogre waiting in the hall, for creature sizes and for monsters that only show
 * once a player sees them.
 */
export function demoTokens(scenario: Scenario): Token[]
{
    const spots = spawnCells(scenario.grid, scenario.walls, scenario, scenario.spawn, 2, new Set());
    const players: Token[] = spots.map((spot, index) => ({
        id: `player-${index}`,
        kind: 'player',
        size: 'medium',
        ...demoPlayers[index],
        ...cellCenter(scenario.grid, spot),
    }));

    if (scenario.id !== demoScenario.id)
        return players;

    const ogre: Token = {
        id: 'ogre',
        kind: 'npc',
        name: 'Ogre',
        color: '#b4443c',
        size: 'large',
        speed: 40,
        ...footprintCenter(scenario.grid, { q: 22, r: 12 }, 'large'),
    };

    return [...players, ogre];
}
