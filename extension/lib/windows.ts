// Opening the extension's own windows (Matrix, AE menu editor, team editor)
// from any of its pages, one window each: an open one is focused instead.

async function openOnce(path: string, width: number, height: number): Promise<void> {
  const url = chrome.runtime.getURL(path);
  const [open] = await chrome.tabs.query({ url: `${url}*` });
  if (open?.windowId !== undefined) {
    if (open.url !== url && open.id !== undefined) await chrome.tabs.update(open.id, { url });
    await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  await chrome.windows.create({ url, type: 'popup', width, height });
}

export const openMatrix = () => openOnce('matrix.html', 1280, 900);
export const openAeMenuEditor = () => openOnce('aemenu.html', 1100, 900);
export const openTeamEditor = () => openOnce('team.html', 1200, 950);
