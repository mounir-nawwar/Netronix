// Chatbot request schemas (SEC-023, SEC-005).
//
// The message cap is a cost control as much as a validation rule: every chat
// turn ships the catalog to a paid API, and before Phase 1 the request length
// was attacker-controlled as well as the request rate.

import { z } from 'zod'

/** SEC-023. 1,000 characters is the policy from the remediation plan. */
export const CHAT_MESSAGE_MAX_LENGTH = 1000

const sessionId = z
    .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
    .trim()
    .min(1, 'is required')
    .max(100, 'must be 100 characters or fewer')

export const initChatSchema = {
    body: z
        .object({
            // A caller may send nothing at all; the session is anonymous either way.
            message: z.string().max(CHAT_MESSAGE_MAX_LENGTH, `must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer`).optional(),
        })
        .strip(),
}

export const chatMessageSchema = {
    body: z
        .object({
            sessionId,
            message: z
                .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
                .min(1, 'is required')
                .max(CHAT_MESSAGE_MAX_LENGTH, `must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer`),
        })
        .strict(),
}

export const endChatSchema = {
    body: z.object({ sessionId }).strict(),
}
