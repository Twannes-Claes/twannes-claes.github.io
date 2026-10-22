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
    /**
     * Shared by the walls of one ring drawn round a tree or a pillar, so the eraser takes them
     * together and the Doors tool leaves them alone, see ringTool in map/tools.ts.
     */
    ring?: string;
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
    /** The stored file's size, for the storage meter in components/PropLibrary.tsx. */
    bytes: number;
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
    /**
     * The numbers, for the game master and the token's own player only. Missing on a token
     * without them, like a monster added without HP, and on everyone else's screen, see
     * withoutNumbers in map/health.ts.
     */
    hp?: number;
    maxHp?: number;
    tempHp?: number;
    ac?: number;
    /** Passive Perception, for the game master's secret checks. */
    perception?: number;
    /** What a screen without the numbers sees instead, see HealthState. */
    state?: HealthState;
    /** What it suffers from, for everyone to see, see Condition. */
    conditions?: Condition[];
}

/**
 * A condition on a token, like Prone, by its id in content/conditions.ts, with its value for one
 * that has levels, like Exhaustion 2 or Frightened 1.
 */
export interface Condition
{
    id: string;
    value?: number;
}

/**
 * A ruler or an area of effect being dragged out, shown live on every screen at the table, see
 * marks in convex/play.ts. A ruler runs from one point to the other; an area is a circle around
 * from, out to to.
 */
export interface Mark
{
    kind: 'ruler' | 'area';
    from: Point;
    to: Point;
}

/** Another screen's mark, in its player's ring colour, or the GM's without one. */
export interface SharedMark extends Mark
{
    id: string;
    color?: string;
}

/** How hurt a token looks to everyone who may not see its numbers, see map/health.ts. */
export type HealthState = 'unhurt' | 'hurt' | 'bloodied' | 'critical' | 'down';

/** Damage or healing dealt to tokens, see applyHit in map/health.ts. */
export type HitKind = 'attack' | 'heal';

/**
 * The last attack or heal on the map being played, for the animation every screen plays, see
 * lastHit in convex/play.ts. Where each target stood, so one that died of it still shows.
 */
export interface SharedHit
{
    at: number;
    kind: HitKind;
    targets: { x: number; y: number; size: CreatureSize; died: boolean }[];
}

/**
 * A pool of blood on the ground until the game master clears it, see decals in convex/play.ts:
 * where a monster died, or, wider, where a player went down. Decoration only.
 */
export interface Decal
{
    id: string;
    x: number;
    y: number;
    size: CreatureSize;
    /** How much wider than the creature, so a downed player's shows around them. Missing is 1. */
    scale?: number;
}

/** A token's numbers as the game master or its player sets them, see components/StatsForm.tsx. */
export interface Stats
{
    hp: number;
    maxHp: number;
    tempHp: number;
    ac: number;
    perception: number;
}

/** A stored picture: where it loads from, and its size in pixels. */
export interface StoredPicture
{
    src: string;
    width: number;
    height: number;
    /** Its file size. Missing for a picture the site ships, like the demo map's. */
    bytes?: number;
}

/** A stored map picture's file size, see load in convex/sessions.ts. */
export interface PictureBytes
{
    src: string;
    bytes: number;
}

/**
 * Where the editor keeps what it makes: services/demo.ts holds it in the tab, services/backend.ts
 * in Convex.
 */
export interface Store
{
    /** Adds a picture to the game master's prop library. */
    uploadProp: (file: File) => Promise<PropPicture>;
    /** Takes a picture out of the library and frees its file. */
    removeProp: (picture: PropPicture) => Promise<void>;
    /** Stores a map's background picture. */
    uploadMap: (picture: Blob) => Promise<StoredPicture>;
    /**
     * Saves the scenarios, in order, sending only the changed ones. held is every background undo
     * and redo can still bring back, so its picture is kept. Missing in the demo.
     */
    save?: (scenarios: Scenario[], changed: Scenario[], held: string[]) => Promise<void>;
    /** Frees the map pictures only undo could still bring back, as the editor closes. */
    release?: () => Promise<void>;
}

/**
 * A saved session being played, handed to the editor by components/SessionEditor.tsx, see
 * convex/play.ts. The demo has none and previews play mode with two test players.
 */
export interface Live
{
    /** For the table screen's door changes, see services/tableChannel.ts. */
    sessionId: string;
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
    /** Sets any token's HP, AC and Perception. */
    setStats: (tokenId: string, stats: Stats) => Promise<void>;
    /** Sets any token's conditions, see Condition. */
    setConditions: (tokenId: string, conditions: Condition[]) => Promise<void>;
    /** The last attack or heal, null before any, see SharedHit. */
    lastHit: SharedHit | null;
    /** Deals damage to tokens, or heals them, see hit in convex/play.ts. */
    hit: (tokenIds: string[], kind: HitKind, amount: number) => Promise<void>;
    /** What killed monsters left on the map being played, see Decal. */
    decals: Decal[];
    /** Clears them off the map being played. */
    clearDecals: () => Promise<void>;
    /** What the party has seen of the map being played, null until anything has been. */
    fog: SharedFog | null;
    /**
     * Adds what the table screen has seen to it. Only the game master's screen sends this. With
     * forget it replaces it, as the game master hid some, and every screen starts over from it.
     */
    saveFog: (fog: SharedFog, forget?: boolean) => Promise<void>;
    /** Forgets what everyone has seen of the map being played. */
    resetFog: () => Promise<void>;
    /** The last ping on the map being played, undefined while it loads, see Ping. */
    ping: Ping | null | undefined;
    /** Flashes a spot of the map being played on every screen. */
    sendPing: (at: Point) => Promise<void>;
    /** The paths players are drawing on other screens, see Draft. */
    drafts: Draft[];
    /** Shares a player's path as it is drawn, or drops it with null. */
    draw: (tokenId: string, points: Point[] | null, feet: number) => Promise<void>;
    /** The rulers and areas players are dragging out, see Mark. */
    marks: SharedMark[];
    /** Shares the game master's ruler or area as it is dragged, or drops it with null. */
    mark: (mark: Mark | null) => Promise<void>;
    /** How the fog looks on every screen, null until the game master changes it. */
    fogLook: FogSettings | null;
    setFogLook: (look: FogSettings) => Promise<void>;
    /** Which blood every screen shows, null until the game master changes it. */
    blood: BloodSettings | null;
    setBlood: (blood: BloodSettings) => Promise<void>;
    system: GameSystem;
    setSystem: (system: GameSystem) => Promise<void>;
}

/**
 * The game a session is played in, set in the gear's Table tab. It only changes what the games
 * do differently, see Game system in PLAN.md. Other plays as 5e.
 */
export type GameSystem = '5e' | 'pf2e' | 'other';

/**
 * Which blood shows, set by the game master for the whole table from the gear in the editor, as
 * not every group wants it. A downed token keeps its skull either way.
 */
export interface BloodSettings
{
    /** The trails badly hurt tokens leave, and the pools where monsters fell. */
    ground: boolean;
    /** The red rising in a hurt token's picture, and the drips once it is bloodied. */
    wounds: boolean;
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
 * reload shares it, see convex/play.ts. map/fog.ts's explored mask, eight
 * samples to a byte, see packSeen, as every screen reads it again after each save.
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

/**
 * A spot someone at the table flashed on every screen, see convex/play.ts. at is when, by the
 * server's clock, and tells one ping from the next.
 */
export interface Ping
{
    x: number;
    y: number;
    /** A player's ring colour. Missing for the game master's, which take the app's own. */
    color?: string;
    at: number;
}

/**
 * A player's path while it is drawn on another screen, and until it is walked or dropped, so the
 * table sees where they mean to go, see drafts in convex/play.ts.
 */
export interface Draft
{
    /** The token it belongs to. */
    id: string;
    /** Centre to centre, from where the token stands. */
    points: Point[];
    feet: number;
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
    /** Left out, the monster has no numbers and shows no damage. */
    maxHp?: number;
    ac?: number;
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
