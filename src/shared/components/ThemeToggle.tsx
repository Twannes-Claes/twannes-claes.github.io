import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { useTheme } from '../hooks/useTheme';

export function ThemeToggle()
{
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle light and dark theme"
            className="m-0 flex items-center border-none bg-transparent p-0 text-[1.1rem] leading-none text-fg hover:text-accent"
        >
            <FontAwesomeIcon icon={theme === 'light' ? faSun : faMoon} />
        </button>
    );
}
