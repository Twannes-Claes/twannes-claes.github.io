import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, type CSSProperties } from 'react';

import { useSecretEntrance } from '../../personal/skylanders/entrance/useSecretEntrance';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle()
{
    const { theme, toggleTheme } = useTheme();
    // Flipping it quickly a few times opens the way to the Skylanders page.
    const { strain, flipped } = useSecretEntrance();

    const flip = useCallback(() =>
    {
        toggleTheme();
        flipped();
    }, [toggleTheme, flipped]);

    return (
        <button
            type="button"
            onClick={flip}
            aria-label="Toggle light and dark theme"
            className="theme-toggle m-0 flex items-center border-none bg-transparent p-0 text-[1.1rem] leading-none text-fg hover:text-accent"
            data-strain={strain || undefined}
            style={{ '--strain': strain } as CSSProperties}
        >
            <FontAwesomeIcon icon={theme === 'light' ? faSun : faMoon} />
        </button>
    );
}
