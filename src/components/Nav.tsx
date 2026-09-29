import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse } from '@fortawesome/free-solid-svg-icons';

import { navItems } from '../content/site';

import { ThemeToggle } from './ThemeToggle';
import { TiltButton } from './TiltButton';

interface NavProps {
  /** Shows the home button and points the section links back at the home page. */
  back?: boolean;
}

export function Nav({ back = false }: NavProps) {
  const prefix = back ? '/' : '';

  return (
    <nav className="container-page sticky top-0 z-2 bg-bg transition-colors duration-300">
      <div className="flex flex-wrap items-center gap-4 border-b border-fg">
        {back && (
          <TiltButton className="button--back" magnitude={12}>
            {/* A real navigation rather than a Link, so the browser performs the
                #projects anchor scroll on arrival. */}
            <a href="/#projects" aria-label="Back to overview">
              <FontAwesomeIcon icon={faHouse} />
            </a>
          </TiltButton>
        )}

        <ul className="ms-auto flex list-none flex-row items-center justify-end gap-[clamp(32px,2vw+16px,60px)] py-[clamp(16px,2vw+8px,24px)] text-center text-[clamp(1rem,2vw+0.5rem,1.25rem)] font-medium max-[560px]:gap-5">
          {navItems.map((item) => (
            <li key={item.href}>
              <a className="nav-link" href={`${prefix}${item.href}`}>
                <FontAwesomeIcon icon={item.icon} className="max-[560px]:text-[1.2rem]" />
                <span className="max-[560px]:hidden">{item.label}</span>
              </a>
            </li>
          ))}
          <li>
            <ThemeToggle />
          </li>
        </ul>
      </div>
    </nav>
  );
}
