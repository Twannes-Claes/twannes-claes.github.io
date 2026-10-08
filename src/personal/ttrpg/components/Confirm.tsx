import { useEffect, useRef, useState } from 'react';

import { setAsker, type Question } from '../services/confirm';

/** The one dialog every confirmAction shows in, mounted once in the Shell. */
export function ConfirmHost()
{
    const [question, setQuestion] = useState<Question | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() =>
    {
        setAsker(setQuestion);

        return () =>
        {
            setAsker(null);
        };
    }, []);

    useEffect(() =>
    {
        if (question)
            dialog.current?.showModal();
    }, [question]);

    const answer = (yes: boolean) =>
    {
        question?.answer(yes);
        setQuestion(null);
        dialog.current?.close();
    };

    return (
        <dialog
            ref={dialog}
            className="ttrpg-confirm"
            // Esc closes the dialog on its own; this still answers no.
            onCancel={(event) =>
            {
                event.preventDefault();
                answer(false);
            }}
            onClick={(event) =>
            {
                if (event.target === event.currentTarget)
                    answer(false);
            }}
        >
            {question && (
                <div className="ttrpg-confirm__card">
                    <p>{question.message}</p>
                    <div className="ttrpg-confirm__actions">
                        <button type="button" className="ttrpg-button" onClick={() => answer(false)}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="ttrpg-button ttrpg-button--danger"
                            autoFocus
                            onClick={() => answer(true)}
                        >
                            {question.action}
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
