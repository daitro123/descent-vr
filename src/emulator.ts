import type { XRDevice } from 'iwer';

/**
 * Install Meta's Immersive Web Emulation Runtime so the game runs on a
 * desktop browser with no headset: an emulated Quest 3 with a DevUI overlay
 * for moving the head/controllers (and a keyboard+mouse "play mode").
 * Loaded lazily, so it never ships in the headset path.
 */
export async function installEmulator(withDevUI = true): Promise<XRDevice> {
  const [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([
    import('iwer'),
    import('@iwer/devui'),
  ]);
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  // Without the DevUI, poses are driven only by code (scripted tests).
  if (withDevUI) device.installDevUI(DevUI);
  return device;
}
