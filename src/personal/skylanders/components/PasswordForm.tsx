import { faEye, faEyeSlash, faKey } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useState, type FormEvent } from 'react';

import type { Db } from '../types';

/** The lock screen, styled as the Portal of Power the figures stand on. */
export function PasswordForm({ db }: { db: Db })
{
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    // Bumped on every failed try, so the portal remounts and shakes again.
    const [attempt, setAttempt] = useState(0);
    const [visible, setVisible] = useState(false);

    const toggle = useCallback(() => setVisible((shown) => !shown), []);

    const submit = useCallback(
        async (event: FormEvent) =>
        {
            event.preventDefault();
            setBusy(true);
            setError('');

            try
            {
                await db.signIn(password);
            }
            catch
            {
                setError('The portal does not recognise that password.');
                setAttempt((count) => count + 1);
                setBusy(false);
            }
        },
        [db, password],
    );

    return (
        <div className="sky-login">
            <div key={attempt} className={`sky-portal${error ? ' sky-portal--error' : ''}`}>
                <FontAwesomeIcon icon={faKey} className="sky-portal__icon" />
            </div>

            <p className="sky-login__hint">Place your password on the Portal of Power</p>

            <form onSubmit={submit} className="sky-panel sky-login__form">
                <div className="sky-password">
                    <input
                        type={visible ? 'text' : 'password'}
                        className="sky-input"
                        aria-label="Password"
                        placeholder="Password"
                        autoComplete="current-password"
                        spellCheck={false}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoFocus
                    />
                    <button
                        type="button"
                        className="sky-password__toggle"
                        onClick={toggle}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                    >
                        <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
                    </button>
                </div>
                <button type="submit" className="sky-btn" disabled={busy || !password}>
                    {busy ? 'Opening' : 'Unlock'}
                </button>
                {error && <p className="sky-error">{error}</p>}
            </form>
        </div>
    );
}
