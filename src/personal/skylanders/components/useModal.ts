import { useEffect, useRef, type MouseEvent } from 'react';

/**
 * Shows a native <dialog> as a modal while `open` is true, which handles the focus trap and
 * Escape. Spread the result onto the <dialog>.
 */
export function useModal(open: boolean, onBackdrop: () => void)
{
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        const element = ref.current;

        if (!element)
            return;

        if (open && !element.open)
            element.showModal();
        else if (!open && element.open)
            element.close();

    }, [open]);

    // A click on the dialog element itself, rather than its contents, landed on the backdrop.
    const onClick = (event: MouseEvent<HTMLDialogElement>) =>
    {
        if (event.target === event.currentTarget)
            onBackdrop();

    };

    return { ref, onClick };
}
