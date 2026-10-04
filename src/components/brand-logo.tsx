import Image from "next/image";
import { branding } from "@/lib/branding";

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "h-11 w-auto" }: BrandLogoProps) {
  return (
    <span className="brand-logo" role="img" aria-label="PyLearn">
      <Image
        src={branding.logoLight}
        alt=""
        width={176}
        height={44}
        priority
        unoptimized
        className={`theme-logo-light ${className}`}
      />
      <Image
        src={branding.logoDark}
        alt=""
        width={176}
        height={44}
        priority
        unoptimized
        className={`theme-logo-dark ${className}`}
      />
    </span>
  );
}