import type { Project } from '../types';

export const vintecc: Project = {
    slug: 'vintecc',
    title: 'Vintecc - Digital Twin Engineer',
    category: 'Professional Work',
    active: true,
    order: 1,
    cardImage: '/assets/projects/vintecc/cover.svg',
    tags: ['Unity', 'C#', 'DOD/ECS', 'CI/CD', 'Docker'],
    sections:
    [
        {
            label: 'The Role',
            body: (
                <>
                    From October 2025 to September 2026, I worked as a Digital Twin Engineer at
                    Vintecc, building and maintaining tooling around{' '}
                    <strong>
                        a custom Unity-based DOD/ECS architecture with a full dependency injection
                        system
                    </strong>
                    . A digital twin is essentially a virtual version of a real machine, sending and
                    receiving the same commands as if it were hooked up to the real thing, so
                    performance and reliability were always front and center.
                </>
            ),
        },
        {
            label: 'Key Projects',
            body: (
                <>
                    My main focus was <strong>building and maintaining digital twins</strong>, along
                    with several supporting services written in C#, Python, and C++. This meant
                    working closely with industrial engineers to understand how each machine should
                    actually behave, then translating that into the simulation, keeping it accurate,
                    performant, and easy for the rest of the team to build on top of.
                </>
            ),
        },
        {
            label: 'Other Work',
            body: (
                <>
                    Alongside that, I also worked on a reflection-based tool that auto-generates
                    interfaces directly from engineers&apos; code, cutting out a lot of manual,
                    error-prone setup work, an interactive demo used at trade expos, and{' '}
                    <strong>
                        a full-stack client application that&apos;s now used in production
                    </strong>
                    .
                </>
            ),
        },
        {
            label: 'Day-to-Day',
            body: (
                <>
                    I provided ongoing support across the codebase: bug fixes, refactoring, editor
                    scripting, and CI/CD pipelines built with Docker.
                </>
            ),
        },
    ],
    images: [{ src: '/assets/projects/vintecc/cover.svg' }],
};
