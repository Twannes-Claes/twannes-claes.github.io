import { useState, type ReactNode } from 'react';

interface RowEditorProps
{
    /**
     * What there is to change, in order, the first shown on opening. One that scrolls, like the
     * conditions, takes no height of its own and scrolls in the room the others make.
     */
    tabs: { id: string; label: string; content: ReactNode; scrolls?: boolean }[];
    /** Folding away, after which onClosed takes it off, see useOpenRow. */
    closing?: boolean;
    onClosed?: () => void;
}

/**
 * Under a row opened in a list, like a monster's or a player's: tabs for what to change, and the
 * picked one. Every tab is laid in the same place, the others unseen, so the space is as tall as
 * the tallest form whichever shows, and switching never makes the panel jump.
 */
export function RowEditor({ tabs, closing = false, onClosed }: RowEditorProps)
{
    const [picked, setPicked] = useState(tabs[0]?.id);
    const shown = tabs.find((tab) => tab.id === picked) ?? tabs[0];

    return (
        <div
            className={`ttrpg-row-edit${closing ? ' ttrpg-row-edit--closing' : ''}`}
            inert={closing}
            // Its own fold only, not one of the spinners or fades inside it.
            onAnimationEnd={(event) =>
            {
                if (closing && event.target === event.currentTarget)
                    onClosed?.();

            }}
        >
            <div className="ttrpg-tabs" role="group">
                {tabs.map((tab) => (
                    <button key={tab.id} type="button" className="ttrpg-tabs__tab" aria-pressed={tab === shown} onClick={() => setPicked(tab.id)}>
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="ttrpg-row-edit__body">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`ttrpg-row-edit__pane${tab.scrolls ? ' ttrpg-row-edit__pane--scrolls' : ''}${tab === shown ? '' : ' ttrpg-row-edit__pane--away'}`}
                        // Unseen tabs only lend their height: no focus, no screen reader.
                        inert={tab !== shown}
                    >
                        {tab.content}
                    </div>
                ))}
            </div>
        </div>
    );
}
