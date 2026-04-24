export type ProjectFile = {
  path: string;
  relativePath: string;
  content: string;
};

export type SavePayload = {
  path: string;
  content: string;
};

export type SaveResult = {
  files: ProjectFile[];
  pathMap: PathMapping[];
};

export type SceneMetadata = {
  emoji?: string;
};

export type ProjectMetadata = {
  scenes: Record<string, SceneMetadata>;
};

export type ManuscriptSegment = {
  path: string;
  relativePath: string;
  from: number;
  to: number;
};

export type ManuscriptDocument = {
  manuscript: string;
  segments: ManuscriptSegment[];
};

export type PathMapping = {
  oldPath: string;
  newPath: string;
};

export type ReorderResult = {
  files: ProjectFile[];
  pathMap: PathMapping[];
};

export type CreateAndInsertResult = ReorderResult & {
  createdPath: string;
};

export type AppSettings = {
  lastOpenedFolder: string | null;
};
