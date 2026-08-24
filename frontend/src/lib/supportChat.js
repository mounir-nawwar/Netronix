// Opening the support chat from somewhere that is not the chat button.
//
// Contact's "Live Tech Support" card promised a chat and linked to `#`. The
// chat it was promising already exists — `ChatBotWidget` renders it — but the
// widget owns `isOpen` privately and sits outside Contact's tree, so there is
// no prop to pass. A window event is the smallest thing that connects them
// without lifting that state into a context every route would re-render on.

const OPEN_SUPPORT_CHAT = 'netronix:open-support-chat'

/** Ask the chat widget to open. No-op if the widget is not mounted. */
export function openSupportChat() {
    window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_CHAT))
}

/** Subscribe the widget. Returns the unsubscribe function for an effect. */
export function onOpenSupportChat(handler) {
    window.addEventListener(OPEN_SUPPORT_CHAT, handler)
    return () => window.removeEventListener(OPEN_SUPPORT_CHAT, handler)
}
