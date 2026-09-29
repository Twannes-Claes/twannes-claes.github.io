import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface SectionHeadingProps {
  id?: string;
  children: React.ReactNode;
  icon: IconDefinition;
}

/** The <h2> with the leading rule and a trailing icon pushed to the far edge. */
export function SectionHeading({ id, children, icon }: SectionHeadingProps) {
  return (
    <h2 id={id} className="section-heading">
      {children}
      <FontAwesomeIcon icon={icon} />
    </h2>
  );
}
