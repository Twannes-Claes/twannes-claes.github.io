import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';
import '@fortawesome/fontawesome-svg-core/styles.css';

import { config } from '@fortawesome/fontawesome-svg-core';
import { ViteReactSSG } from 'vite-react-ssg';

import { trackPageViews } from './analytics';
import { routes } from './routes';
import './styles/index.css';

// Font Awesome adds its own stylesheet from JavaScript, which only lands after the
// first paint, so every icon showed at its full SVG size for a moment. The import
// above puts those rules in the prerendered head instead.
config.autoAddCss = false;

export const createRoot = ViteReactSSG({ routes }, ({ router, isClient }) =>
{
    if (isClient && router)
        trackPageViews(router);

});
