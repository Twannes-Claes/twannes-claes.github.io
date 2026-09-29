import type { RouteRecord } from 'vite-react-ssg';

import Skylanders from './personal/skylanders/pages/Skylanders';
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
            // Private, not linked from anywhere, see the page for how it is locked.
            {
                path: 'skylanders',
                element: <Skylanders />,
                entry: 'src/personal/skylanders/pages/Skylanders.tsx',
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
