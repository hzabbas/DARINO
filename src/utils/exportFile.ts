import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface ExportFileResult {
  /** True if native share sheet opened, false if web download or unavailable. */
  shared: boolean;
  uri: string | null;
}

/**
 * Save text file to cache and open native share sheet, or trigger web download.
 */
export async function shareTextFile(
  fileName: string,
  content: string,
  mimeType: string,
  dialogTitle: string,
): Promise<ExportFileResult> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return { shared: false, uri: null };
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.writeSync(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: 'public.comma-separated-values-text' });
    return { shared: true, uri: file.uri };
  }

  return { shared: false, uri: file.uri };
}
