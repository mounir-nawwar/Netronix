import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

/** One MSW server for the whole suite; unhandled requests fail the test. */
export const server = setupServer(...handlers)
