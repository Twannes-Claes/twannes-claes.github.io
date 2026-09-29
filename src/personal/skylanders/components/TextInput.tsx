import type { InputHTMLAttributes } from 'react';

/** A plain text field in the site colours, shared by the password and add forms. */
export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>)
{
    return (
        <input
            {...props}
            className={[
                'w-full rounded-[5px] border-2 border-edge bg-transparent px-3 py-2 text-fg outline-none focus:border-accent',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
