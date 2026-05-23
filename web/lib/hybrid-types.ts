export type PanoramaSceneInput = {
  id?: string;
  name: string;
  imageUrl: string;
  sortOrder?: number;
};

export type HotspotInput = {
  id?: string;
  label: string;
  x: number;
  y: number;
  z: number;
  panoramaSceneId?: string | null;
};

export type PanoramaScenePublic = {
  id: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
};

export type HotspotPublic = {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  panoramaSceneId: string | null;
};
