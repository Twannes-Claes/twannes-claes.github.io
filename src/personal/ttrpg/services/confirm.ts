export interface Question
{
    message: string;
    action: string;
    answer: (yes: boolean) => void;
}

let show: ((question: Question) => void) | null = null;

/** Where questions go: the ConfirmHost while it is on the page, see components/Confirm.tsx. */
export function setAsker(asker: ((question: Question) => void) | null)
{
    show = asker;
}

/**
 * Asks in the app's own dialog rather than the browser's, so the map tools can ask too. Resolves
 * true on the action button, false on Cancel, Esc or a click beside the card. Without a
 * ConfirmHost on the page there is no one to ask, so the answer is no.
 */
export function confirmAction(message: string, action: string): Promise<boolean>
{
    return new Promise((resolve) =>
    {
        if (show)
            show({ message, action, answer: resolve });
        else
            resolve(false);
    });
}
