import * as FileSystem from 'expo-file-system/legacy';
import { appJs, indexHtml, stylesCss } from './templates';

const DIR_NAME = 'ezcp-web';

export function getWebRootDir(): string {
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  return `${base}${DIR_NAME}/`;
}

function fileUriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return uri.replace(/^file:\/\//, '');
  }
  return uri;
}

export function getWebRootNativePath(): string {
  const uri = getWebRootDir();
  const path = fileUriToPath(uri);
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export async function ensureWebRootFilesAsync(): Promise<string> {
  const root = getWebRootDir();

  await FileSystem.makeDirectoryAsync(root, { intermediates: true });

  await FileSystem.writeAsStringAsync(`${root}index.html`, indexHtml, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await FileSystem.writeAsStringAsync(`${root}styles.css`, stylesCss, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await FileSystem.writeAsStringAsync(`${root}app.js`, appJs, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const dataPath = `${root}data.json`;
  const info = await FileSystem.getInfoAsync(dataPath);
  if (!info.exists) {
    await writeSharedTextAsync('');
  }

  return root;
}

export async function writeSharedTextAsync(text: string, updatedAt?: string): Promise<void> {
  const root = getWebRootDir();
  const payload = {
    text,
    size: text.length,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };

  await FileSystem.writeAsStringAsync(`${root}data.json`, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
