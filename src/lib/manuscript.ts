import type { ProjectFile, SavePayload } from "./types";

export const markerFor = (relativePath: string): string =>
  `<<< FILE: ${relativePath} >>>`;

export const parseMarker = (line: string): string | null => {
  const match = /^<<< FILE: (.+) >>>$/.exec(line);
  return match ? match[1] : null;
};

export const buildManuscript = (
  files: ProjectFile[],
  selectedPaths: string[],
): string => {
  const selectedSet = new Set(selectedPaths);
  const chosen = files.filter((file) => selectedSet.has(file.path));

  return chosen
    .map((file) => `${markerFor(file.relativePath)}\n${file.content}`)
    .join("\n\n");
};

export const splitManuscript = (
  manuscript: string,
  files: ProjectFile[],
  selectedPaths: string[],
): SavePayload[] => {
  const selectedSet = new Set(selectedPaths);
  const chosen = files.filter((file) => selectedSet.has(file.path));
  const markers = chosen.map((file) => markerFor(file.relativePath));

  const escapedMarkers = markers.map((marker) =>
    marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  const pattern = new RegExp(
    `^(?:${escapedMarkers.join("|")})$`,
    "m",
  );

  if (chosen.length === 0) {
    return [];
  }

  const lines = manuscript.replace(/\r\n/g, "\n").split("\n");
  const sections = new Map<string, string[]>();
  let currentPath: string | null = null;

  for (const file of chosen) {
    sections.set(file.path, []);
  }

  for (const line of lines) {
    const matchingIndex = markers.indexOf(line);

    if (matchingIndex !== -1) {
      currentPath = chosen[matchingIndex].path;
      continue;
    }

    if (currentPath === null) {
      if (line.trim().length === 0) {
        continue;
      }

      throw new Error("The manuscript starts before the first file marker.");
    }

    sections.get(currentPath)?.push(line);
  }

  const foundMarkers = lines.filter((line) => pattern.test(line));
  if (foundMarkers.length !== chosen.length) {
    throw new Error("Some file markers are missing or duplicated.");
  }

  return chosen.map((file) => {
    const content = (sections.get(file.path) ?? []).join("\n");

    return {
      path: file.path,
      content,
    };
  });
};
