import { Outlet, ScrollRestoration } from 'react-router-dom';

/**
 * Wraps every page so scroll handling lives in one place. ScrollRestoration
 * opens a new page at the top and puts back the offset you left behind when you
 * go back, which is what returns you to the project you clicked.
 */
export function Layout()
{
    return (
        <>
            <ScrollRestoration />
            <Outlet />
        </>
    );
}
