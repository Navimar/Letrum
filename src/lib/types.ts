export type ProjectFile = {
  path: string;
  relativePath: string;
  content: string;
};

export type SavePayload = {
  path: string;
  content: string;
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
