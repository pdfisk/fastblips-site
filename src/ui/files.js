// Reading and writing source files from the browser.
//
// Where the File System Access API is available (Chrome, Edge), files are
// opened and saved in place through file handles, so Save writes back to the
// file that was opened. Elsewhere, Open uses a file input and Save downloads
// the file under its name.

const hasPickers = () => typeof window !== 'undefined'
  && typeof window.showOpenFilePicker === 'function'
  && typeof window.showSaveFilePicker === 'function';

/**
 * Asks the user for a file to open.
 * @param {{description: string, accept: Record<string, string[]>}[]} types
 * @returns {Promise<{name: string, text: string, handle: object|null}|null>}
 *   null if the user cancelled
 */
export async function openFile(types) {
  if (hasPickers()) {
    try {
      const [handle] = await window.showOpenFilePicker({ types, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      throw err;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = types.flatMap((t) => Object.values(t.accept).flat()).join(',');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Saves text. With a handle, writes to that file; otherwise asks where to
 * save it (or, without the pickers, downloads it).
 * @returns {Promise<{name: string, handle: object|null}|null>} null if cancelled
 */
export async function saveFile(text, { name, handle = null, types = [] } = {}) {
  if (handle) {
    await write(handle, text);
    return { name: handle.name ?? name, handle };
  }
  if (hasPickers()) {
    try {
      const picked = await window.showSaveFilePicker({ suggestedName: name, types });
      await write(picked, text);
      return { name: picked.name, handle: picked };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      throw err;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, handle: null };
}

async function write(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
