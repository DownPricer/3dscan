interface Navigator {
  xr?: {
    isSessionSupported(mode: "immersive-vr" | "immersive-ar" | "inline"): Promise<boolean>;
  };
}
