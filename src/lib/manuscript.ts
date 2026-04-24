import type {
  ManuscriptDocument,
  ManuscriptSegment,
  ProjectFile,
  SavePayload,
} from "./types";

const FILE_SEPARATOR = "";

export const fileTitleFor = (relativePath: string): string => {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  return withoutExtension.replace(/^\d+[_\-\s]+/, "");
};

export const buildManuscriptDocument = (
  files: ProjectFile[],
  selectedPaths: string[],
): ManuscriptDocument => {
  const selectedSet = new Set(selectedPaths);
  const chosen = files.filter((file) => selectedSet.has(file.path));
  const parts: string[] = [];
  const segments: ManuscriptSegment[] = [];
  let position = 0;

  for (const file of chosen) {
    if (parts.length > 0) {
      parts.push(FILE_SEPARATOR);
      position += FILE_SEPARATOR.length;
    }

    const from = position;
    parts.push(file.content);
    position += file.content.length;

    segments.push({
      path: file.path,
      relativePath: file.relativePath,
      from,
      to: position,
    });
  }

  return {
    manuscript: parts.join(""),
    segments,
  };
};

export const splitManuscript = (
  manuscript: string,
  segments: ManuscriptSegment[],
): SavePayload[] =>
  segments.map((segment) => ({
    path: segment.path,
    content: manuscript.slice(segment.from, segment.to),
  }));
