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
    }
}
