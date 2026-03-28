// components/AppImage.tsx
'use client';

import Image from "next/image";
import React, { useEffect, useState } from "react";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt?: string;
  className?: string;
  fallbackSrc?: string;
};

const AppImage: React.FC<ImageProps> = ({
  src,
  alt = "Image",
  className = "",
  fallbackSrc = "/assets/images/no_image.png",
}) => {
  const [imgSrc, setImgSrc] = useState(src);
  const isDataUrl = (imgSrc || "").startsWith("data:image/");

  useEffect(() => {
    setImgSrc(src);
  }, [src]);

  const handleError = () => {
    if (imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc);
    }
  };

  if (isDataUrl) {
    return (
      <img
        src={imgSrc}
        alt={alt}
        className={className}
        onError={handleError}
      />
    );
  }

  return (
    <Image
      src={imgSrc || fallbackSrc}
      alt={alt}
      className={className}
      width={100}
      height={100}
    />
  );
};

export default AppImage;
