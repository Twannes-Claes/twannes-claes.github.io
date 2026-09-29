import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faEnvelope as faEnvelopeRegular,
    faFolderOpen,
    faUser,
} from '@fortawesome/free-regular-svg-icons';

export const site = {
    title: 'Twannes Claes | Portfolio',
    author: 'Twannes Claes',
    description: 'Check out my portfolio!',
    url: 'https://twannes-claes.github.io',
    ogImage: 'https://twannes-claes.github.io/assets/site/og-banner.jpg',
} as const;

export interface NavItem
{
    href: string;
    label: string;
    icon: IconDefinition;
}

/** Anchors on the home page; prefixed with "/" when shown on a project page. */
export const navItems: NavItem[] = [
    { href: '#projects', label: 'Projects', icon: faFolderOpen },
    { href: '#about', label: 'About me', icon: faUser },
    { href: '#contact', label: 'Contact & Links', icon: faEnvelopeRegular },
];
