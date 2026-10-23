import { useState } from 'react';

/**
 * Which row of a list is open under itself, one at a time, see RowEditor, and the one closing,
 * which stays until its editor has folded away. Opening another folds the last one meanwhile.
 */
export function useOpenRow()
{
    const [open, setOpen] = useState<string | null>(null);
    const [closing, setClosing] = useState<string | null>(null);

    const toggle = (id: string) =>
    {
        setClosing(open);
        setOpen(open === id ? null : id);
    };

    return { open, closing, toggle, folded: () => setClosing(null) };
}
