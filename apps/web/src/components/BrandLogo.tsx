import { Link } from 'react-router-dom';
import styles from './BrandLogo.module.scss';

type BrandLogoProps = {
  /** Compact mark for header/nav */
  variant?: 'header' | 'hero' | 'auth' | 'footer';
  to?: string;
  className?: string;
};

export function BrandLogo({ variant = 'header', to = '/', className }: BrandLogoProps) {
  const img = (
    <img
      src="/nexle-logo.png"
      alt="Nexle — Your Next Find Starts Here."
      className={`${styles.logo} ${styles[variant]}${className ? ` ${className}` : ''}`}
      decoding="async"
    />
  );

  if (variant === 'footer') {
    return img;
  }

  return (
    <Link to={to} className={styles.link} aria-label="Nexle home">
      {img}
    </Link>
  );
}
