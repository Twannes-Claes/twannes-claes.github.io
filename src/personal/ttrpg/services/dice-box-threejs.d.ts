/** The little of @3d-dice/dice-box-threejs that services/diceBox.ts uses. It ships no types. */
declare module '@3d-dice/dice-box-threejs'
{
    export default class DiceBox
    {
        /** Draws into the element the selector finds, at its size then. */
        constructor(selector: string, config: object);
        initialize(): Promise<void>;
        /** Resolves once the dice have come to rest. */
        roll(notation: string): Promise<unknown>;
        updateConfig(config: object): Promise<void>;
        renderer: { dispose(): void; forceContextLoss(): void; setPixelRatio(ratio: number): void };
        /** Half the scene's size, the walls the dice stay within. */
        display: { containerWidth: number; containerHeight: number };
        /** Works out each die's throw, which roll then plays, see spreadThrows. */
        startClickThrow(notation: string): { vectors: DieThrow[] } | undefined;
    }

    /** Where a die starts, how fast it flies and how it spins. */
    export interface DieThrow
    {
        pos: { x: number; y: number };
        velocity: { x: number; y: number };
        angle: { x: number; y: number };
    }
}
