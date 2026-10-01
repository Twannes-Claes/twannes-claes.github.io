import type { Project } from '../types';

export const dotsResearchGame: Project = {
    slug: 'dots-research-game',
    title: 'DOTS/ECS Research',
    category: 'Game Dev',
    active: true,
    order: 12,
    cardImage: '/assets/projects/dots-research/card.webp',
    tags: ['Unity', 'C#', 'DOP', 'Netcode'],
    sections:
    [
        {
            label: 'The Research',
            body: (
                <>
                    <p>
                        In my free time, I&apos;ve been researching Unity DOTS and data-oriented
                        programming, to get a deeper understanding of how it works under the hood
                        and how it compares to Unity&apos;s traditional GameObject-based approach.
                    </p>
                    <p>
                        Alongside the research, I&apos;ve been building a small game designed to
                        benefit from DOTS&apos;s performance gains, learning the framework hands-on
                        as I go. Once the core gameplay is in place, I&apos;m planning to add
                        DOTS&apos;s multiplayer netcode for a co-op mode.
                    </p>
                </>
            ),
        },
        {
            label: 'Career Impact',
            body: (
                <>
                    <p>
                        This side project turned out to be more than just research, it directly
                        shaped my career. The hands-on understanding of data-oriented design and ECS
                        I built up here is what helped me land two jobs:
                    </p>
                    <ul className="prose-list">
                        <li>
                            <strong>The Pack</strong>, a freelance role working on their Unity
                            DOTS-based game, where I could contribute to the ECS codebase from day
                            one
                        </li>
                        <li>
                            <strong>Vintecc</strong>, a role where the entire architecture was built
                            around a custom DOD/ECS system with its own dependency injection
                            framework; understanding data-oriented design and ECS at its core made a
                            real difference there
                        </li>
                    </ul>
                    <p>
                        The project itself has been on hold since, mostly because I&apos;ve been
                        getting hands-on ECS/DOD experience in the field instead, which, in a way,
                        is this research paying off exactly as intended.
                    </p>
                </>
            ),
        },
    ],
    images: [{ src: '/assets/projects/dots-research/card.webp' }],
};
