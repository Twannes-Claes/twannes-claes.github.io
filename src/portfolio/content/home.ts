import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faGithub, faLinkedin } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faFileLines } from '@fortawesome/free-solid-svg-icons';

export interface ContactLink
{
    url: string;
    icon: IconDefinition;
    text: string;
}

export const contactLinks: ContactLink[] = [
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

export const hero = {
    tag: 'Game Systems Engineer',
    heading: 'Twannes Claes',
    image: '/assets/site/home-picture.webp',
} as const;
