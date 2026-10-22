import type { GameSystem } from '../types';

/** The games a session can be played in, in the order the pickers list them. */
export const gameSystems: { id: GameSystem; name: string }[] = [
    { id: '5e', name: 'D&D 5e' },
    { id: 'pf2e', name: 'Pathfinder 2e' },
    { id: 'other', name: 'Other' },
];
