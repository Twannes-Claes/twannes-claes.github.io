import type { Grid, Scenario, Token, Wall } from '../types';

import { cellCenter } from '../map/grid';
import { footprintCenter } from '../map/size';
import { spawnCells } from '../map/spawn';

/** Pixels per cell of a blank map, the size of a cell on a typical exported battle map. */
const cell = 100;
/** Pixels per cell of the demo's picture, which is 20 by 10 cells. */
const demoCell = 70;

/** A wall of the demo between two grid corners, given in cells, or an open door with door. */
function wall(x1: number, y1: number, x2: number, y2: number, door = false): Wall
{
    return {
        id: `${x1},${y1},${x2},${y2}`,
        x1: x1 * demoCell,
        y1: y1 * demoCell,
        x2: x2 * demoCell,
        y2: y2 * demoCell,
        blocksSight: !door,
        blocksMove: !door,
        ...(door && { door: { open: true } }),
    };
}

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

/**
 * Who made the demo's picture. Free to use with attribution, so every map with its picture shows
 * this on screen, see components/MapCanvas.tsx. Only human-made art goes into the app, see PLAN.md.
 */
export const demoCredit = {
    text: 'Map: Home in the Reeds by Explorer\'s Guild Publishing',
    url: 'https://explorersguildpublishing.itch.io/free-battlemap-1-home-in-the-reeds',
};

/**
 * The map behind ?demo, see pages/Editor.tsx: an abandoned house by a road, 20 by 10 cells. The
 * players start inside. The door in the house's top wall starts open, like the doorway drawn on
 * the picture, so they see out onto the road; the GM can close it. The walls follow the house on
 * the picture.
 */
export const demoScenario: Scenario = {
    id: 'demo',
    name: 'Home in the Reeds',
    width: 20 * demoCell,
    height: 10 * demoCell,
    background: '/assets/ttrpg/home-in-the-reeds.webp',
    grid: { ...defaultGrid, size: demoCell },
    props: [],
    walls: [
        // The house, with its door in the top wall, towards the road.
        wall(8, 4, 11, 4),
        wall(11, 4, 12, 4, true),
        wall(12, 4, 13, 4),
        wall(13, 4, 13, 7),
        wall(13, 7, 8, 7),
        wall(8, 7, 8, 4),
        // The beam between the bed and the table.
        wall(10, 4, 10, 6),
    ],
    spawn: { x: 9.5 * demoCell, y: 5.5 * demoCell },
};

/** An empty floor of 30 by 20 cells, the start of a map drawn in the editor. */
export function blankScenario(name: string): Scenario
{
    return {
        id: crypto.randomUUID(),
        name,
        width: 30 * cell,
        height: 20 * cell,
        background: null,
        grid: defaultGrid,
        props: [],
        walls: [],
        spawn: { x: 15 * cell, y: 10 * cell },
    };
}


const demoPlayers = [
    { name: 'Aria', color: '#683c9b', speed: 30 },
    { name: 'Bram', color: '#2f8f55', speed: 25 },
];

/**
 * The Large ogre waiting by the road on the demo map, for creature sizes and for monsters that
 * only show once a player sees them. A saved example session gets it as a real monster, see
 * addExample in convex/sessions.ts.
 */
export function demoOgre(grid: Grid): Omit<Token, 'id'>
{
    return {
        kind: 'npc',
        name: 'Ogre',
        color: '#b4443c',
        size: 'large',
        speed: 40,
        ...footprintCenter(grid, { q: 15, r: 5 }, 'large'),
    };
}

/**
 * Two players, placed around a map's spawn point the way joining players will be, and the ogre
 * on any map with the demo's picture, which includes the example session and its copies.
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

    if (scenario.background !== demoScenario.background)
        return players;

    return [...players, { id: 'ogre', ...demoOgre(scenario.grid) }];
}
