import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

/**
 * One MSW server for the whole suite. `onUnhandledRequest: 'error'` means any
 * request the handlers do not cover fails the test loudly, rather than escaping
 * to the real network.
 */
export const server = setupServer(...handlers)
