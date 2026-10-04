function assetUrl(filename: string | undefined, variable: string) {
  if (!filename) throw new Error(`${variable} must be set to a filename from public/assets.`);
  return `/assets/${filename.replace(/^\/+/, "")}`;
}

export const branding = {
  logoLight: assetUrl(process.env.NEXT_PUBLIC_LOGO_LIGHT, "NEXT_PUBLIC_LOGO_LIGHT"),
  logoDark: assetUrl(process.env.NEXT_PUBLIC_LOGO_DARK, "NEXT_PUBLIC_LOGO_DARK"),
  faviconLight: assetUrl(process.env.NEXT_PUBLIC_FAVICON_LIGHT, "NEXT_PUBLIC_FAVICON_LIGHT"),
  faviconDark: assetUrl(process.env.NEXT_PUBLIC_FAVICON_DARK, "NEXT_PUBLIC_FAVICON_DARK"),
};
