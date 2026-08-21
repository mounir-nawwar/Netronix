const KNOWN_FORM_FACTORS = ['mobile', 'desktop']
const REQUIRED_RUNS = 5

export function normaliseLighthouseOptions(env = process.env) {
    let formFactors = [...KNOWN_FORM_FACTORS]

    if (Object.prototype.hasOwnProperty.call(env, 'LH_FORM_FACTORS')) {
        const raw = String(env.LH_FORM_FACTORS ?? '')
        if (raw.trim() === '') throw new Error('LH_FORM_FACTORS must name at least one form factor')

        formFactors = raw.split(',').map((name) => name.trim()).filter(Boolean)
        const unknown = formFactors.filter((name) => !KNOWN_FORM_FACTORS.includes(name))
        if (unknown.length > 0) throw new Error(`Unknown Lighthouse form factor: ${unknown.join(', ')}`)
        if (!formFactors.includes('mobile')) {
            throw new Error('The Gate 4 Lighthouse run must include the mobile form factor')
        }
        formFactors = [...new Set(formFactors)]
    }

    return { runs: REQUIRED_RUNS, formFactors }
}

export async function assertApiHealthy(apiUrl, storefrontOrigin, fetchImpl = fetch) {
    let response
    try {
        response = await fetchImpl(`${apiUrl}/api/product/list?page=1&limit=1`, {
            headers: { Origin: storefrontOrigin },
        })
    } catch (error) {
        throw new Error(`Seeded API is unavailable: ${error?.message ?? error}`)
    }

    if (!response.ok) throw new Error(`Seeded API health check returned HTTP ${response.status}`)
    const allowedOrigin = response.headers.get('access-control-allow-origin')
    if (allowedOrigin !== storefrontOrigin) {
        throw new Error(`Seeded API CORS health check failed: expected ${storefrontOrigin}, received ${allowedOrigin ?? 'no header'}`)
    }
}

export function assertLighthousePageHealthy(lhr, apiUrl) {
    const errors = lhr?.audits?.['errors-in-console']?.details?.items ?? []
    const descriptions = errors.map((item) => String(item.description ?? ''))
    const apiFailure = descriptions.find((description) =>
        description.includes(apiUrl)
        || /CORS policy|ERR_CONNECTION_REFUSED|Error loading (product|products|tags|cart)/i.test(description))
    if (apiFailure) throw new Error(`Lighthouse captured an API error state: ${apiFailure}`)
}

export function guestCartFixture(product) {
    const inventory = product?.inventory
    const inStock = Array.isArray(inventory)
        ? inventory.find((entry) => Number(entry?.quantity) > 0 && typeof entry?.legacyKey === 'string')
        : Object.entries(inventory ?? {})
            .map(([legacyKey, quantity]) => ({ legacyKey, quantity }))
            .find((entry) => Number(entry.quantity) > 0)
    if (!product?._id || !inStock) {
        throw new Error('The Lighthouse cart fixture requires a seeded in-stock product')
    }
    return { [String(product._id)]: { [inStock.legacyKey]: 1 } }
}
