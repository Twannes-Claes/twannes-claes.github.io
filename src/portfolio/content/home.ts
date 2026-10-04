import { faGithub, faLinkedin } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faFileLines } from '@fortawesome/free-solid-svg-icons';

import type { ProjectLink } from './types';

export const contactLinks: ProjectLink[] = [
    { url: 'mailto:twannes.claes@outlook.com', icon: faEnvelope, text: 'E-mail me' },
    { url: '/assets/documents/CV_TwannesClaes.pdf', icon: faFileLines, text: 'Check out my CV' },
    {
        url: 'https://github.com/Twannes-Claes?tab=repositories',
        icon: faGithub,
        text: 'Explore my GitHub repos',
    },
    {
        url: 'https://www.linkedin.com/in/twannes-claes-b4a762232/',
        icon: faLinkedin,
        text: 'Connect with me on LinkedIn',
    },
];
