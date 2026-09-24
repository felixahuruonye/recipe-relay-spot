import { BaseProviderAdapter } from './baseAdapter';

/**
 * CPAGrip — dynamic content locker (spec #11). The locker itself
 * supplies the offer inventory; LENORY only supplies the content
 * being unlocked and the locker ID:
 *
 *   https://cpagrip.com/locker?id=YOUR_LOCKER_ID&subid={CLICK_ID}
 */
export class CPAGripAdapter extends BaseProviderAdapter {
  constructor() {
    super('cpagrip');
  }
}

export const cpagripAdapter = new CPAGripAdapter();
