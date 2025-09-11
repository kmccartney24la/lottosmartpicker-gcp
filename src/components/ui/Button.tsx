'use client';
import clsx from 'clsx';
import { ComponentProps } from 'react';

type Props = ComponentProps<'button'> & { variant?: 'primary' | 'ghost' | 'outline' };

export default function Button({ variant='primary', className, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'outline' && 'btn-outline',
        className
      )}
    />
  );
}
