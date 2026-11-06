import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** The icon settings' paths (the kit's `ICONS` and `icons.js`), read as `npm run flow-icons` reads them: the generated previews must match. */
const win: any = {};
const context = vm.createContext({ window: win });
vm.runInContext(readFileSync('widgets/spacer/public/kit.js', 'utf8'), context);
export const KIT_ICON_IDS = Object.keys(win.WidgetkeeperKit.icons);
vm.runInContext(readFileSync('widgets/spacer/public/icons.js', 'utf8'), context);
export const FLOW_ICON_PATHS: Record<string, { d: string, fill?: boolean }> = win.WidgetkeeperKit.icons;
