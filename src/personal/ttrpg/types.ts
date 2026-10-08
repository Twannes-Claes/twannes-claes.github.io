/** A spot on the map, in world pixels: the pixels of the scenario's background picture. */
export interface Point
{
    x: number;
    y: number;
}

/**
 * One grid cell. Column and row on a square grid, axial coordinates on a hex grid, see
 * map/grid.ts.
 */
export interface Cell
{
    q: number;
    r: number;
}

export interface Grid
{
    /** A scenario without a grid still has a scale, from size and feetPerCell. */
    type: 'square' | 'hex' | 'none';
    /** Hex only. Pointy has a corner at the top, flat has a side there. */
    hexOrientation: 'pointy' | 'flat';
    /**
     * The distance between the centres of two neighbouring cells in world pixels, so a square's
     * side, or a hex measured from flat side to flat side.
     */
    size: number;
    /** Moves the grid to line up with a grid already drawn on the picture. */
    offsetX: number;
    offsetY: number;
    feetPerCell: number;
    /**
     * Square only. Alternate, also when missing, makes every second diagonal cost two cells, the
     * 5, 10, 5 rule; equal makes every diagonal one cell.
     */
    diagonals?: 'alternate' | 'equal';
    color: string;
    /** 0 to 1. */
    opacity: number;
    /** A hidden grid still drives snapping and movement. */
    visible: boolean;
}

export interface Wall
{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /** False for a window, which players see through but cannot walk through. */
    blocksSight: boolean;
    blocksMove: boolean;
    /**
     * Set on doors. Opening one clears blocksSight and blocksMove, closing it sets them again,
     * so the sight and movement maths never need to know about doors.
     */
    door?: { open: boolean };
}

/** A picture placed on the map, like a tree or a barrel. Uploaded by game masters, see PLAN.md. */
export interface Prop
{
    id: string;
    /** Where the picture is loaded from. */
    src: string;
    /** The centre, in world pixels. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Clockwise, in radians. */
    rotation: number;
}

/** A picture in the prop library, ready to be placed. */
export interface PropPicture
{
    id: string;
    name: string;
    src: string;
    /** The picture's own size in pixels, which sets its size on the map when placed. */
    width: number;
    height: number;
}

export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/** A player or monster on the map. */
export interface Token
{
    id: string;
    /** Players light the fog and draw paths; monsters only show where a player can see. */
    kind: 'player' | 'npc';
    name: string;
    /** The ring around the picture. */
    color: string;
    /** Address of a round picture, added when joining. Without one, the name's initial shows. */
    avatar?: string;
    size: CreatureSize;
    /** Feet per move. Past it the feet counter turns red, but the move is still allowed. */
    speed: number;
    /** The centre, in world pixels. */
    x: number;
    y: number;
    /** The last walk, centre to centre, so every screen can play it, see map/view.ts. */
    path?: Point[];
    /** When that walk was confirmed. A new value starts the walk on every screen. */
    movedAt?: number;
    /** A monster the game master keeps out of sight, even where players could see it. */
    hidden?: boolean;
}

/** A stored picture: where it loads from, and its size in pixels. */
export interface StoredPicture
{
    src: string;
    width: number;
    height: number;
}

/**
 * Where the editor keeps what it makes: services/demo.ts holds it in the tab, services/backend.ts
 * in Convex.
 */
export interface Store
{
    /** Adds a picture to the game master's prop library. */
    uploadProp: (file: File) => Promise<PropPicture>;
    /** Stores a map's background picture. */
    uploadMap: (picture: Blob) => Promise<StoredPicture>;
    /** Saves the scenarios, in order, sending only the changed ones. Missing in the demo. */
    save?: (scenarios: Scenario[], changed: Scenario[]) => Promise<void>;
}

/**
 * A saved session being played, handed to the editor by components/SessionEditor.tsx, see
 * convex/play.ts. The demo has none and previews play mode with two test players.
 */
export interface Live
{
    /** Started and not ended: players can join and move. */
    live: boolean;
    frozen: boolean;
    /** The last password used, to start again with. */
    password: string;
    /** The map everyone plays on. */
    activeScenarioId: string | null;
    /** Who stands on that map, live. */
    tokens: Token[];
    /** The join page with this session, what the QR code holds. */
    joinPath: string;
    /** freshFog forgets what the party saw of every map, for a new night. */
    start: (password: string, scenarioId: string, freshFog: boolean) => Promise<void>;
    end: () => Promise<void>;
    freeze: (frozen: boolean) => Promise<void>;
    /** Switches the map everyone plays on, and every player starts over at its spawn point. */
    open: (scenarioId: string) => Promise<void>;
    /** With a path the token walks it on every screen, without one it is put down there. */
    move: (id: string, to: Point, path?: Point[]) => Promise<void>;
    /** Removes a player from the table until the session starts again. */
    kick: (tokenId: string) => Promise<void>;
    /** Adds a monster or NPC to the map being played, around a point. */
    addMonster: (monster: NewMonster, at: Point) => Promise<void>;
    hide: (tokenId: string, hidden: boolean) => Promise<void>;
    removeMonster: (tokenId: string) => Promise<void>;
    /** What the party has seen of the map being played, null until anything has been. */
    fog: SharedFog | null;
    /** Adds what the table screen has seen to it. Only the game master's screen sends this. */
    saveFog: (fog: SharedFog) => Promise<void>;
    /** Forgets what everyone has seen of the map being played. */
    resetFog: () => Promise<void>;
    /** How the fog looks on every screen, null until the game master changes it. */
    fogLook: FogSettings | null;
    setFogLook: (look: FogSettings) => Promise<void>;
}

/**
 * How the fog looks, set by the game master for a session so every screen shows the same, see
 * components/FogPanel.tsx and the defaults in map/fog.ts.
 */
export interface FogSettings
{
    /** Milliseconds a change in the fog, or a token, takes to fade in or out. */
    fade: number;
    /** 0 to 1: how soft the edges of what players see and of shadows are. Walls stay crisp. */
    softness: number;
    /** 0 to 1: how much of a room seen before shows through. */
    memory: number;
    /** 0 to 1: how much shadow is left far from the players, the distance haze. */
    haze: number;
    /** 0 to 1: how thick the drifting smoke is. */
    smoke: number;
}

/**
 * What the party has seen of the map being played, kept by the server so every screen and every
 * reload shares it, see convex/play.ts. One byte per sample of map/fog.ts's explored mask.
 */
export interface SharedFog
{
    scenarioId: string;
    /** Goes up when the game master resets the fog, so every screen forgets what it had. */
    epoch: number;
    columns: number;
    rows: number;
    seen: ArrayBuffer;
}

/** What the game master fills in to add a monster, see components/Monsters.tsx. */
export interface NewMonster
{
    name: string;
    color: string;
    size: CreatureSize;
    hidden: boolean;
    /** Any picture the browser can read. Null shows the name's initial. */
    picture: Blob | null;
}

/** One battle map of a session, see PLAN.md. */
export interface Scenario
{
    id: string;
    name: string;
    /** The size of the map in world pixels, the background picture's size when it has one. */
    width: number;
    height: number;
    /** Address of the background picture, or null for a plain floor, like the demo. */
    background: string | null;
    grid: Grid;
    /** Drawn in order, so the last one is on top. */
    props: Prop[];
    walls: Wall[];
    /** Where players appear when they join or the scenario changes. */
    spawn: Point;
}
