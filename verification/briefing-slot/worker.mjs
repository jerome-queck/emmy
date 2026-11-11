import { writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [modulePath, directory, name, bytes, stopAt, checkpoint] = process.argv.slice(2);
globalThis.slotBoundary = async boundary => {
  if (boundary !== stopAt) return;
  const pending = `${checkpoint}.pending`;
  await writeFile(pending, `${JSON.stringify({ boundary, pid: process.pid })}\n`, { flag: 'wx' });
  await rename(pending, checkpoint);
  await new Promise(() => setInterval(() => {}, 1000));
};
const { publishSlot, ordinary } = await import(pathToFileURL(modulePath));
const result = await publishSlot(directory, name, bytes, {
  maximum: 16384,
  validateConflict: async (path, slot, original) => {
    if (slot !== name.slice(0, -5) || await ordinary(path, 16384) === original) throw new Error('Invalid conflict evidence');
  }
});
process.stdout.write(JSON.stringify({ result }));
