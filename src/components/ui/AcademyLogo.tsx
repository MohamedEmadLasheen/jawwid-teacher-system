import { useBrandingStore } from '@/store/brandingStore';
import { cn } from '@/lib/utils';

interface AcademyLogoProps {
  /** Size in pixels for width & height (square) */
  size?: number;
  className?: string;
  /** Extra classes for the img/fallback element */
  imgClassName?: string;
  /** Show rounded-full (circle) shape */
  rounded?: boolean;
  /** Show a border ring */
  ring?: boolean;
}

/**
 * Global academy logo component.
 * Reads from brandingStore — shows the uploaded logo if available,
 * otherwise falls back to the static /assets/jawwid-logo.jpg,
 * and only as a last resort shows a styled initial.
 */
export function AcademyLogo({
  size = 40,
  className,
  imgClassName,
  rounded = true,
  ring = false,
}: AcademyLogoProps) {
  const { branding } = useBrandingStore();

  // Prefer: 1) user-uploaded base64, 2) static asset, 3) initial fallback
  const src = branding.logoDataUrl || '/assets/jawwid-logo.jpg';
  const initial = (branding.nameAr || 'ج').charAt(0);

  const shapeClass = rounded ? 'rounded-full' : 'rounded-lg';
  const ringClass = ring ? 'ring-2 ring-white/40' : '';

  return (
    <div
      className={cn('flex-shrink-0 overflow-hidden bg-secondary', shapeClass, ringClass, className)}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt="Jawwid Academy Logo"
        className={cn('w-full h-full object-cover', shapeClass, imgClassName)}
        onError={(e) => {
          // If image fails, show initial fallback
          const target = e.currentTarget;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent && !parent.querySelector('.logo-fallback')) {
            const span = document.createElement('span');
            span.className = 'logo-fallback w-full h-full flex items-center justify-center text-white font-bold';
            span.style.fontSize = `${Math.round(size * 0.4)}px`;
            span.textContent = initial;
            parent.appendChild(span);
          }
        }}
      />
    </div>
  );
}