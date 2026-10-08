import type { RouteRecord } from 'vite-react-ssg';

import { allProjects } from './portfolio/content/projects';
import Home from './portfolio/pages/Home';
import { ProjectPage } from './portfolio/pages/ProjectPage';
import { Layout } from './shared/components/Layout';
import NotFound from './shared/pages/NotFound';

/**
 * One concrete route per project instead of a `projects/:slug` dynamic route.
 * vite-react-ssg prerenders static routes automatically, so every project
 * becomes a real HTML file with no extra configuration.
 *
 * Every page hangs off the layout route, which handles the scroll position.
 */
export const routes: RouteRecord[] = [
    {
        path: '/',
        element: <Layout />,
        entry: 'src/shared/components/Layout.tsx',
        children: [
            {
                index: true,
                element: <Home />,
                entry: 'src/portfolio/pages/Home.tsx',
            },
            ...allProjects.map((project): RouteRecord => ({
                path: `projects/${project.slug}`,
                element: <ProjectPage project={project} />,
                entry: 'src/portfolio/pages/ProjectPage.tsx',
            })),
            // Private, not linked from anywhere, see the page for how it is locked. Lazy, so its
            // styles, fonts and wiki code stay out of the portfolio bundle.
            {
                path: 'skylanders',
                lazy: () =>
                    import('./personal/skylanders/pages/Skylanders').then((page) => ({
                        Component: page.default,
                    })),
                entry: 'src/personal/skylanders/pages/Skylanders.tsx',
            },
            // Battle maps for tabletop sessions, private like the Skylanders page, see
            // src/personal/ttrpg/PLAN.md. Three lazy routes rather than one, so phones opening
            // the join page never download the editor.
            {
                path: 'ttrpg',
                lazy: () =>
                    import('./personal/ttrpg/pages/Dashboard').then((page) => ({
                        Component: page.default,
                    })),
                entry: 'src/personal/ttrpg/pages/Dashboard.tsx',
            },
            {
                path: 'ttrpg/edit',
                lazy: () =>
                    import('./personal/ttrpg/pages/Editor').then((page) => ({
                        Component: page.default,
                    })),
                entry: 'src/personal/ttrpg/pages/Editor.tsx',
            },
            {
                path: 'ttrpg/join',
                lazy: () =>
                    import('./personal/ttrpg/pages/Join').then((page) => ({
                        Component: page.default,
                    })),
                entry: 'src/personal/ttrpg/pages/Join.tsx',
            },
            // Prerendered so the build emits a real 404.html for GitHub Pages.
            {
                path: '404',
                element: <NotFound />,
                entry: 'src/shared/pages/NotFound.tsx',
            },
            // Catches anything else on the client.
            {
                path: '*',
                element: <NotFound />,
                entry: 'src/shared/pages/NotFound.tsx',
            },
        ],
    },
];
