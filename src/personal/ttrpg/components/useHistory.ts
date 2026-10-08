import { useState } from 'react';

import { typing, useKeydown } from './useKeys';

/** How many steps back undo can go. */
const limit = 100;

interface History<T>
{
    past: T[];
    present: T;
    future: T[];
}

function undone<T>(history: History<T>): History<T>
{
    if (history.past.length === 0)
        return history;

    return {
        past: history.past.slice(0, -1),
        present: history.past[history.past.length - 1],
        future: [history.present, ...history.future],
    };
}

function redone<T>(history: History<T>): History<T>
{
    if (history.future.length === 0)
        return history;

    return {
        past: [...history.past, history.present],
        present: history.future[0],
        future: history.future.slice(1),
    };
}

/**
 * A value with undo and redo, on Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z too (Cmd on a Mac). commit
 * takes an updater, so two changes in a row before a render both land. With merge, it folds into
 * the last step instead of making a new one, so a drag is one step to undo.
 */
export function useHistory<T>(initial: () => T)
{
    const [history, setHistory] = useState<History<T>>(() => ({
        past: [],
        present: initial(),
        future: [],
    }));

    useKeydown((event) =>
    {
        const key = event.key.toLowerCase();

        // A field keeps its own undo, for the text typed into it.
        if (!(event.ctrlKey || event.metaKey) || typing(event))
            return;

        if (key === 'z' && !event.shiftKey)
            setHistory(undone);
        else if (key === 'y' || (key === 'z' && event.shiftKey))
            setHistory(redone);
        else
            return;

        event.preventDefault();
    });

    const commit = (update: (current: T) => T, merge = false) =>
        setHistory((current) => ({
            past: merge ? current.past : [...current.past, current.present].slice(-limit),
            present: update(current.present),
            future: [],
        }));

    return {
        present: history.present,
        commit,
        undo: () => setHistory(undone),
        redo: () => setHistory(redone),
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
    };
}
