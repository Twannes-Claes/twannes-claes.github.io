import { Nav } from '../components/Nav';
import { Seo } from '../components/Seo';
import { TiltButton } from '../components/TiltButton';
import { site } from '../content/site';

export default function NotFound()
{
    return (
        <>
            <Seo
                title={`Page not found | ${site.author}`}
                description="This page does not exist."
            />
            <Nav back />

            <main className="container-page">
                <div className="my-[clamp(8rem,5vw+5rem,12.5rem)]">
                    <div className="tag tag--big mb-4">404</div>
                    <h1 className="mb-4 font-mono text-[clamp(1.75rem,2.25vw+1.25rem,3.75rem)] font-light">
                        Page not found
                    </h1>
                    <p className="mb-8">
                        That page does not exist. It may have been renamed or removed since you last
                        visited.
                    </p>
                    <TiltButton>
                        <a href="/#projects">Back to the projects</a>
                    </TiltButton>
                </div>
            </main>
        </>
    );
}
