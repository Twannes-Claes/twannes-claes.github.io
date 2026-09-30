import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faBolt,
    faDroplet,
    faFire,
    faGear,
    faHandFist,
    faLeaf,
    faMoon,
    faMountain,
    faSkull,
    faStar,
    faSun,
    faWandSparkles,
    faWind,
} from '@fortawesome/free-solid-svg-icons';

export interface Element
{
    name: string;
    /** Drives the card glow, the medallion and the filter chip. */
    color: string;
    icon: IconDefinition;
}

/** In the order the games list them, which is also the order of the filter chips. */
export const elements: Element[] = [
    { name: 'Magic', color: '#b05cf0', icon: faWandSparkles },
    { name: 'Tech', color: '#f39a1f', icon: faGear },
    { name: 'Water', color: '#2f93f0', icon: faDroplet },
    { name: 'Fire', color: '#f0472d', icon: faFire },
    { name: 'Earth', color: '#b07a3c', icon: faMountain },
    { name: 'Air', color: '#7fd8f7', icon: faWind },
    { name: 'Life', color: '#63c93c', icon: faLeaf },
    { name: 'Undead', color: '#9aa0bd', icon: faSkull },
    { name: 'Light', color: '#ffd84a', icon: faSun },
    { name: 'Dark', color: '#6b53a3', icon: faMoon },
    { name: 'Kaos', color: '#e0369a', icon: faBolt },
];

/** For figures the wiki gives no element, gold like the rest of the frame. */
export const unknownElement: Element = { name: '', color: '#f5c542', icon: faStar };

/**
 * Giants are a size class, not an element, and still have an element of their own. They get a
 * tag and a filter chip that look like an element's.
 */
export const giant: Element = { name: 'Giants', color: '#5ee0b0', icon: faHandFist };

export function elementFor(name: string): Element
{
    return elements.find((element) => element.name === name) ?? unknownElement;
}
