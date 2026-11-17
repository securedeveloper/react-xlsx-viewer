/// <reference types="node" />
// Real-browser tests (test/browser) with Vitest browser mode and Playwright Chromium.
//   npm run test:browser
// XLV_CHROMIUM points Playwright at a local Chromium binary instead of its own download.
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const executablePath = process.env['XLV_CHROMIUM'];

/** Switches prefers-color-scheme for the page, so the axe audit covers the dark theme (test/browser/a11y). */
const emulateColorScheme: BrowserCommand<['light' | 'dark']> = async (ctx, scheme) => {
  if (ctx.provider.name !== 'playwright') throw new Error('emulateColorScheme needs the Playwright provider');
  await ctx.page.emulateMedia({ colorScheme: scheme });
};

/** One node of Chromium's accessibility tree, as a screen reader gets it (test/browser/a11y-tree). */
export interface AxNode {
  role: string;
  name: string;
  description: string;
  value: string;
  /** Selected properties: focused, selected, readonly, multiselectable, disabled, expanded, modal, live, atomic,
   * rowindex, colindex, rowspan, colspan, rowcount, colcount, setsize, posinset, … (whatever Chromium reports). */
  props: Record<string, string | number | boolean>;
}
export interface AxSnapshot {
  /** The focused node, then its ancestors up to the document (ignored nodes skipped). */
  focus: AxNode[];
  /** Every live region (role status/alert/log or aria-live) with its current text. */
  live: AxNode[];
}

/**
 * Chromium's accessibility tree for the test frame, over the DevTools protocol: the focused node with its
 * ancestors, and the live regions. This is what the platform accessibility APIs hand to screen readers.
 */
const axSnapshot: BrowserCommand<[]> = async (ctx): Promise<AxSnapshot> => {
  if (ctx.provider.name !== 'playwright') throw new Error('axSnapshot needs the Playwright provider');
  const frame = await ctx.frame();
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  try {
    const { frameTree } = (await cdp.send('Page.getFrameTree')) as { frameTree: FrameTree };
    const find = (t: FrameTree): string | undefined => (t.frame.url === frame.url() ? t.frame.id : t.childFrames?.map(find).find(Boolean));
    const frameId = find(frameTree);
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree', frameId ? { frameId } : {})) as { nodes: RawAx[] };
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const simple = (n: RawAx): AxNode => ({
      role: String(n.role?.value ?? ''),
      name: String(n.name?.value ?? ''),
      description: String(n.description?.value ?? ''),
      value: String(n.value?.value ?? ''),
      props: Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value?.value as string | number | boolean])),
    });
    const text = (n: RawAx): string => {
      const own = n.role?.value === 'StaticText' ? String(n.name?.value ?? '') : '';
      return own + (n.childIds ?? []).map((id) => byId.get(id)).filter((c): c is RawAx => !!c).map(text).join('');
    };
    // The document reports focus too; the deepest focused node (last in tree order) is the element.
    const focused = [...nodes].reverse().find((n) => !n.ignored && n.properties?.some((p) => p.name === 'focused' && p.value?.value === true));
    const focus: AxNode[] = [];
    for (let n = focused; n; n = n.parentId ? byId.get(n.parentId) : undefined) if (!n.ignored) focus.push(simple(n));
    const live = nodes
      .filter((n) => !n.ignored && (['status', 'alert', 'log'].includes(String(n.role?.value)) || n.properties?.some((p) => p.name === 'live' && p.value?.value !== 'off')))
      .map((n) => ({ ...simple(n), name: simple(n).name || text(n) }));
    return { focus, live };
  } finally {
    await cdp.detach();
  }
};
interface FrameTree {
  frame: { id: string; url: string };
  childFrames?: FrameTree[];
}
interface RawAx {
  nodeId: string;
  ignored: boolean;
  role?: { value: unknown };
  name?: { value: unknown };
  description?: { value: unknown };
  value?: { value: unknown };
  properties?: Array<{ name: string; value?: { value: unknown } }>;
  parentId?: string;
  childIds?: string[];
}

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['test/browser/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(executablePath ? { launchOptions: { executablePath } } : {}),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
      commands: { emulateColorScheme, axSnapshot },
    },
  },
});

export default config;
