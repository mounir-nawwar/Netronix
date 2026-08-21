import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

import { backendUrl } from '../config'

/** Owns the admin credential and orders all asynchronous verification results. */
export function useAdminSession(client = axios) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [session, setSession] = useState({ status: 'checking', admin: null })
  const verificationGeneration = useRef(0)

  const verifySession = useCallback(async (candidate) => {
    const generation = verificationGeneration.current + 1
    verificationGeneration.current = generation

    if (!candidate) {
      setSession({ status: 'signed-out', admin: null })
      return
    }

    setSession({ status: 'checking', admin: null })
    try {
      const { data } = await client.get(`${backendUrl}/api/user/admin/session`, {
        headers: { token: candidate },
      })
      if (generation !== verificationGeneration.current) return

      if (data?.success && data.admin?.role === 'admin') {
        setSession({ status: 'signed-in', admin: data.admin })
        return
      }
      setToken('')
      localStorage.removeItem('token')
      setSession({ status: 'signed-out', admin: null })
    } catch (error) {
      if (generation !== verificationGeneration.current) return
      const status = error?.response?.status
      if (status === 401 || status === 403) {
        setToken('')
        localStorage.removeItem('token')
        setSession({ status: 'signed-out', admin: null })
        return
      }
      setSession({ status: 'unavailable', admin: null })
    }
  }, [client])

  useEffect(() => {
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
    void verifySession(token)
  }, [token, verifySession])

  const logout = useCallback(async () => {
    const current = token
    // Invalidate in flight verification synchronously, before React runs the
    // empty-token effect. A response in that gap must not reopen the console.
    verificationGeneration.current += 1
    setToken('')
    setSession({ status: 'signed-out', admin: null })
    localStorage.removeItem('token')

    if (!current) return
    try {
      await client.post(`${backendUrl}/api/user/logout`, {}, { headers: { token: current } })
    } catch {
      // Already signed out locally; nothing further to do.
    }
  }, [client, token])

  return { token, setToken, session, verifySession, logout }
}
