/**
 * Remove Vercel's system environment variables before Vite collects them.
 *
 * The problem
 * -----------
 * Vercel's "Automatically expose System Environment Variables" setting injects
 * its build metadata **already `VITE_`-prefixed**, and Vite statically inlines
 * every `VITE_*` variable into `import.meta.env` in the client bundle whether or
 * not a single line of application code reads it. Nothing in this app reads one
 * — `src/config.js` uses `VITE_BACKEND_URL` and `VITE_FRONTEND_URL` and nothing
 * else — and they shipped anyway.
 *
 * Measured on the deployed storefront before this existed: nineteen keys,
 * including `VITE_VERCEL_GIT_COMMIT_MESSAGE` in full, the commit author's name
 * and GitHub login, the commit SHA, and the repository owner and slug, readable
 * by anyone who fetched the JavaScript. Commit messages on this project describe
 * authentication boundaries and the defects found in them, which is not a
 * document to serve from a public URL next to the login form.
 *
 * Why here and not in the dashboard
 * ---------------------------------
 * The dashboard toggle works, and it is worth turning off as well. It is also a
 * setting anyone with project access can turn back on, in a UI that is nowhere
 * near this code. Doing it in the build makes the guarantee a property of the
 * repository: the bundle does not carry these, whatever the project is
 * configured to hand it.
 *
 * `src/config.js` already refuses to *carry* anything that looks like a server
 * secret (DEVOPS-002). That guard only covers what that module reads; these
 * never pass through it, which is exactly how they went unnoticed.
 *
 * Called at module scope in `vite.config.js`, above `defineConfig`, because Vite
 * has already read the environment by the time any plugin hook runs.
 *
 * @param {Record<string, string|undefined>} env  defaults to `process.env`
 * @returns {string[]} the keys removed, so a build can report them
 */
export function stripVercelEnv(env = process.env) {
    const removed = []
    for (const key of Object.keys(env)) {
        if (!key.startsWith('VITE_VERCEL_')) continue
        delete env[key]
        removed.push(key)
    }
    return removed
}

export default stripVercelEnv
