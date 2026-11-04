import type { Product, ProductImage } from '@mavundla/shared';

/** Prefer sorted cover with a public URL; ignore placeholder paths. */
export function primaryProductImage(product: Pick<Product, 'images'>): ProductImage | undefined {
  const images = [...(product.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return images.find((img) => img.url && !img.path.includes('/placeholder.')) ?? images.find((img) => img.url);
}

export function primaryProductImageUrl(product: Pick<Product, 'images'>): string | undefined {
  return primaryProductImage(product)?.url;
}
