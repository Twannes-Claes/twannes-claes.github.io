/*
 * The Player view window on the table screen and the editor it was opened from run in the same
 * browser, so they talk over a BroadcastChannel, one per session. Doors are part of the map and
 * only the editor saves the map: a door clicked on the table screen goes to the editor, which
 * opens it like one clicked there, see MapEditor.tsx and PlayerView.tsx. Saved by the table
 * screen instead, the editor's next save would close it again.
 */

/** A door the table screen opened or closed, by its wall's id. */
export interface DoorChange
{
    scenarioId: string;
    wallId: string;
    open: boolean;
}

const channelName = (sessionId: string) => `ttrpg-table-${sessionId}`;

/** Sends a door change to the session's editor, if it is open in this browser. */
export function sendDoor(sessionId: string, door: DoorChange)
{
    const channel = new BroadcastChannel(channelName(sessionId));

    channel.postMessage(door);
    channel.close();
}

/** Hears the table screen's door changes for a session, until the returned function is called. */
export function listenForDoors(sessionId: string, listener: (door: DoorChange) => void): () => void
{
    const channel = new BroadcastChannel(channelName(sessionId));

    channel.onmessage = (event: MessageEvent<DoorChange>) => listener(event.data);

    return () => channel.close();
}
