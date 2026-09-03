import Image from "next/image";

type NexoLogoProps = {
  compact?: boolean;
  priority?: boolean;
  className?: string;
};

export function NexoLogo({
  compact = false,
  priority = false,
  className = "",
}: NexoLogoProps) {
  if (compact) {
    return (
      <Image
        src="/nexo-gestao-icon.png"
        alt="Nexo Gestão"
        width={355}
        height={338}
        priority={priority}
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    <Image
      src="/nexo-gestao-horizontal.png"
      alt="Nexo Gestão"
      width={490}
      height={150}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
