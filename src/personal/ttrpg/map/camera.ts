import type { Point } from '../types';

/**
 * Where the map sits on screen. A world point p lands at p * zoom + (x, y) in CSS pixels, so x
 * and y are the pan and zoom is screen pixels per world pixel.
 */
export interface Camera
{
    x: number;
    y: number;
    zoom: number;
}

interface Size
{
    width: number;
    height: number;
}

export function toWorld(camera: Camera, screen: Point): Point
{
    return { x: (screen.x - camera.x) / camera.zoom, y: (screen.y - camera.y) / camera.zoom };
}

export function toScreen(camera: Camera, world: Point): Point
{
    return { x: world.x * camera.zoom + camera.x, y: world.y * camera.zoom + camera.y };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera
{
    return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Zooms by factor, clamped to min and max, keeping the world point under `screen` in place. */
export function zoomAt(
    camera: Camera,
    screen: Point,
    factor: number,
    min: number,
    max: number,
): Camera
{
    const zoom = Math.min(max, Math.max(min, camera.zoom * factor));
    const anchor = toWorld(camera, screen);

    return { x: screen.x - anchor.x * zoom, y: screen.y - anchor.y * zoom, zoom };
}

/** The whole map centred on screen, with a small margin around it. */
export function fitCamera(map: Size, view: Size): Camera
{
    const zoom = Math.min(view.width / map.width, view.height / map.height) * 0.95;

    return {
        x: (view.width - map.width * zoom) / 2,
        y: (view.height - map.height * zoom) / 2,
        zoom,
    };
}

/** A world point in the middle of the screen, at a zoom. */
export function centerOn(point: Point, view: Size, zoom: number): Camera
{
    return { x: view.width / 2 - point.x * zoom, y: view.height / 2 - point.y * zoom, zoom };
}
