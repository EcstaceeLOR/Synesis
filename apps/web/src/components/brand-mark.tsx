import Image from "next/image";

export function BrandMark({ size = 40 }: { readonly size?: number }) {
  return (
    <Image
      className="brand-mark"
      src="/synesis-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
    />
  );
}
