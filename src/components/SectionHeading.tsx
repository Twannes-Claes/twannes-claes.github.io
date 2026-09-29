import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ReactNode } from 'react';

interface SectionHeadingProps
{
    children: ReactNode;
    icon: IconDefinition;
}

/** Section h2: a rule before the text, an icon pushed to the far right. */
export function SectionHeading({ children, icon }: SectionHeadingProps)
{
    return (
        <h2 className="section-heading">
            {children}
            <FontAwesomeIcon icon={icon} />
        </h2>
    );
}
