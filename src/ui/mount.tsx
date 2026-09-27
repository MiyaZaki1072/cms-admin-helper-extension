import { render } from 'preact';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { AwsClient } from '@/core/aws-client';
import { App } from './App';
import type { PersonRequest } from './context';
// Inlined into the shadow root: no web-accessible resource to fetch.
import styles from './styles.css?inline';

export interface HelperUi {
  toggle(): void;
  open(): void;
  close(): void;
  /** Open the tracker on one contestant. */
  openPerson(userId: number): void;
}

/** The Helper overlay, created on first open and kept mounted (hidden) after closing. */
export function createHelperUi(ctx: ContentScriptContext, client: AwsClient): HelperUi {
  let ui: Promise<ShadowRootContentScriptUi<HTMLElement>> | null = null;
  let visible = false;
  let intent: PersonRequest | null = null;

  const draw = (container: HTMLElement) => {
    render(<App client={client} visible={visible} onClose={close} intent={intent} />, container);
  };

  const onPageKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && visible) close();
  };

  function ensure() {
    ui ??= createShadowRootUi(ctx, {
      name: 'cms-admin-helper',
      css: styles,
      position: 'inline',
      anchor: 'body',
      append: 'last',
      isolateEvents: true,
      onMount: (container) => {
        draw(container);
        return container;
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    }).then((created) => {
      created.mount();
      return created;
    });
    return ui;
  }

  function redraw() {
    void ensure().then((created) => created.mounted && draw(created.mounted));
  }

  function open() {
    visible = true;
    document.addEventListener('keydown', onPageKey);
    redraw();
  }

  function close() {
    visible = false;
    document.removeEventListener('keydown', onPageKey);
    if (ui) redraw();
  }

  return {
    open,
    close,
    toggle: () => (visible ? close() : open()),
    openPerson(userId: number) {
      intent = { userId, nonce: (intent?.nonce ?? 0) + 1 };
      open();
    },
  };
}
